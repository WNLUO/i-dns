//
//  DNSEngine.swift
//  DNSCore
//
//  Main DNS engine that coordinates all modules
//

import Foundation
import NetworkExtension
import os.log

// MARK: - DNS Engine
class DNSEngine {

    // MARK: - Components
    private let config: DNSConfig
    private let cache: DNSCache
    private let filter: DNSFilter
    private let forwarderManager: DNSForwarderManager
    private let statistics: DNSStatistics
    private let logger: DNSLogger

    // MARK: - Concurrency
    private let queryQueue = DispatchQueue(label: "com.idns.dns.query", qos: .userInitiated, attributes: .concurrent)

    // MARK: - Query Deduplication
    private var inflightQueries: Set<String> = []
    private var pendingCallbacks: [String: [(Data, UInt32)]] = [:]
    private let inflightLock = NSLock()

    // MARK: - Loop Detection
    private var queryCounter: [String: (count: Int, lastSeen: Date)] = [:]
    private let counterLock = NSLock()

    // MARK: - Cleanup Timer
    private var cleanupTimer: Timer?

    // MARK: - Logger
    private let osLogger = OSLog(subsystem: "com.idns.dns", category: "DNSEngine")

    // MARK: - Packet Output Handler
    var packetOutputHandler: ((Data, UInt32) -> Void)?

    // MARK: - Initialization

    init(config: DNSConfig? = nil) {
        // Use provided config or load from manager
        self.config = config ?? DNSConfigManager.shared.getConfig()

        // Initialize components
        self.cache = DNSCache(
            maxHotCacheSize: self.config.maxHotCacheSize,
            maxColdCacheSize: self.config.maxColdCacheSize,
            minTTL: self.config.minCacheTTL,
            maxTTL: self.config.maxCacheTTL,
            defaultTTL: self.config.defaultCacheTTL
        )

        self.filter = DNSFilter()

        self.forwarderManager = DNSForwarderManager(servers: self.config.servers)

        self.statistics = DNSStatistics(maxEntries: self.config.maxStatisticsEntries)

        self.logger = DNSLogger(
            appGroupIdentifier: self.config.appGroupIdentifier,
            maxLogCount: self.config.maxLogCount,
            retentionPeriod: self.config.logRetentionPeriod,
            minLogLevel: self.config.minLogLevel
        )

        // Start cleanup timer
        startCleanupTimer()

        os_log("DNS Engine initialized with config: %{public}@",
               log: osLogger, type: .info, self.config.description())
    }

    deinit {
        cleanupTimer?.invalidate()
    }

    // MARK: - Main Processing

    /// Process incoming DNS packet
    /// - Parameters:
    ///   - packet: UDP payload containing DNS query
    ///   - protocolNumber: IP protocol number (for response construction)
    func processPacket(_ packet: Data, protocolNumber: UInt32) {
        queryQueue.async { [weak self] in
            guard let self = self else { return }
            self._processPacket(packet, protocolNumber: protocolNumber)
        }
    }

    private func _processPacket(_ packet: Data, protocolNumber: UInt32) {
        let startTime = Date()

        // 1. Parse DNS query
        guard let query = DNSParser.parseQuery(from: packet) else {
            os_log("Failed to parse DNS query", log: osLogger, type: .error)
            return
        }

        os_log("Processing query: %{public}@ (type: %{public}@)",
               log: osLogger, type: .debug, query.domain, query.queryType.description)

        // 2. Check for special cases (DDR queries, etc.)
        if shouldBypass(query: query) {
            let response = DNSParser.createEmptyResponse(for: query)
            sendResponse(response, protocolNumber: protocolNumber)
            return
        }

        // 3. Loop detection
        if isLooping(query: query) {
            os_log("Query loop detected for %{public}@", log: osLogger, type: .warning, query.domain)
            let response = DNSParser.createServfailResponse(for: query)
            sendResponse(response, protocolNumber: protocolNumber)
            return
        }

        // 4. Query deduplication
        let queryKey = "\(query.domain)_\(query.queryType.rawValue)"
        if isDuplicate(queryKey: queryKey, packet: packet, protocolNumber: protocolNumber) {
            os_log("Duplicate query for %{public}@, waiting for in-flight request",
                   log: osLogger, type: .debug, query.domain)
            return
        }

        // 5. Apply filter
        let filterResult = filter.filter(domain: query.domain)
        if filterResult.shouldBlock {
            let latency = Date().timeIntervalSince(startTime)
            handleBlockedQuery(query: query, filterResult: filterResult,
                             latency: latency, protocolNumber: protocolNumber)
            return
        }

        // 6. Check cache
        if let cachedEntry = cache.get(domain: query.domain, queryType: query.queryType) {
            let latency = Date().timeIntervalSince(startTime)
            handleCacheHit(query: query, cachedEntry: cachedEntry,
                          latency: latency, protocolNumber: protocolNumber, queryKey: queryKey)
            return
        }

        // 7. Forward query to DNS server
        forwardQuery(query: query, startTime: startTime, protocolNumber: protocolNumber, queryKey: queryKey)
    }

    // MARK: - Query Handling

    private func handleBlockedQuery(query: DNSQuery, filterResult: FilterResult,
                                   latency: TimeInterval, protocolNumber: UInt32) {
        // Create block response
        let response = DNSParser.createBlockResponse(for: query)
        sendResponse(response, protocolNumber: protocolNumber)

        // Log event
        logger.log(
            domain: query.domain,
            queryType: query.queryType.description,
            status: "blocked",
            category: filterResult.category,
            latency: latency
        )

        // Record statistics
        statistics.record(
            domain: query.domain,
            queryType: query.queryType,
            wasBlocked: true,
            category: filterResult.category,
            latency: latency
        )

        os_log("Blocked: %{public}@ (category: %{public}@)",
               log: osLogger, type: .info, query.domain, filterResult.category)
    }

    private func handleCacheHit(query: DNSQuery, cachedEntry: DNSCacheEntry,
                               latency: TimeInterval, protocolNumber: UInt32, queryKey: String) {
        // Send cached response
        sendResponse(cachedEntry.response, protocolNumber: protocolNumber)

        // Log event
        logger.log(
            domain: query.domain,
            queryType: query.queryType.description,
            status: "allowed",
            category: cachedEntry.addresses.first ?? "cached",
            latency: latency,
            cacheHit: true
        )

        // Record statistics
        statistics.record(
            domain: query.domain,
            queryType: query.queryType,
            wasBlocked: false,
            category: "cached",
            latency: latency,
            cacheHit: true
        )

        os_log("Cache hit: %{public}@ (%.0fms)",
               log: osLogger, type: .debug, query.domain, latency * 1000)
    }

    private func forwardQuery(query: DNSQuery, startTime: Date,
                             protocolNumber: UInt32, queryKey: String) {
        forwarderManager.forward(query: query) { [weak self] result in
            guard let self = self else { return }

            let latency = Date().timeIntervalSince(startTime)

            // Remove from in-flight
            self.removeInflight(queryKey: queryKey)

            if result.isSuccess, let responseData = result.response {
                // Parse response
                guard let dnsResponse = DNSParser.parseResponse(from: responseData) else {
                    os_log("Failed to parse DNS response for %{public}@",
                           log: self.osLogger, type: .error, query.domain)
                    self.handleForwardError(query: query, latency: latency, protocolNumber: protocolNumber)
                    return
                }

                // Cache response
                if dnsResponse.isSuccess {
                    self.cache.set(
                        domain: query.domain,
                        queryType: query.queryType,
                        response: responseData,
                        addresses: dnsResponse.addresses,
                        ttl: dnsResponse.ttl
                    )
                }

                // Send response
                self.sendResponse(responseData, protocolNumber: protocolNumber)

                // Broadcast to pending queries
                self.broadcastResponse(queryKey: queryKey, response: responseData)

                // Log event
                let category = dnsResponse.addresses.first ?? "no records"
                self.logger.log(
                    domain: query.domain,
                    queryType: query.queryType.description,
                    status: "allowed",
                    category: category,
                    latency: latency
                )

                // Record statistics
                self.statistics.record(
                    domain: query.domain,
                    queryType: query.queryType,
                    wasBlocked: false,
                    category: category,
                    latency: latency
                )

                os_log("Resolved: %{public}@ -> %{public}@ (%.0fms)",
                       log: self.osLogger, type: .info, query.domain, category, latency * 1000)
            } else {
                self.handleForwardError(query: query, latency: latency, protocolNumber: protocolNumber)
            }
        }
    }

    private func handleForwardError(query: DNSQuery, latency: TimeInterval, protocolNumber: UInt32) {
        let response = DNSParser.createServfailResponse(for: query)
        sendResponse(response, protocolNumber: protocolNumber)

        logger.log(
            domain: query.domain,
            queryType: query.queryType.description,
            status: "allowed",
            category: "resolution failed",
            latency: latency,
            level: .warning
        )

        statistics.record(
            domain: query.domain,
            queryType: query.queryType,
            wasBlocked: false,
            category: "failed",
            latency: latency
        )

        os_log("Resolution failed: %{public}@", log: osLogger, type: .error, query.domain)
    }

    // MARK: - Special Cases

    private func shouldBypass(query: DNSQuery) -> Bool {
        // DDR queries
        if query.domain.contains("_dns.resolver.arpa") {
            return true
        }

        return false
    }

    // MARK: - Loop Detection

    private func isLooping(query: DNSQuery) -> Bool {
        let key = "\(query.domain)_\(query.queryType.rawValue)"

        counterLock.lock()
        defer { counterLock.unlock() }

        let now = Date()
        if let counter = queryCounter[key] {
            let timeSinceLastQuery = now.timeIntervalSince(counter.lastSeen)

            if timeSinceLastQuery < config.queryCounterResetInterval {
                let newCount = counter.count + 1
                queryCounter[key] = (newCount, now)

                if newCount > config.maxQueriesPerDomain {
                    return true
                }
            } else {
                // Reset counter
                queryCounter[key] = (1, now)
            }
        } else {
            queryCounter[key] = (1, now)
        }

        return false
    }

    // MARK: - Query Deduplication

    private func isDuplicate(queryKey: String, packet: Data, protocolNumber: UInt32) -> Bool {
        inflightLock.lock()
        defer { inflightLock.unlock() }

        if inflightQueries.contains(queryKey) {
            // Add to pending callbacks
            if pendingCallbacks[queryKey] == nil {
                pendingCallbacks[queryKey] = []
            }
            pendingCallbacks[queryKey]?.append((packet, protocolNumber))
            return true
        }

        inflightQueries.insert(queryKey)
        return false
    }

    private func removeInflight(queryKey: String) {
        inflightLock.lock()
        defer { inflightLock.unlock() }

        inflightQueries.remove(queryKey)
    }

    private func broadcastResponse(queryKey: String, response: Data) {
        inflightLock.lock()
        let callbacks = pendingCallbacks[queryKey] ?? []
        pendingCallbacks.removeValue(forKey: queryKey)
        inflightLock.unlock()

        for (_, protocolNumber) in callbacks {
            sendResponse(response, protocolNumber: protocolNumber)
        }

        if !callbacks.isEmpty {
            os_log("Broadcasted response to %d pending queries for %{public}@",
                   log: osLogger, type: .debug, callbacks.count, queryKey)
        }
    }

    // MARK: - Response Sending

    private func sendResponse(_ response: Data, protocolNumber: UInt32) {
        packetOutputHandler?(response, protocolNumber)
    }

    // MARK: - Filter Management

    func updateBlacklist(_ domains: [String: String]) {
        filter.loadBlacklist(domains)
        os_log("Updated blacklist with %d domains", log: osLogger, type: .info, domains.count)
    }

    func updateWhitelist(_ domains: [String]) {
        filter.loadWhitelist(domains)
        os_log("Updated whitelist with %d domains", log: osLogger, type: .info, domains.count)
    }

    func setChildProtectionEnabled(_ enabled: Bool) {
        filter.setChildProtectionEnabled(enabled)
        os_log("Child protection: %{public}@", log: osLogger, type: .info, enabled ? "enabled" : "disabled")
    }

    // MARK: - DNS Server Management

    func updateDNSServers(_ servers: [DNSServer]) {
        forwarderManager.updateServers(servers)
        os_log("Updated DNS servers: %d configured", log: osLogger, type: .info, servers.count)
    }

    // MARK: - Statistics

    func getStatistics() -> [String: Any] {
        return [
            "cache": cache.getStatistics(),
            "filter": filter.getStatistics(),
            "forwarder": forwarderManager.getStatistics(),
            "statistics": statistics.getOverallStatistics(),
            "logger": logger.getStatistics()
        ]
    }

    // MARK: - Cleanup

    private func startCleanupTimer() {
        cleanupTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.performCleanup()
        }
    }

    private func performCleanup() {
        os_log("Performing periodic cleanup", log: osLogger, type: .debug)

        // Clean cache
        let cacheRemoved = cache.cleanup()
        if cacheRemoved > 0 {
            os_log("Removed %d expired cache entries", log: osLogger, type: .debug, cacheRemoved)
        }

        // Clean query counters
        counterLock.lock()
        let now = Date()
        let keysToRemove = queryCounter.filter {
            now.timeIntervalSince($0.value.lastSeen) > 60
        }.map { $0.key }
        for key in keysToRemove {
            queryCounter.removeValue(forKey: key)
        }
        counterLock.unlock()

        if !keysToRemove.isEmpty {
            os_log("Removed %d old query counters", log: osLogger, type: .debug, keysToRemove.count)
        }

        // Clean logger
        logger.cleanup()

        // Clean statistics
        statistics.cleanup(olderThan: config.statisticsRetentionPeriod)

        // Sync logger
        logger.forceSync()
    }

    func shutdown() {
        cleanupTimer?.invalidate()
        forwarderManager.cancel()
        logger.forceSync()
        os_log("DNS Engine shutdown", log: osLogger, type: .info)
    }
}

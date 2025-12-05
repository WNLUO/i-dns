//
//  DNSEngineOptimized.swift
//  DNSCore
//
//  Optimized DNS engine with async logging, fast path, and improved concurrency
//  P0 Optimizations: Async logging + Fast path
//

import Foundation
import NetworkExtension
import os.log

// MARK: - DNS Engine Optimized
class DNSEngineOptimized {

    // MARK: - Components
    private let config: DNSConfig
    private let cache: DNSCacheOptimized  // Will use optimized version
    private let filter: DNSFilterOptimized  // Will use optimized version
    private let forwarderManager: DNSForwarderManager
    private let statistics: DNSStatistics
    private let logger: DNSLogger

    // MARK: - Concurrency
    private let queryQueue = DispatchQueue(label: "com.idns.dns.query", qos: .userInitiated, attributes: .concurrent)

    // P0-1: Async logging queue (background priority)
    private let loggingQueue = DispatchQueue(label: "com.idns.dns.logging", qos: .background)

    // MARK: - Query Deduplication (P0: Optimized to store less data)
    private struct PendingQuery {
        let protocolNumber: UInt32
        let transactionID: UInt16
        let originalPacket: Data  // Still need for reconstruction
    }
    private var inflightQueries: Set<String> = []
    private var pendingCallbacks: [String: [PendingQuery]] = []
    private let inflightLock = NSLock()

    // MARK: - Loop Detection
    private var queryCounter: [String: (count: Int, lastSeen: TimeInterval)] = []  // Use TimeInterval instead of Date
    private let counterLock = NSLock()

    // MARK: - Cleanup Timer
    private var cleanupTimer: Timer?

    // MARK: - Logger
    private let osLogger = OSLog(subsystem: "com.idns.dns", category: "DNSEngineOptimized")

    // MARK: - Packet Output Handler
    var packetOutputHandler: ((Data, UInt32) -> Void)?

    // MARK: - Initialization

    init(config: DNSConfig? = nil) {
        let startTime = CACurrentMediaTime()

        self.config = config ?? DNSConfigManager.shared.getConfig()

        // Initialize components
        self.cache = DNSCacheOptimized(
            maxHotCacheSize: self.config.maxHotCacheSize,
            maxColdCacheSize: self.config.maxColdCacheSize,
            minTTL: self.config.minCacheTTL,
            maxTTL: self.config.maxCacheTTL,
            defaultTTL: self.config.defaultCacheTTL
        )

        self.filter = DNSFilterOptimized()

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

        let initTime = CACurrentMediaTime() - startTime
        os_log("DNS Engine Optimized initialized in %.2fms", log: osLogger, type: .info, initTime * 1000)
    }

    deinit {
        cleanupTimer?.invalidate()
    }

    // MARK: - Main Processing with Fast Path (P0-3)

    /// Process incoming DNS packet with fast path optimization
    func processPacket(_ packet: Data, protocolNumber: UInt32) {
        queryQueue.async { [weak self] in
            guard let self = self else { return }

            // P0-3: Try fast path first (90% of queries)
            if self.tryFastPath(packet, protocolNumber: protocolNumber) {
                return  // Fast path succeeded, done!
            }

            // Slow path: full processing
            self._processPacketSlow(packet, protocolNumber: protocolNumber)
        }
    }

    // MARK: - Fast Path (P0-3)

    /// Fast path: Direct cache lookup with minimal parsing
    /// Returns true if handled, false if need slow path
    private func tryFastPath(_ packet: Data, protocolNumber: UInt32) -> Bool {
        // Quick parse: extract domain and query type without full validation
        guard let (domain, queryType, transactionID) = quickParse(packet) else {
            return false
        }

        // Check cache without stats update (stats done async later)
        guard let entry = cache.getWithoutStatsUpdate(domain: domain, queryType: queryType) else {
            return false
        }

        // Send response immediately
        sendResponse(entry.response, protocolNumber: protocolNumber)

        // P0-1: Async logging and statistics (non-blocking)
        let now = CACurrentMediaTime()
        loggingQueue.async { [weak self] in
            guard let self = self else { return }

            // Update cache statistics
            self.cache.recordHit(hot: true)  // Assume hot cache hit

            // Log event
            self.logger.log(
                domain: domain,
                queryType: queryType.description,
                status: "allowed",
                category: entry.addresses.first ?? "cached",
                latency: 0.001,  // ~1ms for fast path
                cacheHit: true,
                level: .debug
            )

            // Record statistics
            self.statistics.record(
                domain: domain,
                queryType: queryType,
                wasBlocked: false,
                category: "cached",
                latency: 0.001,
                cacheHit: true
            )
        }

        return true
    }

    /// Quick parse: Extract domain and query type without full validation
    /// Returns (domain, queryType, transactionID) or nil
    private func quickParse(_ packet: Data) -> (String, DNSQueryType, UInt16)? {
        guard packet.count >= 12 else { return nil }

        // Extract transaction ID
        let transactionID = packet.withUnsafeBytes { $0.load(fromByteOffset: 0, as: UInt16.self) }.bigEndian

        // Check if query (QR bit = 0)
        let flags = packet.withUnsafeBytes { $0.load(fromByteOffset: 2, as: UInt16.self) }.bigEndian
        guard (flags & 0x8000) == 0 else { return nil }

        // Parse domain (simplified, no compression support for fast path)
        var offset = 12
        guard let domain = parseDomainNameSimple(from: packet, offset: &offset) else { return nil }

        // Extract query type
        guard offset + 2 <= packet.count else { return nil }
        let queryTypeValue = packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }.bigEndian
        let queryType = DNSQueryType(rawValue: queryTypeValue) ?? .A

        return (domain, queryType, transactionID)
    }

    /// Simplified domain parsing (no compression for fast path)
    private func parseDomainNameSimple(from packet: Data, offset: inout Int) -> String? {
        var labels: [String] = []

        while offset < packet.count {
            let length = Int(packet[offset])

            // No compression support in fast path
            if (length & 0xC0) == 0xC0 {
                return nil  // Fall back to slow path
            }

            if length == 0 {
                offset += 1
                break
            }

            offset += 1
            guard offset + length <= packet.count else { return nil }

            // Use unsafe bytes for zero-copy
            let label = packet.withUnsafeBytes { bytes -> String? in
                let ptr = bytes.baseAddress!.advanced(by: offset)
                return String(bytesNoCopy: UnsafeMutableRawPointer(mutating: ptr),
                            length: length,
                            encoding: .utf8,
                            freeWhenDone: false)
            }

            guard let validLabel = label else { return nil }
            labels.append(validLabel)
            offset += length
        }

        return labels.isEmpty ? nil : labels.joined(separator: ".")
    }

    // MARK: - Slow Path (Full Processing)

    private func _processPacketSlow(_ packet: Data, protocolNumber: UInt32) {
        let startTime = CACurrentMediaTime()

        // 1. Parse DNS query (full validation)
        guard let query = DNSParserOptimized.parseQuery(from: packet) else {
            os_log("Failed to parse DNS query", log: osLogger, type: .error)
            return
        }

        os_log("Processing query (slow path): %{public}@ (type: %{public}@)",
               log: osLogger, type: .debug, query.domain, query.queryType.description)

        // 2. Check for special cases
        if shouldBypass(query: query) {
            let response = DNSParserOptimized.createEmptyResponse(for: query)
            sendResponse(response, protocolNumber: protocolNumber)
            return
        }

        // 3. Loop detection (optimized with CACurrentMediaTime)
        if isLooping(query: query, now: startTime) {
            os_log("Query loop detected for %{public}@", log: osLogger, type: .warning, query.domain)
            let response = DNSParserOptimized.createServfailResponse(for: query)
            sendResponse(response, protocolNumber: protocolNumber)
            return
        }

        // 4. Query deduplication
        let queryKey = "\(query.domain)_\(query.queryType.rawValue)"
        if isDuplicate(queryKey: queryKey, query: query, protocolNumber: protocolNumber) {
            os_log("Duplicate query for %{public}@, waiting for in-flight request",
                   log: osLogger, type: .debug, query.domain)
            return
        }

        // 5. Apply filter
        let filterResult = filter.filter(domain: query.domain)
        if filterResult.shouldBlock {
            let latency = CACurrentMediaTime() - startTime
            handleBlockedQuery(query: query, filterResult: filterResult,
                             latency: latency, protocolNumber: protocolNumber, startTime: startTime)
            return
        }

        // 6. Check cache (already checked in fast path, but might have been invalidated)
        if let cachedEntry = cache.get(domain: query.domain, queryType: query.queryType) {
            let latency = CACurrentMediaTime() - startTime
            handleCacheHit(query: query, cachedEntry: cachedEntry,
                          latency: latency, protocolNumber: protocolNumber, queryKey: queryKey, startTime: startTime)
            return
        }

        // 7. Forward query
        forwardQuery(query: query, startTime: startTime, protocolNumber: protocolNumber, queryKey: queryKey)
    }

    // MARK: - Query Handling (with async logging)

    private func handleBlockedQuery(query: DNSQuery, filterResult: FilterResult,
                                   latency: TimeInterval, protocolNumber: UInt32, startTime: TimeInterval) {
        // Send response immediately (critical path)
        let response = DNSParserOptimized.createBlockResponse(for: query)
        sendResponse(response, protocolNumber: protocolNumber)

        // P0-1: Async logging and statistics
        loggingQueue.async { [weak self] in
            guard let self = self else { return }

            self.logger.log(
                domain: query.domain,
                queryType: query.queryType.description,
                status: "blocked",
                category: filterResult.category,
                latency: latency
            )

            self.statistics.record(
                domain: query.domain,
                queryType: query.queryType,
                wasBlocked: true,
                category: filterResult.category,
                latency: latency
            )
        }

        os_log("Blocked: %{public}@ (category: %{public}@, %.1fms)",
               log: osLogger, type: .info, query.domain, filterResult.category, latency * 1000)
    }

    private func handleCacheHit(query: DNSQuery, cachedEntry: DNSCacheEntry,
                               latency: TimeInterval, protocolNumber: UInt32, queryKey: String, startTime: TimeInterval) {
        // Send response immediately (critical path)
        sendResponse(cachedEntry.response, protocolNumber: protocolNumber)

        // P0-1: Async logging and statistics
        loggingQueue.async { [weak self] in
            guard let self = self else { return }

            self.logger.log(
                domain: query.domain,
                queryType: query.queryType.description,
                status: "allowed",
                category: cachedEntry.addresses.first ?? "cached",
                latency: latency,
                cacheHit: true
            )

            self.statistics.record(
                domain: query.domain,
                queryType: query.queryType,
                wasBlocked: false,
                category: "cached",
                latency: latency,
                cacheHit: true
            )
        }

        os_log("Cache hit: %{public}@ (%.1fms)",
               log: osLogger, type: .debug, query.domain, latency * 1000)
    }

    private func forwardQuery(query: DNSQuery, startTime: TimeInterval,
                             protocolNumber: UInt32, queryKey: String) {
        forwarderManager.forward(query: query) { [weak self] result in
            guard let self = self else { return }

            let latency = CACurrentMediaTime() - startTime

            // Remove from in-flight
            self.removeInflight(queryKey: queryKey)

            if result.isSuccess, let responseData = result.response {
                guard let dnsResponse = DNSParserOptimized.parseResponse(from: responseData) else {
                    os_log("Failed to parse DNS response for %{public}@",
                           log: self.osLogger, type: .error, query.domain)
                    self.handleForwardError(query: query, latency: latency, protocolNumber: protocolNumber)
                    return
                }

                // Cache response (critical path)
                if dnsResponse.isSuccess {
                    self.cache.set(
                        domain: query.domain,
                        queryType: query.queryType,
                        response: responseData,
                        addresses: dnsResponse.addresses,
                        ttl: dnsResponse.ttl
                    )
                }

                // Send response (critical path)
                self.sendResponse(responseData, protocolNumber: protocolNumber)

                // Broadcast to pending queries (critical path)
                self.broadcastResponse(queryKey: queryKey, response: responseData)

                // P0-1: Async logging and statistics
                let category = dnsResponse.addresses.first ?? "no records"
                self.loggingQueue.async {
                    self.logger.log(
                        domain: query.domain,
                        queryType: query.queryType.description,
                        status: "allowed",
                        category: category,
                        latency: latency
                    )

                    self.statistics.record(
                        domain: query.domain,
                        queryType: query.queryType,
                        wasBlocked: false,
                        category: category,
                        latency: latency
                    )
                }

                os_log("Resolved: %{public}@ -> %{public}@ (%.1fms)",
                       log: self.osLogger, type: .info, query.domain, category, latency * 1000)
            } else {
                self.handleForwardError(query: query, latency: latency, protocolNumber: protocolNumber)
            }
        }
    }

    private func handleForwardError(query: DNSQuery, latency: TimeInterval, protocolNumber: UInt32) {
        let response = DNSParserOptimized.createServfailResponse(for: query)
        sendResponse(response, protocolNumber: protocolNumber)

        // P0-1: Async logging
        loggingQueue.async { [weak self] in
            guard let self = self else { return }

            self.logger.log(
                domain: query.domain,
                queryType: query.queryType.description,
                status: "allowed",
                category: "resolution failed",
                latency: latency,
                level: .warning
            )

            self.statistics.record(
                domain: query.domain,
                queryType: query.queryType,
                wasBlocked: false,
                category: "failed",
                latency: latency
            )
        }

        os_log("Resolution failed: %{public}@", log: osLogger, type: .error, query.domain)
    }

    // MARK: - Helper Methods

    private func shouldBypass(query: DNSQuery) -> Bool {
        return query.domain.contains("_dns.resolver.arpa")
    }

    private func isLooping(query: DNSQuery, now: TimeInterval) -> Bool {
        let key = "\(query.domain)_\(query.queryType.rawValue)"

        counterLock.lock()
        defer { counterLock.unlock() }

        if let counter = queryCounter[key] {
            let timeSinceLastQuery = now - counter.lastSeen

            if timeSinceLastQuery < config.queryCounterResetInterval {
                let newCount = counter.count + 1
                queryCounter[key] = (newCount, now)

                if newCount > config.maxQueriesPerDomain {
                    return true
                }
            } else {
                queryCounter[key] = (1, now)
            }
        } else {
            queryCounter[key] = (1, now)
        }

        return false
    }

    private func isDuplicate(queryKey: String, query: DNSQuery, protocolNumber: UInt32) -> Bool {
        inflightLock.lock()
        defer { inflightLock.unlock() }

        if inflightQueries.contains(queryKey) {
            if pendingCallbacks[queryKey] == nil {
                pendingCallbacks[queryKey] = []
            }
            pendingCallbacks[queryKey]?.append(PendingQuery(
                protocolNumber: protocolNumber,
                transactionID: query.transactionID,
                originalPacket: query.packet
            ))
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

        for pending in callbacks {
            sendResponse(response, protocolNumber: pending.protocolNumber)
        }

        if !callbacks.isEmpty {
            os_log("Broadcasted response to %d pending queries for %{public}@",
                   log: osLogger, type: .debug, callbacks.count, queryKey)
        }
    }

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

        let cacheRemoved = cache.cleanup()
        if cacheRemoved > 0 {
            os_log("Removed %d expired cache entries", log: osLogger, type: .debug, cacheRemoved)
        }

        // Clean query counters (use CACurrentMediaTime)
        counterLock.lock()
        let now = CACurrentMediaTime()
        let keysToRemove = queryCounter.filter {
            now - $0.value.lastSeen > 60
        }.map { $0.key }
        for key in keysToRemove {
            queryCounter.removeValue(forKey: key)
        }
        counterLock.unlock()

        if !keysToRemove.isEmpty {
            os_log("Removed %d old query counters", log: osLogger, type: .debug, keysToRemove.count)
        }

        logger.cleanup()
        statistics.cleanup(olderThan: config.statisticsRetentionPeriod)
        logger.forceSync()
    }

    func shutdown() {
        cleanupTimer?.invalidate()
        forwarderManager.cancel()
        logger.forceSync()
        os_log("DNS Engine Optimized shutdown", log: osLogger, type: .info)
    }
}

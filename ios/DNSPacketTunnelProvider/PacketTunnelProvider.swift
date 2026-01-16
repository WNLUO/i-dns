//
//  PacketTunnelProvider.swift
//  DNSPacketTunnelProvider
//
//  iDNS Family Protection VPN Extension
//

import NetworkExtension
import os.log
import Network

class PacketTunnelProvider: NEPacketTunnelProvider {

    private var blacklist: Set<String> = []
    private var whitelist: Set<String> = []

    // PERFORMANCE OPTIMIZATION: Split blacklist into exact matches and wildcards for faster lookup
    private var exactBlacklist: Set<String> = []
    private var wildcardBlacklist: [String] = []
    private var cachedRegexPatterns: [String: NSRegularExpression] = [:]
    private let blacklistLock = NSLock()

    // 本地DNS处理模式 - 不使用任何外部DNS服务商
    // DNS查询在本地进行过滤处理，然后通过系统DNS解析
    private let logger = OSLog(subsystem: "com.idns.vpn", category: "PacketTunnel")
    private var cleanupTimer: Timer?

    // Concurrency control for DNS queries - CONCURRENT queue for maximum performance
    private let queryQueue = DispatchQueue(label: "com.idns.dns.query", qos: .userInitiated, attributes: .concurrent)

    // Single shared UDP connection - reuse for all queries
    private var sharedUDPConnection: NWConnection?
    private var connectionVersion: Int = 0
    private let connectionLock = NSLock()

    // DNS Cache to reduce redundant queries
    private var dnsCache: [String: DNSCacheEntry] = [:]
    private let dnsCacheLock = NSLock()
    private let maxCacheSize = 200
    private let defaultCacheTTL: TimeInterval = 300  // 5 minutes

    // Loop detection - track query counts per domain+queryType with timestamps
    private var queryCounter: [String: (count: Int, lastSeen: Date)] = [:]
    private let queryCounterLock = NSLock()
    private let maxQueriesPerDomainType = 15
    private let queryCounterResetInterval: TimeInterval = 2.0

    // Request deduplication
    private var inflightRequests: Set<String> = []
    private let inflightRequestsLock = NSLock()
    private var pendingResponseCallbacks: [String: [(Data, UInt32)]] = [:]
    private let pendingResponseLock = NSLock()

    // DoH (DNS over HTTPS) 配置
    // 使用加密的HTTPS协议进行DNS查询，提供隐私保护
    private let dohServerURL = "https://i-dns.wnluo.com/dns-query"
    private var dohSession: URLSession!
    private var ednsDoEnabled = false

    // App Group for sharing data with main app
    private let appGroupIdentifier = "group.com.idns.wnlluo"

    // Track non-DNS packets to limit logging
    private var nonDNSPacketCount = 0

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("========================================", log: logger, type: .info)
        os_log("🚀 Starting VPN tunnel (DoH Mode)", log: logger, type: .info)
        os_log("========================================", log: logger, type: .info)

        // Initialize DoH session
        initializeDoHSession()

        // DoH模式 - 直接启动隧道
        continueStartTunnel(options: options, completionHandler: completionHandler)
    }

    private func initializeDoHSession() {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 10
        config.timeoutIntervalForRequest = 5.0
        config.timeoutIntervalForResource = 10.0
        config.requestCachePolicy = .reloadIgnoringLocalCacheData

        dohSession = URLSession(configuration: config)
        os_log("✓ DoH session initialized", log: logger, type: .info)
    }

    private func continueStartTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("Mode: DoH (DNS over HTTPS)", log: logger, type: .info)
        os_log("DoH Server: %{public}@", log: logger, type: .info, dohServerURL)

        // Load blacklist and whitelist from shared storage
        loadFilterRules()

        // Configure VPN settings
        let settings = createTunnelSettings()

        // Apply settings with retry mechanism to handle temporary network agent conflicts
        applyTunnelSettingsWithRetry(settings, attempt: 1, maxAttempts: 3, completionHandler: completionHandler)
    }

    private func applyTunnelSettingsWithRetry(_ settings: NEPacketTunnelNetworkSettings, attempt: Int, maxAttempts: Int, completionHandler: @escaping (Error?) -> Void) {
        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                let nsError = error as NSError
                // Retry on network agent errors (domain: NEVPNErrorDomain or similar)
                let shouldRetry = attempt < maxAttempts && (
                    nsError.domain == "NEVPNErrorDomain" ||
                    nsError.code == 1 || // Configuration invalid (temporary)
                    nsError.localizedDescription.contains("agent")
                )

                if shouldRetry {
                    os_log("⚠️ Failed to set tunnel settings (attempt %d/%d): %{public}@. Retrying in 1 second...",
                           log: self.logger, type: .info, attempt, maxAttempts, error.localizedDescription)

                    // Wait 1 second before retry to let network stack settle
                    DispatchQueue.global().asyncAfter(deadline: .now() + 1.0) {
                        self.applyTunnelSettingsWithRetry(settings, attempt: attempt + 1, maxAttempts: maxAttempts, completionHandler: completionHandler)
                    }
                } else {
                    os_log("❌ Failed to set tunnel settings after %d attempts: %{public}@",
                           log: self.logger, type: .error, attempt, error.localizedDescription)
                    completionHandler(error)
                }
                return
            }

            os_log("✅ VPN tunnel started successfully", log: self.logger, type: .info)

            // Start cleanup timer for DNS cache (prevent memory leak)
            self.startCleanupTimer()

            // Start reading packets
            self.startPacketFlow()
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log("Stopping VPN tunnel, reason: %{public}d", log: logger, type: .info, reason.rawValue)

        // Stop cleanup timer
        cleanupTimer?.invalidate()
        cleanupTimer = nil

        // Close shared UDP connection
        connectionLock.lock()
        sharedUDPConnection?.cancel()
        sharedUDPConnection = nil
        connectionVersion = 0
        connectionLock.unlock()

        // Clear DNS cache
        dnsCacheLock.lock()
        dnsCache.removeAll()
        dnsCacheLock.unlock()

        // Clear pending response callbacks
        pendingResponseLock.lock()
        pendingResponseCallbacks.removeAll()
        pendingResponseLock.unlock()

        // Clear inflight requests tracker
        inflightRequestsLock.lock()
        inflightRequests.removeAll()
        inflightRequestsLock.unlock()

        completionHandler()
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        os_log("Received message from main app", log: logger, type: .info)

        // Parse message from main app
        guard let message = try? JSONDecoder().decode(VPNMessage.self, from: messageData) else {
            os_log("Failed to decode message", log: logger, type: .error)
            completionHandler?(nil)
            return
        }

        switch message.type {
        case "addBlacklist":
            if let domain = message.domain {
                let normalizedDomain = domain.lowercased()
                blacklist.insert(normalizedDomain)
                saveFilterRules()

                // CACHE CLEANUP FIX: Remove cached response to ensure blocking takes effect immediately
                dnsCacheLock.lock()
                let removed = dnsCache.removeValue(forKey: normalizedDomain) != nil
                dnsCacheLock.unlock()

                os_log("Added to blacklist: %{public}@ %@", log: logger, type: .info, domain,
                       removed ? "(cache cleared)" : "")
            }

        case "removeBlacklist":
            if let domain = message.domain {
                let normalizedDomain = domain.lowercased()
                blacklist.remove(normalizedDomain)
                saveFilterRules()

                // Clear cache so next query can succeed
                dnsCacheLock.lock()
                let removed = dnsCache.removeValue(forKey: normalizedDomain) != nil
                dnsCacheLock.unlock()

                os_log("Removed from blacklist: %{public}@ %@", log: logger, type: .info, domain,
                       removed ? "(cache cleared)" : "")
            }

        case "addWhitelist":
            if let domain = message.domain {
                let normalizedDomain = domain.lowercased()
                whitelist.insert(normalizedDomain)
                saveFilterRules()

                // Clear cache to re-fetch if previously blocked
                dnsCacheLock.lock()
                let removed = dnsCache.removeValue(forKey: normalizedDomain) != nil
                dnsCacheLock.unlock()

                os_log("Added to whitelist: %{public}@ %@", log: logger, type: .info, domain,
                       removed ? "(cache cleared)" : "")
            }

        case "removeWhitelist":
            if let domain = message.domain {
                let normalizedDomain = domain.lowercased()
                whitelist.remove(normalizedDomain)
                saveFilterRules()

                // Clear cache to re-evaluate blocking rules
                dnsCacheLock.lock()
                let removed = dnsCache.removeValue(forKey: normalizedDomain) != nil
                dnsCacheLock.unlock()

                os_log("Removed from whitelist: %{public}@ %@", log: logger, type: .info, domain,
                       removed ? "(cache cleared)" : "")
            }

        case "updateDNS":
            // 本地DNS处理模式 - 忽略DNS服务器更新请求
            os_log("DNS update request ignored (Local DNS Processing Mode)", log: logger, type: .info)

        case "updateEDNS":
            if let enabled = message.ednsDoEnabled {
                ednsDoEnabled = enabled
                os_log("Updated EDNS DO setting: %{public}@", log: logger, type: .info, enabled ? "true" : "false")
            }

        default:
            os_log("Unknown message type: %{public}@", log: logger, type: .error, message.type)
        }

        completionHandler?(nil)
    }

    // MARK: - Private Methods

    private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "240.0.0.1")

        // IPv4 settings
        let ipv4Settings = NEIPv4Settings(addresses: ["240.0.0.2"], subnetMasks: ["255.255.255.0"])

        // 本地DNS处理模式 - 仅拦截DNS流量用于本地过滤
        os_log("✓ Configuring Local DNS Processing Mode", log: logger, type: .info)

        // 拦截常见DNS服务器的路由
        let googleDNS1 = NEIPv4Route(destinationAddress: "8.8.8.8", subnetMask: "255.255.255.255")
        let googleDNS2 = NEIPv4Route(destinationAddress: "8.8.4.4", subnetMask: "255.255.255.255")
        let cloudflareDNS = NEIPv4Route(destinationAddress: "1.1.1.1", subnetMask: "255.255.255.255")
        let aliDNS1 = NEIPv4Route(destinationAddress: "223.5.5.5", subnetMask: "255.255.255.255")
        let aliDNS2 = NEIPv4Route(destinationAddress: "223.6.6.6", subnetMask: "255.255.255.255")

        ipv4Settings.includedRoutes = [googleDNS1, googleDNS2, cloudflareDNS, aliDNS1, aliDNS2]

        // DoH 模式 - 不需要排除路由（DoH 使用 HTTPS 而非 UDP）
        // 所有流量通过正常网络连接，不会产生路由循环
        ipv4Settings.excludedRoutes = []

        settings.ipv4Settings = ipv4Settings

        // 设置DNS服务器 - 使用会被拦截的DNS
        let dnsSettings = NEDNSSettings(servers: ["8.8.8.8", "1.1.1.1"])
        dnsSettings.matchDomains = [""]  // 匹配所有域名
        settings.dnsSettings = dnsSettings

        os_log("========================================", log: logger, type: .info)
        os_log("✓ VPN tunnel settings configured (DoH Mode)", log: logger, type: .info)
        os_log("  Mode: DNS over HTTPS (DoH)", log: logger, type: .info)
        os_log("  DoH Server: %{public}@", log: logger, type: .info, dohServerURL)
        os_log("  DNS queries encrypted via HTTPS", log: logger, type: .info)
        os_log("  Blocked domains return NXDOMAIN", log: logger, type: .info)
        os_log("  Allowed domains forwarded to DoH server", log: logger, type: .info)
        os_log("========================================", log: logger, type: .info)

        // MTU
        settings.mtu = 1500

        return settings
    }

    private func startPacketFlow() {
        // Read packets from the virtual interface
        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self else { return }

            // Process each packet
            for (index, packet) in packets.enumerated() {
                let protocolNumber = protocols[index].uint32Value
                self.processPacket(packet, protocolNumber: protocolNumber)
            }

            // Continue reading
            self.startPacketFlow()
        }
    }

    private func processPacket(_ packet: Data, protocolNumber: UInt32) {
        // DNS-ONLY MODE: Only process DNS packets, ignore all other traffic

        // Check if this is a DNS packet (UDP port 53)
        guard let dnsQuery = parseDNSQuery(from: packet) else {
            // Not a DNS packet - ICMP (protocol 2), TCP (protocol 6), etc.
            // This is normal behavior - iOS sends these packets even in DNS-only VPN
            // Just silently drop them without logging to avoid log flooding
            // Only log first few occurrences for debugging
            nonDNSPacketCount += 1
            if nonDNSPacketCount <= 5 {
                os_log("⚠️ Received non-DNS packet #%d, size: %d, protocol: %d (will suppress further warnings)", log: logger, type: .debug, nonDNSPacketCount, packet.count, protocolNumber)
            }
            return
        }

        let domain = dnsQuery.domain.lowercased()

        // Reduce logging verbosity - only log at debug level
        // Query type: 1=A, 28=AAAA, 65=HTTPS
        os_log("📥 DNS query: %{public}@ (type: %d)", log: logger, type: .debug, domain, dnsQuery.queryType)

        // Loop detection: check if we're processing same domain+queryType too many times
        // Use domain+queryType as key to track each query type separately
        let queryKey = "\(domain)_\(dnsQuery.queryType)"
        queryCounterLock.lock()
        let now = Date()

        // Check if we have a recent counter entry for this domain+queryType
        if let entry = queryCounter[queryKey] {
            let timeSinceLastQuery = now.timeIntervalSince(entry.lastSeen)

            // If last query was more than 2 seconds ago, reset counter
            if timeSinceLastQuery > queryCounterResetInterval {
                queryCounter[queryKey] = (count: 1, lastSeen: now)
            } else {
                queryCounter[queryKey] = (count: entry.count + 1, lastSeen: now)
            }
        } else {
            queryCounter[queryKey] = (count: 1, lastSeen: now)
        }

        let count = queryCounter[queryKey]!.count
        queryCounterLock.unlock()

        if count > maxQueriesPerDomainType {
            os_log("🔴 LOOP DETECTED: %{public}@ (type %d) queried %d times in quick succession!", log: logger, type: .error, domain, dnsQuery.queryType, count)

            // CRITICAL FIX: Return cached response or SERVFAIL instead of dropping query
            // This prevents DNS timeout and improves user experience

            // Strategy 1: Try to return cached response if available
            if let cachedResponse = getCachedDNSResponse(domain: dnsQuery.domain, queryType: dnsQuery.queryType) {
                os_log("✓ Returning cached response for loop-detected query: %{public}@", log: logger, type: .info, dnsQuery.domain)

                let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
                if let responsePacket = createDNSResponsePacket(
                    originalPacket: packet,
                    dnsResponse: cachedResponse,
                    ipHeaderLength: ipHeaderLength
                ) {
                    packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
                }
                return
            }

            // Strategy 2: Return SERVFAIL to indicate temporary failure (better than timeout)
            os_log("⚠️ No cache available, returning SERVFAIL for loop-detected query: %{public}@", log: logger, type: .info, dnsQuery.domain)
            if let servfailResponse = createServfailResponse(for: packet) {
                packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            return
        }

        if count > 1 {
            os_log("  ⚠️ Query count for %{public}@ (type %d): %d (within 2s window)", log: logger, type: .debug, domain, dnsQuery.queryType, count)
        }

        // IPv6 (AAAA) queries are now supported!
        // Allow AAAA queries to be processed normally through DoH/UDP
        // The DNS server will return IPv6 addresses if available
        if dnsQuery.queryType == 28 {  // AAAA record (IPv6)
            os_log("📡 Processing IPv6 (AAAA) query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)
        }

        // Handle DDR (Discovery of Designated Resolvers) queries
        // _dns.resolver.arpa is used by iOS to detect encrypted DNS support
        // Return empty response to indicate we don't support DDR
        if domain == "_dns.resolver.arpa" {
            os_log("⏭ Skipping DDR query (Discovery of Designated Resolvers)", log: logger, type: .info)
            // Return NOERROR with 0 answers to indicate "not supported"
            if let emptyResponse = createEmptyResponse(for: packet) {
                packetFlow.writePackets([emptyResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            return
        }

        // 本地DNS处理模式 - 不需要绕过任何域名

        // DEDUPLICATION DISABLED: Removed because it was causing queries to be dropped without responses
        // iOS may send multiple queries with different transaction IDs, each needs a response
        // IPv6 filtering already reduces query volume by 50%
        // Future: Implement response caching instead of dropping duplicate queries

        // This is a DNS packet - apply filtering
        os_log("DNS query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

        // Check if domain should be blocked
        let shouldBlock = shouldBlockDomain(dnsQuery.domain)

        if shouldBlock {
            // Block by returning NXDOMAIN response immediately (本地处理)
            os_log("🚫 Blocking domain: %{public}@", log: logger, type: .info, dnsQuery.domain)
            if let blockResponse = createBlockResponse(for: packet) {
                packetFlow.writePackets([blockResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            // Send event with 0 latency for blocked domains
            sendDNSEvent(domain: dnsQuery.domain, blocked: true, latency: 0, queryType: dnsQuery.queryType)
        } else {
            // DoH模式 - 转发到DoH服务器
            os_log("✅ Allowing domain: %{public}@", log: logger, type: .info, dnsQuery.domain)
            forwardDNSQueryDoH(dnsQuery: dnsQuery, originalPacket: packet, protocolNumber: protocolNumber)
        }
    }

    /// DoH模式 - 使用HTTPS协议转发DNS查询
    private func forwardDNSQueryDoH(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        let startTime = Date()

        // 1. 检查缓存
        if let cachedResponse = getCachedDNSResponse(domain: dnsQuery.domain, queryType: dnsQuery.queryType) {
            os_log("✓ DNS cache hit: %{public}@", log: logger, type: .debug, dnsQuery.domain)

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)
            let resolvedIP = parseResolvedIP(from: cachedResponse) ?? ""

            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: cachedResponse, queryType: dnsQuery.queryType)

            if let responsePacket = createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: cachedResponse,
                ipHeaderLength: Int((originalPacket[0] & 0x0F)) * 4
            ) {
                packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            }
            return
        }

        // 2. 提取DNS查询数据
        let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard originalPacket.count > dnsStart else {
            os_log("Invalid packet size", log: logger, type: .error)
            return
        }

        let rawDnsQueryData = originalPacket.subdata(in: dnsStart..<originalPacket.count)
        let dnsQueryData = ensureEdnsForDoHQuery(rawDnsQueryData)

        // 3. 使用 DoH 查询
        os_log("📤 Sending DoH query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

        guard let url = URL(string: dohServerURL) else {
            os_log("❌ Invalid DoH URL", log: logger, type: .error)
            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "", queryType: dnsQuery.queryType)
            return
        }

        // Create HTTP POST request
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = dnsQueryData
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")

        // Execute DoH request
        let task = dohSession.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)

            // Check for errors
            if let error = error {
                os_log("❌ DoH request failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "", queryType: dnsQuery.queryType)
                return
            }

            // Check HTTP status
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                os_log("❌ DoH HTTP error: %d", log: self.logger, type: .error, httpResponse.statusCode)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "", queryType: dnsQuery.queryType)
                return
            }

            // Check response data
            guard let responseData = data, !responseData.isEmpty else {
                os_log("❌ Empty DoH response", log: self.logger, type: .error)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "", queryType: dnsQuery.queryType)
                return
            }

            os_log("✅ DoH query succeeded in %dms", log: self.logger, type: .info, latency)

            // 4. 缓存响应
            self.cacheDNSResponse(domain: dnsQuery.domain, response: responseData, queryType: dnsQuery.queryType)

            // 5. 解析IP并发送事件
            let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""
            self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: responseData, queryType: dnsQuery.queryType)

            os_log("✅ DNS resolved: %{public}@ -> %{public}@ (%dms)", log: self.logger, type: .info, dnsQuery.domain, resolvedIP, latency)

            // 6. 构建并发送响应包
            if let responsePacket = self.createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: responseData,
                ipHeaderLength: ipHeaderLength
            ) {
                self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            }
        }

        task.resume()
    }

    // MARK: - Legacy DNS Forwarding (保留但不再使用)

    // MARK: - Legacy Functions (已移除 DoH/DoT 相关代码)

    private func forwardDNSQueryUDPLegacy(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        // 重定向到 DoH 处理函数
        forwardDNSQueryDoH(dnsQuery: dnsQuery, originalPacket: originalPacket, protocolNumber: protocolNumber)
    }

    // DEPRECATED: Legacy UDP DNS forwarding code
    private func forwardDNSQueryUDPLegacyOriginal(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        let startTime = Date()

        // 1. Check cache first (before any async operations)
        if let cachedResponse = getCachedDNSResponse(domain: dnsQuery.domain, queryType: dnsQuery.queryType) {
            os_log("✓ DNS cache hit for UDP: %{public}@", log: logger, type: .debug, dnsQuery.domain)

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)
            let resolvedIP = parseResolvedIP(from: cachedResponse) ?? ""

            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: cachedResponse, queryType: dnsQuery.queryType)

            if let responsePacket = createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: cachedResponse,
                ipHeaderLength: Int((originalPacket[0] & 0x0F)) * 4
            ) {
                packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            }

            return
        }

        // 2. Extract DNS query data (skip IP and UDP headers)
        let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard originalPacket.count > dnsStart else {
            os_log("Invalid packet size", log: logger, type: .error)
            return
        }

        let dnsQueryData = originalPacket.subdata(in: dnsStart..<originalPacket.count)

        // 3. Use SERIAL queue - queries are processed one at a time
        // This prevents creating too many network flows
        queryQueue.async { [weak self] in
            guard let self = self else { return }

            // Get or create shared connection
            let (connection, version) = self.getOrCreateSharedConnection()

            // Set timeout for this specific query
            let timeoutWorkItem = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                os_log("⏱ UDP DNS query timeout for: %{public}@", log: self.logger, type: .error, dnsQuery.domain)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "", queryType: dnsQuery.queryType)
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 5.0, execute: timeoutWorkItem)

            // 4. Send DNS query using shared connection
            connection.send(content: dnsQueryData, completion: .contentProcessed { [weak self] error in
                guard let self = self else {
                    timeoutWorkItem.cancel()
                    return
                }

                if let error = error {
                    os_log("Failed to send UDP DNS query: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, queryType: dnsQuery.queryType)
                    timeoutWorkItem.cancel()

                    // RACE CONDITION FIX: Only reset connection if version matches
                    // This prevents resetting a newer connection created by another query
                    self.connectionLock.lock()
                    if self.sharedUDPConnection === connection && self.connectionVersion == version {
                        self.sharedUDPConnection?.cancel()
                        self.sharedUDPConnection = nil
                        self.connectionVersion += 1
                        os_log("⚠️ Shared UDP connection reset due to send error (v%d)", log: self.logger, type: .info, version)
                    }
                    self.connectionLock.unlock()
                    return
                }

                // 5. Receive DNS response
                connection.receiveMessage { [weak self] content, context, isComplete, error in
                    guard let self = self else { return }

                    timeoutWorkItem.cancel()
                    let latency = Int(Date().timeIntervalSince(startTime) * 1000)

                    if let error = error {
                        os_log("Failed to receive UDP DNS response: %{public}@", log: self.logger, type: .error, error.localizedDescription)

                        self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, queryType: dnsQuery.queryType)

                        // RACE CONDITION FIX: Only reset connection if version matches
                        self.connectionLock.lock()
                        if self.sharedUDPConnection === connection && self.connectionVersion == version {
                            self.sharedUDPConnection?.cancel()
                            self.sharedUDPConnection = nil
                            self.connectionVersion += 1
                            os_log("⚠️ Shared UDP connection reset due to receive error (v%d)", log: self.logger, type: .info, version)
                        }
                        self.connectionLock.unlock()
                        return
                    }

                    guard let responseData = content else {
                        os_log("Empty UDP DNS response", log: self.logger, type: .error)

                        self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: "", queryType: dnsQuery.queryType)
                        return
                    }

                    // 6. Parse DNS response
                    let rcode = responseData.count > 3 ? Int(responseData[3]) & 0x0F : -1
                    let answerCount = responseData.count > 7 ? Int(responseData[6]) << 8 | Int(responseData[7]) : 0
                    let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""

                    // IMPROVED: Detect incomplete DNS responses and trigger CNAME recursive resolution
                    if rcode == 0 && answerCount > 0 && resolvedIP.hasPrefix("CNAME->") {
                        let cnameTarget = String(resolvedIP.dropFirst("CNAME->".count))
                        os_log("🔄 CNAME: %{public}@ -> %{public}@",
                               log: self.logger, type: .debug, dnsQuery.domain, cnameTarget)

                        // Trigger CNAME recursive resolution
                        self.resolveCNAMERecursive(
                            cnameTarget: cnameTarget,
                            originalQuery: dnsQuery,
                            originalPacket: originalPacket,
                            protocolNumber: protocolNumber,
                            cnameChain: [dnsQuery.domain.lowercased()],
                            depth: 1
                        )
                        return
                    }

                    // Cache and send response
                    self.cacheDNSResponse(domain: dnsQuery.domain, response: responseData, queryType: dnsQuery.queryType)
                    self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: responseData, queryType: dnsQuery.queryType)
                    os_log("UDP DNS query completed in %d ms, resolved to: %{public}@", log: self.logger, type: .debug, latency, resolvedIP)

                    // Create response packet (reconstruct IP + UDP + DNS)
                    if let responsePacket = self.createDNSResponsePacket(
                        originalPacket: originalPacket,
                        dnsResponse: responseData,
                        ipHeaderLength: ipHeaderLength
                    ) {
                        self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])

                        // Response sent successfully
                    }
                }
            })
        }
    }

    // MARK: - DNS Helper Functions

    /// Create a DNS query packet for a given domain and query type
    /// This is used for CNAME recursive resolution
    /// Now includes EDNS(0) OPT record for modern DNS support
    private func createDNSQueryPacket(domain: String, queryType: UInt16) -> Data {
        var packet = Data()

        // DNS Header (12 bytes)
        // Transaction ID (2 bytes) - random
        packet.append(contentsOf: [UInt8.random(in: 0...255), UInt8.random(in: 0...255)])
        // Flags (2 bytes) - standard query
        packet.append(contentsOf: [0x01, 0x00])  // RD=1 (recursion desired)
        // Questions (2 bytes)
        packet.append(contentsOf: [0x00, 0x01])
        // Answer RRs (2 bytes)
        packet.append(contentsOf: [0x00, 0x00])
        // Authority RRs (2 bytes)
        packet.append(contentsOf: [0x00, 0x00])
        // Additional RRs (2 bytes) - now 1 for EDNS OPT record
        packet.append(contentsOf: [0x00, 0x01])

        // Question section
        // Domain name (labels)
        for label in domain.split(separator: ".") {
            let labelData = Data(label.utf8)
            packet.append(UInt8(labelData.count))
            packet.append(labelData)
        }
        packet.append(0x00)  // End of domain name

        // Query type (2 bytes)
        packet.append(UInt8(queryType >> 8))
        packet.append(UInt8(queryType & 0xFF))

        // Query class (2 bytes) - IN (Internet)
        packet.append(contentsOf: [0x00, 0x01])

        // Additional section - EDNS(0) OPT pseudo-record
        // NAME: root domain (1 byte)
        packet.append(0x00)
        // TYPE: OPT (41) (2 bytes)
        packet.append(contentsOf: [0x00, 0x29])
        // CLASS: UDP payload size - 1232 bytes (2 bytes)
        // Using 1232 as recommended by RFC 8467 to avoid fragmentation
        packet.append(contentsOf: [0x04, 0xD0])
        // TTL: Extended RCODE and flags (4 bytes)
        // Extended RCODE: 0, Version: 0, DO bit optional
        let flags: UInt16 = ednsDoEnabled ? 0x8000 : 0x0000
        packet.append(0x00)
        packet.append(0x00)
        packet.append(UInt8(flags >> 8))
        packet.append(UInt8(flags & 0xFF))
        // RDLENGTH: 0 (no additional data) (2 bytes)
        packet.append(contentsOf: [0x00, 0x00])
        // RDATA: empty

        return packet
    }

    private func ensureEdnsForDoHQuery(_ query: Data) -> Data {
        guard query.count >= 12 else { return query }

        var data = query
        let qdCount = Int(readUInt16(data, 4))
        var offset = 12

        for _ in 0..<qdCount {
            guard let nextOffset = skipDNSName(data, offset: offset) else { return query }
            offset = nextOffset + 4
            if offset > data.count { return query }
        }

        let arCount = Int(readUInt16(data, 10))
        var foundOpt = false

        for _ in 0..<arCount {
            guard let nameOffset = skipDNSName(data, offset: offset) else { return data }
            if nameOffset + 10 > data.count { return data }

            let type = readUInt16(data, nameOffset)
            let rdLength = Int(readUInt16(data, nameOffset + 8))

            if type == 41 {
                foundOpt = true
                writeUInt16(&data, offset: nameOffset + 2, value: 1232)

                let ttl = readUInt32(data, nameOffset + 4)
                let extRcode = UInt32((ttl >> 24) & 0xFF)
                let version = UInt32((ttl >> 16) & 0xFF)
                var flags = UInt16(ttl & 0xFFFF)
                if ednsDoEnabled {
                    flags |= 0x8000
                } else {
                    flags &= ~0x8000
                }
                let newTtl = (extRcode << 24) | (version << 16) | UInt32(flags)
                writeUInt32(&data, offset: nameOffset + 4, value: newTtl)
            }

            offset = nameOffset + 10 + rdLength
            if offset > data.count { break }
        }

        if foundOpt {
            return data
        }

        var updated = data
        let newArCount = UInt16(arCount + 1)
        writeUInt16(&updated, offset: 10, value: newArCount)

        var opt = Data()
        opt.append(0x00)
        opt.append(contentsOf: [0x00, 0x29])
        opt.append(contentsOf: [0x04, 0xD0])
        let flags: UInt16 = ednsDoEnabled ? 0x8000 : 0x0000
        opt.append(UInt8(0))
        opt.append(UInt8(0))
        opt.append(UInt8(flags >> 8))
        opt.append(UInt8(flags & 0xFF))
        opt.append(contentsOf: [0x00, 0x00])

        updated.append(opt)
        return updated
    }

    private func readUInt16(_ data: Data, _ offset: Int) -> UInt16 {
        guard offset + 1 < data.count else { return 0 }
        return (UInt16(data[offset]) << 8) | UInt16(data[offset + 1])
    }

    private func readUInt32(_ data: Data, _ offset: Int) -> UInt32 {
        guard offset + 3 < data.count else { return 0 }
        return (UInt32(data[offset]) << 24) |
            (UInt32(data[offset + 1]) << 16) |
            (UInt32(data[offset + 2]) << 8) |
            UInt32(data[offset + 3])
    }

    private func writeUInt16(_ data: inout Data, offset: Int, value: UInt16) {
        guard offset + 1 < data.count else { return }
        data[offset] = UInt8((value >> 8) & 0xFF)
        data[offset + 1] = UInt8(value & 0xFF)
    }

    private func writeUInt32(_ data: inout Data, offset: Int, value: UInt32) {
        guard offset + 3 < data.count else { return }
        data[offset] = UInt8((value >> 24) & 0xFF)
        data[offset + 1] = UInt8((value >> 16) & 0xFF)
        data[offset + 2] = UInt8((value >> 8) & 0xFF)
        data[offset + 3] = UInt8(value & 0xFF)
    }

    private func skipDNSName(_ data: Data, offset: Int) -> Int? {
        var index = offset
        while index < data.count {
            let length = Int(data[index])
            if length & 0xC0 == 0xC0 {
                return index + 2
            }
            if length == 0 {
                return index + 1
            }
            index += 1 + length
        }
        return nil
    }

    // MARK: - CNAME Resolution (本地DNS处理模式)

    /// Resolve CNAME via UDP (本地DNS处理模式)
    private func resolveCNAMEViaUDP(
        cnameQuery: DNSQuery,
        originalPacket: Data,
        protocolNumber: UInt32,
        cnameChain: Set<String>,
        depth: Int,
        requestKey: String? = nil
    ) {
        // Get or create shared UDP connection
        let (connection, _) = getOrCreateSharedConnection()

        let message = NWProtocolUDP.Metadata()
        let context = NWConnection.ContentContext(identifier: "DNSQuery", metadata: [message])

        connection.send(content: cnameQuery.packet, contentContext: context, isComplete: true, completion: .contentProcessed { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                os_log("❌ CNAME UDP query send failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                if let servfailResponse = self.createServfailResponse(for: originalPacket) {
                    self.packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
                }
                // Cleanup in-flight tracking on UDP send error
                if let key = requestKey {
                    self.cleanupInflightRequest(requestKey: key)
                }
                return
            }

            connection.receiveMessage { content, _, _, error in
                if let error = error {
                    os_log("❌ CNAME UDP response failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    if let servfailResponse = self.createServfailResponse(for: originalPacket) {
                        self.packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
                    }
                    // Cleanup in-flight tracking on UDP receive error
                    if let key = requestKey {
                        self.cleanupInflightRequest(requestKey: key)
                    }
                    return
                }

                guard let responseData = content, !responseData.isEmpty else {
                    os_log("❌ Empty CNAME UDP response", log: self.logger, type: .error)
                    if let servfailResponse = self.createServfailResponse(for: originalPacket) {
                        self.packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
                    }
                    // Cleanup in-flight tracking on empty UDP response
                    if let key = requestKey {
                        self.cleanupInflightRequest(requestKey: key)
                    }
                    return
                }

                // Check if we got IP addresses or another CNAME
                let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""

                if resolvedIP.hasPrefix("CNAME->") {
                    // Another CNAME, continue recursion
                    let nextCname = String(resolvedIP.dropFirst("CNAME->".count))
                    self.resolveCNAMERecursive(
                        cnameTarget: nextCname,
                        originalQuery: cnameQuery,
                        originalPacket: originalPacket,
                        protocolNumber: protocolNumber,
                        cnameChain: cnameChain,
                        depth: depth,
                        requestKey: requestKey
                    )
                } else if !resolvedIP.isEmpty {
                    // Found final IP address, forward the response
                    os_log("✅ CNAME resolved to IP: %{public}@", log: self.logger, type: .info, resolvedIP)

                    let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
                    if let responsePacket = self.createDNSResponsePacket(
                        originalPacket: originalPacket,
                        dnsResponse: responseData,
                        ipHeaderLength: ipHeaderLength
                    ) {
                        self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
                    }

                    // Broadcast successful CNAME resolution to waiting requests
                    if let key = requestKey {
                        self.broadcastResponseToPendingRequests(
                            requestKey: key,
                            dnsResponse: responseData,
                            queryType: cnameQuery.queryType
                        )
                    }
                } else {
                    // No IP found, return SERVFAIL
                    if let servfailResponse = self.createServfailResponse(for: originalPacket) {
                        self.packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
                    }

                    // Cleanup in-flight tracking on CNAME failure (no IP found)
                    if let key = requestKey {
                        self.cleanupInflightRequest(requestKey: key)
                    }
                }
            }
        })
    }

    /// Recursively resolve CNAME to find the final IP address
    /// This is called when DNS server returns only CNAME without A/AAAA record
    private func resolveCNAMERecursive(
        cnameTarget: String,
        originalQuery: DNSQuery,
        originalPacket: Data,
        protocolNumber: UInt32,
        cnameChain: Set<String> = [],
        depth: Int = 0,
        requestKey: String? = nil  // Request key for cleanup and broadcasting
    ) {
        // Maximum recursion depth to prevent infinite loops
        let maxDepth = 5

        // Check recursion depth
        if depth >= maxDepth {
            os_log("⚠️ CNAME recursion depth limit reached (%d), returning SERVFAIL", log: logger, type: .error, maxDepth)
            if let servfailResponse = createServfailResponse(for: originalPacket) {
                packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            // Cleanup and broadcast SERVFAIL to waiting requests
            if let key = requestKey {
                cleanupInflightRequest(requestKey: key)
            }
            return
        }

        // Check for CNAME loops
        if cnameChain.contains(cnameTarget.lowercased()) {
            os_log("⚠️ CNAME loop detected: %{public}@ already in chain", log: logger, type: .error, cnameTarget)
            if let servfailResponse = createServfailResponse(for: originalPacket) {
                packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            // Cleanup and broadcast SERVFAIL to waiting requests
            if let key = requestKey {
                cleanupInflightRequest(requestKey: key)
            }
            return
        }

        os_log("🔄 Resolving CNAME: %{public}@ (depth: %d)", log: logger, type: .debug, cnameTarget, depth)

        // Add current target to chain
        var newChain = cnameChain
        newChain.insert(cnameTarget.lowercased())

        // Create a new DNS query for the CNAME target
        let cnameQueryPacket = createDNSQueryPacket(domain: cnameTarget, queryType: originalQuery.queryType)
        let cnameQuery = DNSQuery(domain: cnameTarget, packet: cnameQueryPacket, queryType: originalQuery.queryType)

        // 本地DNS处理模式 - 只使用UDP
        resolveCNAMEViaUDP(
            cnameQuery: cnameQuery,
            originalPacket: originalPacket,
            protocolNumber: protocolNumber,
            cnameChain: newChain,
            depth: depth + 1,
            requestKey: requestKey
        )
    }


    /// Broadcast DNS response to all pending requests waiting for the same query
    private func broadcastResponseToPendingRequests(requestKey: String, dnsResponse: Data, queryType: UInt16) {
        // Remove from in-flight tracking
        inflightRequestsLock.lock()
        inflightRequests.remove(requestKey)
        let remainingInflight = inflightRequests.count
        inflightRequestsLock.unlock()

        // Get all pending callbacks for this request
        pendingResponseLock.lock()
        let pendingCallbacks = pendingResponseCallbacks[requestKey] ?? []
        pendingResponseCallbacks.removeValue(forKey: requestKey)
        pendingResponseLock.unlock()

        // Send response to all waiting requests
        if !pendingCallbacks.isEmpty {
            os_log("📢 Broadcasting response to %d pending request(s) for key: %{public}@ [Remaining in-flight: %d]", log: logger, type: .debug, pendingCallbacks.count, requestKey, remainingInflight)

            for (originalPacket, protocolNumber) in pendingCallbacks {
                let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
                if let responsePacket = self.createDNSResponsePacket(
                    originalPacket: originalPacket,
                    dnsResponse: dnsResponse,
                    ipHeaderLength: ipHeaderLength
                ) {
                    self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
                }
            }
        }
    }

    /// Clean up in-flight tracking for failed/blocked requests
    private func cleanupInflightRequest(requestKey: String) {
        inflightRequestsLock.lock()
        inflightRequests.remove(requestKey)
        let remainingInflight = inflightRequests.count
        inflightRequestsLock.unlock()

        pendingResponseLock.lock()
        let pendingCount = pendingResponseCallbacks[requestKey]?.count ?? 0
        pendingResponseCallbacks.removeValue(forKey: requestKey)
        pendingResponseLock.unlock()

        if pendingCount > 0 {
            os_log("🧹 Cleaned up failed request: %{public}@ (dropped %d pending) [Remaining in-flight: %d]", log: logger, type: .debug, requestKey, pendingCount, remainingInflight)
        }
    }

    private func createDNSResponsePacket(originalPacket: Data, dnsResponse: Data, ipHeaderLength: Int) -> Data? {
        // Create a response packet by modifying the original packet
        var response = Data()

        // Copy and modify IP header
        var ipHeader = originalPacket.subdata(in: 0..<ipHeaderLength)

        // Swap source and destination IP addresses
        let srcIP = ipHeader.subdata(in: 12..<16)
        let dstIP = ipHeader.subdata(in: 16..<20)
        ipHeader.replaceSubrange(12..<16, with: dstIP)
        ipHeader.replaceSubrange(16..<20, with: srcIP)

        // Update total length
        let newTotalLength = UInt16(ipHeaderLength + 8 + dnsResponse.count)
        var lengthBytes = Data()
        lengthBytes.append(UInt8(newTotalLength >> 8))
        lengthBytes.append(UInt8(newTotalLength & 0xFF))
        ipHeader.replaceSubrange(2..<4, with: lengthBytes)

        // Clear checksum field before calculation
        ipHeader.replaceSubrange(10..<12, with: Data([0x00, 0x00]))

        // Calculate IP header checksum (REQUIRED - iOS does NOT auto-fix this!)
        let checksum = calculateIPChecksum(ipHeader)
        ipHeader.replaceSubrange(10..<12, with: Data([UInt8(checksum >> 8), UInt8(checksum & 0xFF)]))

        response.append(ipHeader)

        // Copy and modify UDP header
        let udpHeaderStart = ipHeaderLength
        var udpHeader = originalPacket.subdata(in: udpHeaderStart..<(udpHeaderStart + 8))

        // Swap source and destination ports
        let srcPort = udpHeader.subdata(in: 0..<2)
        let dstPort = udpHeader.subdata(in: 2..<4)
        udpHeader.replaceSubrange(0..<2, with: dstPort)
        udpHeader.replaceSubrange(2..<4, with: srcPort)

        // Update UDP length
        let udpLength = UInt16(8 + dnsResponse.count)
        var udpLengthBytes = Data()
        udpLengthBytes.append(UInt8(udpLength >> 8))
        udpLengthBytes.append(UInt8(udpLength & 0xFF))
        udpHeader.replaceSubrange(4..<6, with: udpLengthBytes)

        // Set UDP checksum to 0 (optional for IPv4 UDP)
        udpHeader.replaceSubrange(6..<8, with: Data([0x00, 0x00]))

        response.append(udpHeader)

        // Append DNS response
        response.append(dnsResponse)

        return response
    }

    /// Calculate IP header checksum (RFC 1071)
    private func calculateIPChecksum(_ header: Data) -> UInt16 {
        var sum: UInt32 = 0

        // Sum all 16-bit words
        for i in stride(from: 0, to: header.count, by: 2) {
            let word: UInt16
            if i + 1 < header.count {
                word = UInt16(header[i]) << 8 | UInt16(header[i + 1])
            } else {
                word = UInt16(header[i]) << 8
            }
            sum += UInt32(word)
        }

        // Fold 32-bit sum to 16 bits (add carry bits)
        while sum >> 16 != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16)
        }

        // One's complement
        return ~UInt16(sum)
    }

    private func shouldBlockDomain(_ domain: String) -> Bool {
        let normalizedDomain = domain.lowercased()

        // Whitelist has highest priority
        if isInWhitelist(normalizedDomain) {
            return false
        }

        // Check blacklist
        if isInBlacklist(normalizedDomain) {
            return true
        }

        return false
    }

    /// 本地DNS处理模式 - 不需要绕过任何域名
    private func shouldBypassDNSQuery(_ domain: String) -> Bool {
        // 本地DNS处理模式不需要绕过任何域名
        return false
    }

    private func isInWhitelist(_ domain: String) -> Bool {
        for whitelistedDomain in whitelist {
            if domain == whitelistedDomain || domain.hasSuffix("." + whitelistedDomain) {
                return true
            }
        }
        return false
    }

    private func isInBlacklist(_ domain: String) -> Bool {
        blacklistLock.lock()
        defer { blacklistLock.unlock() }

        // PERFORMANCE OPTIMIZATION: Use optimized matching algorithm

        // 1. Fast exact match - O(1) lookup
        if exactBlacklist.contains(domain) {
            return true
        }

        // 2. Check parent domains for subdomain matching
        // Example: "ads.google.com" should match if "google.com" is blacklisted
        let parts = domain.split(separator: ".")
        for i in 1..<parts.count {
            let parentDomain = parts[i...].joined(separator: ".")
            if exactBlacklist.contains(parentDomain) {
                return true
            }
        }

        // 3. Wildcard pattern matching with cached regex
        for pattern in wildcardBlacklist {
            if matchesWildcardPattern(domain: domain, pattern: pattern) {
                return true
            }
        }

        return false
    }

    /// Match domain against wildcard pattern using cached regex
    /// PERFORMANCE FIX: Properly escapes regex special characters before replacing wildcards
    private func matchesWildcardPattern(domain: String, pattern: String) -> Bool {
        // Get cached regex or create new one
        if let regex = cachedRegexPatterns[pattern] {
            let range = NSRange(domain.startIndex..., in: domain)
            return regex.firstMatch(in: domain, range: range) != nil
        }

        // CRITICAL FIX: Escape regex special characters BEFORE replacing wildcards
        // This prevents dots and other special chars from being treated as regex operators
        let escapedPattern = NSRegularExpression.escapedPattern(for: pattern)
        // Now replace escaped asterisks (\*) with regex wildcard (.*)
        let regexPattern = escapedPattern.replacingOccurrences(of: "\\*", with: ".*")

        // Create and cache the regex
        if let regex = try? NSRegularExpression(pattern: "^" + regexPattern + "$", options: .caseInsensitive) {
            cachedRegexPatterns[pattern] = regex
            let range = NSRange(domain.startIndex..., in: domain)
            return regex.firstMatch(in: domain, range: range) != nil
        }

        os_log("⚠️ Failed to create regex for pattern: %{public}@", log: logger, type: .error, pattern)
        return false
    }

    private func parseDNSQuery(from packet: Data) -> DNSQuery? {
        // Simple DNS packet parsing
        // DNS packet structure: IP header (20 bytes) + UDP header (8 bytes) + DNS message

        guard packet.count > 28 else { return nil }

        // Check if this is UDP (protocol 17)
        let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
        guard ipHeaderLength >= 20 else { return nil }

        let protocolByte = packet[9]
        guard protocolByte == 17 else { return nil } // UDP

        // Check destination port (should be 53 for DNS)
        let udpHeaderStart = ipHeaderLength
        guard packet.count > udpHeaderStart + 8 else { return nil }

        let destPort = UInt16(packet[udpHeaderStart + 2]) << 8 | UInt16(packet[udpHeaderStart + 3])
        guard destPort == 53 else { return nil }

        // Parse DNS query name
        let dnsStart = udpHeaderStart + 8
        guard packet.count > dnsStart + 12 else { return nil }

        // Extract domain name from DNS query
        var domain = ""
        var index = dnsStart + 12 // Skip DNS header

        while index < packet.count {
            let length = Int(packet[index])
            if length == 0 { break }

            index += 1
            if index + length > packet.count { break }

            let labelData = packet.subdata(in: index..<(index + length))
            if let label = String(data: labelData, encoding: .ascii) {
                if !domain.isEmpty { domain += "." }
                domain += label
            }

            index += length
        }

        guard !domain.isEmpty else { return nil }

        // Skip null terminator
        index += 1

        // Parse query type (2 bytes after domain name)
        var queryType: UInt16 = 1  // Default to A record
        if index + 2 <= packet.count {
            queryType = UInt16(packet[index]) << 8 | UInt16(packet[index + 1])
        }

        return DNSQuery(domain: domain, packet: packet, queryType: queryType)
    }

    private func createEmptyAAAAResponse(for packet: Data) -> Data? {
        // Create empty response for IPv6 (AAAA) queries
        // This tells the system we don't have IPv6 addresses, preventing retries
        return createEmptyResponse(for: packet)
    }

    private func createEmptyResponse(for packet: Data) -> Data? {
        // Create empty response with NOERROR but 0 answers
        // Used for unsupported query types or system queries we want to skip
        let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard packet.count > dnsStart + 12 else { return nil }

        // Create DNS response with NOERROR but 0 answers
        var dnsResponseData = packet.subdata(in: dnsStart..<packet.count)

        // Set response flags (byte 2-3): Standard query response, no error
        dnsResponseData[2] = 0x81  // QR=1 (response), OPCODE=0, AA=0, TC=0, RD=1
        dnsResponseData[3] = 0x80  // RA=1, Z=0, RCODE=0 (NOERROR)

        // Answer count = 0 (bytes 6-7)
        dnsResponseData[6] = 0x00
        dnsResponseData[7] = 0x00

        // Use the proper response packet creation method with checksums
        return createDNSResponsePacket(
            originalPacket: packet,
            dnsResponse: dnsResponseData,
            ipHeaderLength: ipHeaderLength
        )
    }

    private func createBlockResponse(for packet: Data) -> Data? {
        // IMPROVED: Create proper NXDOMAIN response with correct checksums
        let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard packet.count > dnsStart + 12 else { return nil }

        // Extract original DNS query (header + question)
        // For NXDOMAIN, we only need DNS header (12 bytes) + original question
        var dnsResponseData = Data()

        // Copy DNS header (12 bytes)
        dnsResponseData.append(packet.subdata(in: dnsStart..<(dnsStart + 12)))

        // Modify DNS flags: QR=1 (response), RCODE=3 (NXDOMAIN)
        dnsResponseData[2] = 0x81
        dnsResponseData[3] = 0x83

        // Copy the question section (everything after DNS header until end of packet)
        let questionStart = dnsStart + 12
        if questionStart < packet.count {
            dnsResponseData.append(packet.subdata(in: questionStart..<packet.count))
        }

        // Use the proper response packet creation method with checksums
        return createDNSResponsePacket(
            originalPacket: packet,
            dnsResponse: dnsResponseData,
            ipHeaderLength: ipHeaderLength
        )
    }

    private func createServfailResponse(for packet: Data) -> Data? {
        // LOOP DETECTION FIX: Create SERVFAIL response (RCODE=2) instead of dropping query
        // This tells the app "server failure" which is better than timeout
        let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard packet.count > dnsStart + 12 else { return nil }

        // Extract original DNS query (header + question)
        var dnsResponseData = Data()

        // Copy DNS header (12 bytes)
        dnsResponseData.append(packet.subdata(in: dnsStart..<(dnsStart + 12)))

        // Modify DNS flags: QR=1 (response), RCODE=2 (SERVFAIL)
        dnsResponseData[2] = 0x81  // QR=1 (response), OPCODE=0, AA=0, TC=0, RD=1
        dnsResponseData[3] = 0x82  // RA=1, Z=0, RCODE=2 (SERVFAIL)

        // Copy the question section (everything after DNS header until end of packet)
        let questionStart = dnsStart + 12
        if questionStart < packet.count {
            dnsResponseData.append(packet.subdata(in: questionStart..<packet.count))
        }

        // Use the proper response packet creation method with checksums
        return createDNSResponsePacket(
            originalPacket: packet,
            dnsResponse: dnsResponseData,
            ipHeaderLength: ipHeaderLength
        )
    }

    /// RESPONSE BROADCAST FIX: Broadcast DNS response to all pending queries for the same domain
    /// This prevents dropping duplicate queries when multiple apps query the same domain simultaneously
    private func broadcastDNSResponse(domain: String, dnsResponse: Data) {
        pendingResponseLock.lock()
        let waitingQueries = pendingResponseCallbacks[domain] ?? []
        pendingResponseCallbacks.removeValue(forKey: domain)
        pendingResponseLock.unlock()

        if !waitingQueries.isEmpty {
            os_log("📢 Broadcasting DNS response to %d waiting queries for %{public}@",
                   log: logger, type: .info, waitingQueries.count, domain)
        }

        // Send response to all waiting queries
        for (originalPacket, protocolNumber) in waitingQueries {
            let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
            if let responsePacket = createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: dnsResponse,
                ipHeaderLength: ipHeaderLength
            ) {
                packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            }
        }
    }

    /// ERROR HANDLING FIX: Clean up pending callbacks when query fails
    /// Sends SERVFAIL to all waiting queries to prevent indefinite timeout
    private func cleanupPendingCallbacks(for domain: String, sendServfail: Bool = true) {
        pendingResponseLock.lock()
        let waitingQueries = pendingResponseCallbacks[domain] ?? []
        pendingResponseCallbacks.removeValue(forKey: domain)
        pendingResponseLock.unlock()

        if waitingQueries.isEmpty {
            return
        }

        os_log("🧹 Cleaning up %d pending callbacks for %{public}@",
               log: logger, type: .info, waitingQueries.count, domain)

        if sendServfail {
            // Send SERVFAIL to all waiting queries (better than timeout)
            for (originalPacket, protocolNumber) in waitingQueries {
                if let servfailResponse = createServfailResponse(for: originalPacket) {
                    packetFlow.writePackets([servfailResponse], withProtocols: [NSNumber(value: protocolNumber)])
                }
            }
        }
    }

    private func sendDNSEvent(domain: String, blocked: Bool, latency: Int, resolvedIP: String = "", dnsResponse: Data? = nil, queryType: UInt16 = 1) {
        // Send event to main app via Darwin notification or shared storage
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            return
        }

        // Check if DoH server blocked this domain (returns special IPs)
        let isDohBlocked = resolvedIP == "0.0.0.0" || resolvedIP == "::" || resolvedIP == "::0"

        // Determine display info based on status and resolved IP
        let displayInfo: String
        if blocked {
            displayInfo = "已拦截"  // Locally blocked
        } else if isDohBlocked {
            displayInfo = "已拦截"  // DoH server blocking
        } else if resolvedIP.isEmpty {
            // Check DNS response RCODE to differentiate error types
            if let response = dnsResponse, response.count > 3 {
                let rcode = Int(response[3]) & 0x0F
                switch rcode {
                case 0:  // NOERROR - domain exists but no A record
                    displayInfo = "无记录"
                case 3:  // NXDOMAIN - domain does not exist
                    displayInfo = "域名不存在"
                default:  // Other errors (SERVFAIL, REFUSED, etc.)
                    displayInfo = "解析失败"
                }
            } else {
                displayInfo = "解析失败"
            }
        } else {
            displayInfo = resolvedIP  // Normal IP address
        }

        // LOG FILTER: Skip logging meaningless "no record" queries
        // 1. TYPE 65 (HTTPS record) queries with no records - most domains don't support HTTPS records yet
        // 2. Queries with auto-appended search domain suffixes causing invalid domains (e.g., .com.com, .net.com)
        let shouldSkipLogging = {
            // Filter TYPE 65 (HTTPS) queries with "无记录" result
            if queryType == 65 && displayInfo == "无记录" {
                os_log("🔇 Skipping log for TYPE 65 (HTTPS) query with no records: %@", log: logger, type: .debug, domain)
                return true
            }

            // Filter domains with abnormal auto-appended suffixes
            // Examples: example.com.com, example.net.com, example.org.com
            let lowercaseDomain = domain.lowercased()
            let abnormalSuffixes = [".com.com", ".net.com", ".org.com", ".cn.com", ".io.com"]
            for suffix in abnormalSuffixes {
                if lowercaseDomain.hasSuffix(suffix) {
                    os_log("🔇 Skipping log for domain with abnormal suffix: %@", log: logger, type: .debug, domain)
                    return true
                }
            }

            return false
        }()

        if shouldSkipLogging {
            return
        }

        // Status should be "blocked" if either locally blocked OR blocked by DoH server
        let actualStatus = (blocked || isDohBlocked) ? "blocked" : "allowed"

        let event: [String: Any] = [
            "domain": domain,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "status": actualStatus,
            "category": displayInfo,  // Now stores IP address or status
            "latency": latency
        ]

        // PERFORMANCE FIX: Use more efficient event storage
        // Instead of storing all events, keep a rolling window
        var events = sharedDefaults.array(forKey: "dnsEvents") as? [[String: Any]] ?? []

        // OPTIMIZATION: Only clean old events periodically (not every time)
        // This reduces overhead - clean only if array is getting large
        let shouldClean = events.count > 900  // Clean when approaching limit

        if shouldClean {
            let now = Date()
            let maxAge: TimeInterval = 1 * 60 * 60  // REDUCED to 1 hour for better performance
            events = events.filter { eventDict in
                guard let timestampStr = eventDict["timestamp"] as? String,
                      let timestamp = ISO8601DateFormatter().date(from: timestampStr) else {
                    return false
                }
                return now.timeIntervalSince(timestamp) < maxAge
            }

            // Keep only last 500 events (reduced from 1000 for better performance)
            if events.count > 500 {
                events = Array(events.suffix(500))
            }

            os_log("🧹 Cleaned event log: %d events remaining", log: logger, type: .debug, events.count)
        }

        events.append(event)

        // PERFORMANCE: Write back immediately but limit size
        if events.count > 1000 {
            events = Array(events.suffix(500))  // Aggressive trimming
            os_log("⚠️ Event log overflow, trimmed to 500 events", log: logger, type: .info)
        }

        sharedDefaults.set(events, forKey: "dnsEvents")

        // OPTIMIZATION: Rate limit notifications to prevent overwhelming React Native
        // Post notification but React Native should debounce/batch these
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.idns.dnsEvent" as CFString),
            nil, nil, true
        )
    }

    /// Parse DNS response to extract the first A/AAAA record or CNAME
    /// Returns first IP address, or "CNAME->target" if only CNAME found
    private func parseResolvedIP(from dnsResponse: Data) -> String? {
        guard dnsResponse.count > 12 else { return nil }

        // Get answer count from header (bytes 6-7)
        let answerCount = Int(dnsResponse[6]) << 8 | Int(dnsResponse[7])
        guard answerCount > 0 else { return nil }

        // Skip header (12 bytes)
        var index = 12

        // Skip question section
        while index < dnsResponse.count {
            let length = Int(dnsResponse[index])
            if length == 0 {
                index += 1
                break
            }
            index += 1 + length
        }
        index += 4  // Skip QTYPE and QCLASS

        var firstCname: String?

        // Parse answer section - looking for first IP or CNAME
        for _ in 0..<answerCount {
            guard index + 12 <= dnsResponse.count else { break }

            // Handle name (might be compressed with pointer)
            if dnsResponse[index] & 0xC0 == 0xC0 {
                index += 2
            } else {
                while index < dnsResponse.count {
                    let length = Int(dnsResponse[index])
                    if length == 0 {
                        index += 1
                        break
                    }
                    index += 1 + length
                }
            }

            guard index + 10 <= dnsResponse.count else { break }

            // Read TYPE (2 bytes)
            let recordType = Int(dnsResponse[index]) << 8 | Int(dnsResponse[index + 1])
            index += 2

            // Skip CLASS (2 bytes) + TTL (4 bytes)
            index += 6

            // Read RDLENGTH (2 bytes)
            let rdLength = Int(dnsResponse[index]) << 8 | Int(dnsResponse[index + 1])
            index += 2

            // Check record type
            if recordType == 1 && rdLength == 4 && index + 4 <= dnsResponse.count {
                // A record - return immediately
                let ip = "\(dnsResponse[index]).\(dnsResponse[index + 1]).\(dnsResponse[index + 2]).\(dnsResponse[index + 3])"
                return ip
            } else if recordType == 28 && rdLength == 16 && index + 16 <= dnsResponse.count {
                // AAAA record - return immediately
                let ipv6Data = dnsResponse.subdata(in: index..<(index + 16))
                return formatIPv6Address(from: ipv6Data)
            } else if recordType == 5 && rdLength > 0 && index + rdLength <= dnsResponse.count && firstCname == nil {
                // CNAME record - save for later if no IP found
                let cnameData = dnsResponse.subdata(in: index..<(index + rdLength))
                if let cname = parseDomainName(from: cnameData, fullResponse: dnsResponse) {
                    firstCname = cname
                }
            }

            // Skip RDATA
            index += rdLength
        }

        // If we found a CNAME but no IP, indicate recursive resolution needed
        if let cname = firstCname {
            return "CNAME->\(cname)"
        }

        return nil
    }

    // Helper: Format IPv6 address from 16-byte data
    private func formatIPv6Address(from data: Data) -> String {
        guard data.count == 16 else { return "::" }

        // Convert 16 bytes to 8 groups of 2 bytes (hex)
        var groups: [UInt16] = []
        for i in stride(from: 0, to: 16, by: 2) {
            let value = UInt16(data[i]) << 8 | UInt16(data[i + 1])
            groups.append(value)
        }

        // Find the longest sequence of zeros for compression
        var maxZeroStart = -1
        var maxZeroLen = 0
        var currentZeroStart = -1
        var currentZeroLen = 0

        for (index, value) in groups.enumerated() {
            if value == 0 {
                if currentZeroStart == -1 {
                    currentZeroStart = index
                    currentZeroLen = 1
                } else {
                    currentZeroLen += 1
                }

                if currentZeroLen > maxZeroLen {
                    maxZeroStart = currentZeroStart
                    maxZeroLen = currentZeroLen
                }
            } else {
                currentZeroStart = -1
                currentZeroLen = 0
            }
        }

        // Build the IPv6 string with compression
        var result = ""
        var index = 0

        while index < groups.count {
            if index == maxZeroStart && maxZeroLen > 1 {
                // Use :: compression for the longest zero sequence
                result += (index == 0) ? "::" : ":"
                index += maxZeroLen
                if index == groups.count {
                    // If compression is at the end, we're done
                    break
                }
            } else {
                if index > 0 && !(index - 1 >= maxZeroStart && index - 1 < maxZeroStart + maxZeroLen) {
                    result += ":"
                }
                result += String(format: "%x", groups[index])
                index += 1
            }
        }

        return result
    }

    // Helper: Parse domain name from DNS data (handles compression)
    private func parseDomainName(from data: Data, fullResponse: Data) -> String? {
        var index = 0
        var parts: [String] = []
        var maxIterations = 100  // Prevent infinite loops

        while index < data.count && maxIterations > 0 {
            maxIterations -= 1

            let length = Int(data[index])

            // Check for compression pointer (first 2 bits are 11)
            if length & 0xC0 == 0xC0 {
                // Pointer to another location in the full response
                guard index + 1 < data.count else { break }
                let _ = ((Int(data[index]) & 0x3F) << 8) | Int(data[index + 1])  // Pointer unused
                // We could recursively parse from fullResponse[pointer], but for now just return what we have
                break
            }

            // End of domain name
            if length == 0 {
                break
            }

            // Read label
            index += 1
            guard index + length <= data.count else { break }
            if let label = String(data: data.subdata(in: index..<(index + length)), encoding: .utf8) {
                parts.append(label)
            }
            index += length
        }

        return parts.isEmpty ? nil : parts.joined(separator: ".")
    }

    private func loadFilterRules() {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            os_log("Failed to access shared defaults", log: logger, type: .error)
            return
        }

        ednsDoEnabled = sharedDefaults.bool(forKey: "ednsDoEnabled")
        os_log("EDNS DO enabled: %{public}@", log: logger, type: .info, ednsDoEnabled ? "true" : "false")

        if let savedBlacklist = sharedDefaults.array(forKey: "blacklist") as? [String] {
            blacklist = Set(savedBlacklist.map { $0.lowercased() })

            // PERFORMANCE OPTIMIZATION: Split blacklist into exact matches and wildcards
            blacklistLock.lock()
            exactBlacklist.removeAll()
            wildcardBlacklist.removeAll()
            cachedRegexPatterns.removeAll()

            for rule in blacklist {
                if rule.contains("*") {
                    wildcardBlacklist.append(rule)
                } else {
                    exactBlacklist.insert(rule)
                }
            }
            blacklistLock.unlock()

            os_log("Loaded %d blacklist rules (%d exact, %d wildcards)",
                   log: logger, type: .info,
                   blacklist.count, exactBlacklist.count, wildcardBlacklist.count)
        }

        if let savedWhitelist = sharedDefaults.array(forKey: "whitelist") as? [String] {
            whitelist = Set(savedWhitelist.map { $0.lowercased() })
            os_log("Loaded %d whitelist rules", log: logger, type: .info, whitelist.count)
        }
    }

    private func saveFilterRules() {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            return
        }

        sharedDefaults.set(Array(blacklist), forKey: "blacklist")
        sharedDefaults.set(Array(whitelist), forKey: "whitelist")
        // Note: synchronize() is deprecated. UserDefaults auto-saves changes.

        // PERFORMANCE OPTIMIZATION: Rebuild optimized data structures after save
        blacklistLock.lock()
        exactBlacklist.removeAll()
        wildcardBlacklist.removeAll()
        cachedRegexPatterns.removeAll()

        for rule in blacklist {
            if rule.contains("*") {
                wildcardBlacklist.append(rule)
            } else {
                exactBlacklist.insert(rule)
            }
        }
        blacklistLock.unlock()
    }

    private func restartTunnel() {
        // Stop and restart the tunnel with new settings
        let settings = createTunnelSettings()
        setTunnelNetworkSettings(settings) { error in
            if let error = error {
                os_log("Failed to restart tunnel: %{public}@", log: self.logger, type: .error, error.localizedDescription)
            } else {
                os_log("Tunnel restarted successfully", log: self.logger, type: .info)
            }
        }
    }


    // DISABLED: Deduplication was causing queries to be dropped without responses
    // TODO: Implement response caching to properly handle duplicate queries
    /*
    private func shouldSkipDuplicateQuery(domain: String) -> Bool {
        let now = Date()
        let key = domain.lowercased()

        // Check if we've seen this query recently
        if let lastQueryTime = recentQueries[key] {
            let timeSinceLastQuery = now.timeIntervalSince(lastQueryTime)
            if timeSinceLastQuery < queryDeduplicationWindow {
                // Duplicate query within deduplication window
                return true
            }
        }

        // Record this query
        recentQueries[key] = now

        // Clean up old entries (older than 5 seconds)
        let oldEntries = recentQueries.filter { _, time in
            now.timeIntervalSince(time) > 5.0
        }
        for (oldKey, _) in oldEntries {
            recentQueries.removeValue(forKey: oldKey)
        }

        return false
    }
    */

    private func startCleanupTimer() {
        // MEMORY LEAK FIX: Clean up expired DNS cache entries every 5 minutes
        cleanupTimer = Timer.scheduledTimer(withTimeInterval: 300.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }

            let now = Date()

            // Cleanup expired cache entries
            self.dnsCacheLock.lock()
            let cacheBeforeCount = self.dnsCache.count
            self.dnsCache = self.dnsCache.filter { _, entry in
                now.timeIntervalSince(entry.timestamp) < entry.ttl
            }
            let cacheAfterCount = self.dnsCache.count
            let cacheRemoved = cacheBeforeCount - cacheAfterCount
            self.dnsCacheLock.unlock()

            if cacheRemoved > 0 {
                os_log("🧹 Cleanup: Removed %d expired cache entries (%d remaining)",
                       log: self.logger, type: .debug, cacheRemoved, cacheAfterCount)
            }

            // MEMORY LEAK FIX: Clean up old query counter entries
            self.queryCounterLock.lock()
            let counterBeforeCount = self.queryCounter.count
            self.queryCounter = self.queryCounter.filter { _, entry in
                // Keep entries from last 60 seconds only
                now.timeIntervalSince(entry.lastSeen) < 60.0
            }
            let counterAfterCount = self.queryCounter.count
            let counterRemoved = counterBeforeCount - counterAfterCount
            self.queryCounterLock.unlock()

            if counterRemoved > 0 {
                os_log("🧹 Cleanup: Removed %d old query counter entries (%d remaining)",
                       log: self.logger, type: .debug, counterRemoved, counterAfterCount)
            }

            // QUERY COALESCING STATS: Log pending requests for monitoring
            self.pendingResponseLock.lock()
            let totalPendingRequests = self.pendingResponseCallbacks.values.reduce(0) { $0 + $1.count }
            let domainsWithPendingRequests = self.pendingResponseCallbacks.count
            self.pendingResponseLock.unlock()

            // Log stats for monitoring
            os_log("📊 Stats: Cache=%d, QueryCounter=%d, PendingRequests=%d (across %d domains)",
                   log: self.logger, type: .info,
                   self.dnsCache.count, counterAfterCount, totalPendingRequests, domainsWithPendingRequests)
        }

        os_log("✓ Started cleanup timer for DNS cache, query counter, and coalescing monitor", log: logger, type: .info)
    }

    // MARK: - Connection Management

    /**
     * Get or create shared UDP connection with version tracking
     * Only one connection is used for all queries (serial processing)
     * Returns: (connection, version) tuple for race condition prevention
     */
    private func getOrCreateSharedConnection() -> (NWConnection, Int) {
        connectionLock.lock()
        defer { connectionLock.unlock() }

        // OPTIMIZATION: Return existing connection if in usable state
        // Accept both .ready and .preparing states for better connection reuse
        if let existing = sharedUDPConnection {
            switch existing.state {
            case .ready, .preparing:
                // Connection is usable
                return (existing, connectionVersion)
            case .failed, .cancelled:
                // Connection is broken, will create new one
                os_log("♻️ Replacing failed/cancelled connection (v%d)", log: logger, type: .info, connectionVersion)
                sharedUDPConnection?.cancel()
                sharedUDPConnection = nil
            default:
                // Other states, try to use existing connection
                return (existing, connectionVersion)
            }
        }

        // Create new connection with incremented version
        connectionVersion += 1
        let currentVersion = connectionVersion

        // OPTIMIZATION: Use optimized UDP parameters for DNS
        let udpOptions = NWProtocolUDP.Options()
        let params = NWParameters(dtls: nil, udp: udpOptions)
        params.serviceClass = .responsiveData  // Optimized for low-latency DNS
        params.expiredDNSBehavior = .allow  // Allow expired DNS for bootstrap
        params.multipathServiceType = .handover  // Use best available network

        // DoH 模式 - 不再使用 UDP 连接
        // 此函数已被弃用，DNS 查询现在通过 DoH (HTTPS) 进行
        let dnsServerAddress = "8.8.8.8"  // Fallback only
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(dnsServerAddress), port: 53)
        let connection = NWConnection(to: endpoint, using: params)

        // Track connection creation time for health monitoring
        let connectionCreatedAt = Date()

        connection.stateUpdateHandler = { [weak self] (state: NWConnection.State) in
            guard let self = self else { return }

            switch state {
            case .ready:
                let setupTime = Date().timeIntervalSince(connectionCreatedAt)
                os_log("✅ UDP connection ready (v%d) in %.0fms", log: self.logger, type: .info,
                       currentVersion, setupTime * 1000)

            case .failed(let error):
                os_log("❌ UDP connection failed (v%d): %{public}@",
                       log: self.logger, type: .error, currentVersion, error.localizedDescription)

                self.connectionLock.lock()
                // RACE CONDITION FIX: Only clear if this is still the current connection
                if self.connectionVersion == currentVersion {
                    self.sharedUDPConnection?.cancel()
                    self.sharedUDPConnection = nil
                    self.connectionVersion += 1
                    os_log("🔄 Connection marked for recreation (new v%d)", log: self.logger, type: .info, self.connectionVersion)
                }
                self.connectionLock.unlock()

            case .cancelled:
                os_log("🚫 UDP connection cancelled (v%d)", log: self.logger, type: .debug, currentVersion)

            case .preparing:
                os_log("🔄 UDP connection preparing (v%d)...", log: self.logger, type: .debug, currentVersion)

            default:
                os_log("📊 UDP connection state: %{public}@ (v%d)", log: self.logger, type: .debug,
                       String(describing: state), currentVersion)
            }
        }

        connection.start(queue: DispatchQueue.global())
        sharedUDPConnection = connection

        os_log("🆕 Created UDP connection (v%d) to %{public}@:53", log: logger, type: .info,
               currentVersion, dnsServerAddress)
        return (connection, currentVersion)
    }

    // MARK: - DNS Cache Management

    /**
     * Get cached DNS response if available and not expired
     * Now supports query type differentiation (A vs AAAA)
     */
    private func getCachedDNSResponse(domain: String, queryType: UInt16 = 1) -> Data? {
        dnsCacheLock.lock()
        defer { dnsCacheLock.unlock() }

        // Cache key includes both domain and query type to distinguish A from AAAA queries
        let key = "\(domain.lowercased())_\(queryType)"
        guard let entry = dnsCache[key] else {
            return nil
        }

        let age = Date().timeIntervalSince(entry.timestamp)
        if age > entry.ttl {
            dnsCache.removeValue(forKey: key)
            os_log("🗑 Cache expired for %{public}@ type=%d (age: %.1fs, TTL: %.1fs)", log: logger, type: .debug, domain, queryType, age, entry.ttl)
            return nil
        }

        os_log("✅ Cache hit for %{public}@ type=%d (age: %.1fs, TTL: %.1fs)", log: logger, type: .debug, domain, queryType, age, entry.ttl)
        return entry.response
    }

    /**
     * Cache DNS response with TTL
     * Now supports query type differentiation (A vs AAAA)
     */
    private func cacheDNSResponse(domain: String, response: Data, queryType: UInt16 = 1) {
        dnsCacheLock.lock()
        defer { dnsCacheLock.unlock() }

        // Cache key includes both domain and query type to distinguish A from AAAA queries
        let key = "\(domain.lowercased())_\(queryType)"
        let ttl = extractTTLFromDNSResponse(response) ?? defaultCacheTTL

        let entry = DNSCacheEntry(
            response: response,
            timestamp: Date(),
            ttl: ttl
        )

        dnsCache[key] = entry

        // LRU eviction if cache too large
        if dnsCache.count > maxCacheSize {
            // Remove oldest entry
            if let oldestKey = dnsCache.min(by: { $0.value.timestamp < $1.value.timestamp })?.key {
                dnsCache.removeValue(forKey: oldestKey)
                os_log("🗑 Cache full, evicted oldest entry", log: logger, type: .debug)
            }
        }

        os_log("💾 Cached %{public}@ type=%d with TTL %.1fs", log: logger, type: .debug, domain, queryType, ttl)
    }

    /**
     * Extract TTL from DNS response
     * Returns minimum TTL from all answer records
     * PERFORMANCE FIX: For NOERROR with 0 answers, return short TTL (60s) instead of nil
     * to avoid repeated queries for domains without A records
     */
    private func extractTTLFromDNSResponse(_ dnsResponse: Data) -> TimeInterval? {
        guard dnsResponse.count > 12 else { return nil }

        // Get answer count from header (bytes 6-7)
        let answerCount = Int(dnsResponse[6]) << 8 | Int(dnsResponse[7])

        // PERFORMANCE FIX: Cache "no records" responses with short TTL
        // NOERROR (rcode=0) with 0 answers is a valid response meaning domain exists but has no A record
        if answerCount == 0 {
            let rcode = Int(dnsResponse[3]) & 0x0F
            if rcode == 0 {
                // Return 60 second TTL for "no records" responses
                os_log("📝 NOERROR with 0 answers, using 60s TTL to prevent repeated queries", log: logger, type: .info)
                return 60.0
            }
            // For other error codes (NXDOMAIN, SERVFAIL, etc.), still return nil to use default
            return nil
        }

        var minTTL: UInt32? = nil
        var index = 12

        // Skip question section
        while index < dnsResponse.count {
            let length = Int(dnsResponse[index])
            if length == 0 {
                index += 1
                break
            }
            index += 1 + length
        }
        index += 4  // Skip QTYPE and QCLASS

        // Parse answer section
        for _ in 0..<answerCount {
            guard index + 12 <= dnsResponse.count else { break }

            // Handle name (might be compressed with pointer)
            if dnsResponse[index] & 0xC0 == 0xC0 {
                index += 2
            } else {
                while index < dnsResponse.count {
                    let length = Int(dnsResponse[index])
                    if length == 0 {
                        index += 1
                        break
                    }
                    index += 1 + length
                }
            }

            guard index + 10 <= dnsResponse.count else { break }

            // Skip TYPE (2 bytes) and CLASS (2 bytes)
            index += 4

            // Read TTL (4 bytes)
            let ttl = UInt32(dnsResponse[index]) << 24 |
                     UInt32(dnsResponse[index + 1]) << 16 |
                     UInt32(dnsResponse[index + 2]) << 8 |
                     UInt32(dnsResponse[index + 3])
            index += 4

            if minTTL == nil || ttl < minTTL! {
                minTTL = ttl
            }

            // Read RDLENGTH and skip RDATA
            let rdLength = Int(dnsResponse[index]) << 8 | Int(dnsResponse[index + 1])
            index += 2 + rdLength
        }

        if let ttl = minTTL {
            // Respect original TTL with minimal bounds:
            // - Minimum: 5 seconds (prevent 0 TTL causing issues)
            // - Maximum: 1 hour (prevent excessive cache growth)
            // This allows CDN and dynamic DNS records to refresh properly
            return TimeInterval(min(max(ttl, 5), 3600))
        }

        return nil
    }
}

// MARK: - Supporting Structures

struct DNSQuery {
    let domain: String
    let packet: Data
    let queryType: UInt16  // 1 = A (IPv4), 28 = AAAA (IPv6)
}

struct DNSCacheEntry {
    let response: Data
    let timestamp: Date
    let ttl: TimeInterval
}

struct VPNMessage: Codable {
    let type: String
    let domain: String?
    let dnsServer: String?
    let ednsDoEnabled: Bool?
}

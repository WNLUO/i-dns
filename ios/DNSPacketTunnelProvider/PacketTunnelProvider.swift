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
    private var dnsServer: String = "https://i-dns.wnluo.com/dns-query" // I-DNS DoH
    private var dnsServerType: String = "doh" // "udp" or "doh"
    private let logger = OSLog(subsystem: "com.idns.vpn", category: "PacketTunnel")
    private var udpSession: NWConnection?
    private var cleanupTimer: Timer?

    // Concurrency control for DNS queries - SERIAL queue to prevent connection overload
    private let queryQueue = DispatchQueue(label: "com.idns.dns.query", qos: .userInitiated)  // SERIAL, not concurrent!

    // Single shared UDP connection - reuse for all queries
    private var sharedUDPConnection: NWConnection?
    private let connectionLock = NSLock()

    // DNS Cache to reduce redundant queries
    private var dnsCache: [String: DNSCacheEntry] = [:]
    private let dnsCacheLock = NSLock()
    private let maxCacheSize = 200
    private let defaultCacheTTL: TimeInterval = 300  // 5 minutes

    // DNS query deduplication - CURRENTLY DISABLED
    // TODO: Implement response caching instead of dropping duplicate queries
    // private var recentQueries: [String: Date] = [:]
    // private let queryDeduplicationWindow: TimeInterval = 1.0  // 1 second window

    // Loop detection - track query counts per domain with timestamps
    private var queryCounter: [String: (count: Int, lastSeen: Date)] = [:]
    private let queryCounterLock = NSLock()
    private let maxQueriesPerDomain = 6  // Max queries for same domain within short time (iOS often queries 3-4 times: HTTPS/65, AAAA/28, A/1, retry)
    private let queryCounterResetInterval: TimeInterval = 2.0  // Reset counter after 2 seconds

    // Request deduplication - track in-flight requests to prevent concurrent queries for same domain
    private var inflightRequests: Set<String> = []
    private let inflightRequestsLock = NSLock()

    // Cache for DoH server IP addresses (resolved before VPN starts)
    private var dohServerIPs: [String] = []
    private let dohServerHostname = "i-dns.wnluo.com"

    // Reliable DNS servers for direct UDP queries (China mainland)
    // IMPORTANT: These DNS servers MUST NOT be in includedRoutes to avoid routing loops
    // Using DNS servers that are not intercepted by VPN
    private let reliableDNSServers = ["180.76.76.76", "114.114.114.114", "1.2.4.8"]

    // URLSession for DoH requests with optimized configuration
    private lazy var dohSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5.0  // Reduced from 10s to 5s - fail fast
        config.timeoutIntervalForResource = 5.0  // Reduced from 15s to 5s - prevent hanging
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.waitsForConnectivity = false
        config.allowsCellularAccess = true  // Ensure cellular works
        config.allowsExpensiveNetworkAccess = true
        config.allowsConstrainedNetworkAccess = true
        return URLSession(configuration: config)
    }()

    // App Group for sharing data with main app
    private let appGroupIdentifier = "group.org.reactjs.native.example.iDNS"

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("========================================", log: logger, type: .info)
        os_log("🚀 Starting VPN tunnel", log: logger, type: .info)
        os_log("========================================", log: logger, type: .info)

        // CRITICAL: Pre-resolve DoH server hostname BEFORE starting VPN
        // This avoids circular dependency where VPN intercepts DNS needed to access DoH server
        os_log("🔍 Pre-resolving DoH server hostname: %{public}@", log: logger, type: .info, dohServerHostname)
        resolveDohServerIP { [weak self] in
            guard let self = self else { return }
            self.continueStartTunnel(options: options, completionHandler: completionHandler)
        }
    }

    private func continueStartTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        // Try to load DNS configuration from protocol configuration first
        if let protocolConfig = self.protocolConfiguration as? NETunnelProviderProtocol,
           let providerConfig = protocolConfig.providerConfiguration,
           let dns = providerConfig["dnsServer"] as? String {
            dnsServer = dns
            // Detect DNS type
            if dns.hasPrefix("https://") || dns.hasPrefix("http://") {
                dnsServerType = "doh"
                os_log("✓ DNS server loaded from protocol config (DoH)", log: logger, type: .info)
            } else {
                dnsServerType = "udp"
                os_log("✓ DNS server loaded from protocol config (UDP)", log: logger, type: .info)
            }
            os_log("DNS Server: %{public}@", log: logger, type: .info, dns)
            os_log("DNS Type: %{public}@", log: logger, type: .info, dnsServerType)
        }

        // Load configuration from options (can override protocol config)
        if let options = options {
            os_log("Options provided: %{public}@", log: logger, type: .info, String(describing: options))
            if let dns = options["dnsServer"] as? String {
                dnsServer = dns
                // Detect DNS type
                if dns.hasPrefix("https://") || dns.hasPrefix("http://") {
                    dnsServerType = "doh"
                    os_log("✓ DNS server configured from options (DoH)", log: logger, type: .info)
                } else {
                    dnsServerType = "udp"
                    os_log("✓ DNS server configured from options (UDP)", log: logger, type: .info)
                }
                os_log("DNS Server: %{public}@", log: logger, type: .info, dns)
                os_log("DNS Type: %{public}@", log: logger, type: .info, dnsServerType)
            }
        }

        os_log("Final DNS Configuration:", log: logger, type: .info)
        os_log("  DNS Server: %{public}@", log: logger, type: .info, dnsServer)
        os_log("  DNS Type: %{public}@", log: logger, type: .info, dnsServerType)

        // Load blacklist and whitelist from shared storage
        loadFilterRules()

        // Configure VPN settings
        let settings = createTunnelSettings()

        // Apply settings
        setTunnelNetworkSettings(settings) { error in
            if let error = error {
                os_log("Failed to set tunnel settings: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                completionHandler(error)
                return
            }

            os_log("VPN tunnel started successfully", log: self.logger, type: .info)

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
        connectionLock.unlock()

        // Clear DNS cache
        dnsCacheLock.lock()
        dnsCache.removeAll()
        dnsCacheLock.unlock()

        // CRITICAL FIX: Invalidate and cancel URLSession to prevent memory leak
        // This ensures all pending DoH requests are cancelled and callbacks are released
        dohSession.invalidateAndCancel()
        os_log("✓ URLSession invalidated and cancelled", log: logger, type: .info)

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
                blacklist.insert(domain.lowercased())
                saveFilterRules()
                os_log("Added to blacklist: %{public}@", log: logger, type: .info, domain)
            }

        case "removeBlacklist":
            if let domain = message.domain {
                blacklist.remove(domain.lowercased())
                saveFilterRules()
                os_log("Removed from blacklist: %{public}@", log: logger, type: .info, domain)
            }

        case "addWhitelist":
            if let domain = message.domain {
                whitelist.insert(domain.lowercased())
                saveFilterRules()
                os_log("Added to whitelist: %{public}@", log: logger, type: .info, domain)
            }

        case "removeWhitelist":
            if let domain = message.domain {
                whitelist.remove(domain.lowercased())
                saveFilterRules()
                os_log("Removed from whitelist: %{public}@", log: logger, type: .info, domain)
            }

        case "updateDNS":
            if let dns = message.dnsServer {
                os_log("========================================", log: logger, type: .info)
                os_log("🔄 Updating DNS Server", log: logger, type: .info)
                os_log("Old DNS: %{public}@", log: logger, type: .info, dnsServer)
                os_log("Old Type: %{public}@", log: logger, type: .info, dnsServerType)

                dnsServer = dns

                // Detect DNS server type based on URL format
                if dns.hasPrefix("https://") || dns.hasPrefix("http://") {
                    dnsServerType = "doh"
                    os_log("✓ DNS server updated to DoH", log: logger, type: .info)

                    // Re-resolve DoH server IP for the new server
                    os_log("🔍 Re-resolving DoH server hostname...", log: logger, type: .info)
                    resolveDohServerIP {
                        os_log("✅ DoH server IP re-resolved", log: self.logger, type: .info)
                    }
                } else {
                    dnsServerType = "udp"
                    os_log("✓ DNS server updated to UDP", log: logger, type: .info)
                }

                os_log("New DNS: %{public}@", log: logger, type: .info, dns)
                os_log("New Type: %{public}@", log: logger, type: .info, dnsServerType)
                os_log("✅ DNS update complete, will take effect on next query", log: logger, type: .info)
                os_log("========================================", log: logger, type: .info)
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

        // DNS-ONLY MODE: Only intercept DNS traffic (for ad blocking / parental control)
        os_log("✓ Configuring DNS-ONLY mode - only DNS queries will be intercepted", log: logger, type: .info)

        // Route common DNS servers through VPN to intercept DNS queries
        // This ensures all DNS queries go through our VPN regardless of which DNS the app uses
        // Using China mainland DNS servers for better DoH resolution performance
        let tencentDNS1 = NEIPv4Route(destinationAddress: "119.29.29.29", subnetMask: "255.255.255.255")  // 腾讯云DNSPod
        let tencentDNS2 = NEIPv4Route(destinationAddress: "182.254.116.116", subnetMask: "255.255.255.255")  // 腾讯云备用
        let aliDNS1 = NEIPv4Route(destinationAddress: "223.5.5.5", subnetMask: "255.255.255.255")  // 阿里云公共DNS
        let aliDNS2 = NEIPv4Route(destinationAddress: "223.6.6.6", subnetMask: "255.255.255.255")  // 阿里云备用
        // NOTE: 180.76.76.76 (Baidu DNS) is NOT included here - reserved for Direct DNS queries to avoid routing loops
        let googleDNS1 = NEIPv4Route(destinationAddress: "8.8.8.8", subnetMask: "255.255.255.255")  // Google DNS
        let googleDNS2 = NEIPv4Route(destinationAddress: "8.8.4.4", subnetMask: "255.255.255.255")  // Google DNS备用
        let cloudflareDNS = NEIPv4Route(destinationAddress: "1.1.1.1", subnetMask: "255.255.255.255")  // Cloudflare DNS

        // CRITICAL: Do NOT include DNS servers used by reliableDNSServers (180.76.76.76, 114.114.114.114, 1.2.4.8)
        // This prevents routing loops when forwardDNSQueryDirect() creates direct UDP connections
        ipv4Settings.includedRoutes = [tencentDNS1, tencentDNS2, aliDNS1, aliDNS2, googleDNS1, googleDNS2, cloudflareDNS]

        // Exclude DoH server IPs from VPN routing to prevent circular dependency
        var excludedRoutes: [NEIPv4Route] = []
        for ipString in dohServerIPs {
            // Only add IPv4 addresses
            if ipString.contains(".") && !ipString.contains(":") {
                let route = NEIPv4Route(destinationAddress: ipString, subnetMask: "255.255.255.255")
                // Don't set gatewayAddress - let system use default routing
                excludedRoutes.append(route)
                os_log("  Excluding DoH server IP from VPN: %{public}@", log: logger, type: .info, ipString)
            }
        }

        // IMPORTANT: Also exclude the UDP DNS server we're using for forwarding
        // This prevents routing loops when forwarding DNS queries
        if dnsServerType == "udp" && !dnsServer.isEmpty {
            let dnsRoute = NEIPv4Route(destinationAddress: dnsServer, subnetMask: "255.255.255.255")
            // Don't set gatewayAddress - let system use default routing
            excludedRoutes.append(dnsRoute)
            os_log("  Excluding UDP DNS server from VPN: %{public}@", log: logger, type: .info, dnsServer)
        }

        ipv4Settings.excludedRoutes = excludedRoutes

        settings.ipv4Settings = ipv4Settings

        // CRITICAL: Force all apps to use specific DNS servers that are in includedRoutes
        // This ensures VPN can intercept all DNS queries regardless of device's original DNS settings
        // Using China mainland DNS for better performance
        // Circular dependency is avoided because VPN's own DoH resolution uses direct UDP queries
        let dnsSettings = NEDNSSettings(servers: ["119.29.29.29", "223.5.5.5"])
        dnsSettings.matchDomains = [""]  // Match all domains - force DNS for all queries
        settings.dnsSettings = dnsSettings

        os_log("========================================", log: logger, type: .info)
        os_log("✓ VPN tunnel settings configured (DNS-ONLY MODE)", log: logger, type: .info)
        os_log("  Mode: DNS Filtering for Ad Blocking", log: logger, type: .info)
        os_log("  Remote Address: 240.0.0.1", log: logger, type: .info)
        os_log("  Local Address: 240.0.0.2", log: logger, type: .info)
        os_log("  Forced DNS: 119.29.29.29, 223.5.5.5 (All apps will use these, will be intercepted)", log: logger, type: .info)
        os_log("  Included Routes: DNS servers (Tencent, Aliyun, Google, Cloudflare) - 7 routes", log: logger, type: .info)
        os_log("  Direct DNS Servers (NOT intercepted): 180.76.76.76, 114.114.114.114, 1.2.4.8", log: logger, type: .info)
        os_log("  Excluded Routes: %d (DoH + UDP DNS servers)", log: logger, type: .info, excludedRoutes.count)
        os_log("  DNS forwarding to: %{public}@", log: logger, type: .info, dnsServer)
        os_log("  DNS Type: %{public}@", log: logger, type: .info, dnsServerType)
        os_log("  HTTP/HTTPS traffic: Direct (not routed through VPN)", log: logger, type: .info)
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
            // Not a DNS packet - should not happen in DNS-only mode
            // but if it does, just drop it (don't forward)
            os_log("⚠️ Received non-DNS packet, size: %d, protocol: %d", log: logger, type: .error, packet.count, protocolNumber)
            return
        }

        let domain = dnsQuery.domain.lowercased()
        os_log("📥 Received DNS query: %{public}@ (type: %d)", log: logger, type: .info, domain, dnsQuery.queryType)

        // Loop detection: check if we're processing same domain too many times
        queryCounterLock.lock()
        let now = Date()

        // Check if we have a recent counter entry
        if let entry = queryCounter[domain] {
            let timeSinceLastQuery = now.timeIntervalSince(entry.lastSeen)

            // If last query was more than 2 seconds ago, reset counter
            if timeSinceLastQuery > queryCounterResetInterval {
                queryCounter[domain] = (count: 1, lastSeen: now)
            } else {
                queryCounter[domain] = (count: entry.count + 1, lastSeen: now)
            }
        } else {
            queryCounter[domain] = (count: 1, lastSeen: now)
        }

        let count = queryCounter[domain]!.count
        queryCounterLock.unlock()

        if count > maxQueriesPerDomain {
            os_log("🔴 LOOP DETECTED: %{public}@ queried %d times in quick succession! Dropping to prevent infinite loop", log: logger, type: .error, domain, count)
            return
        }

        if count > 1 {
            os_log("  ⚠️ Query count for %{public}@: %d (within 2s window)", log: logger, type: .info, domain, count)
        }

        // Handle IPv6 (AAAA) queries - return empty response to avoid unnecessary processing
        // Most apps query both A and AAAA simultaneously, causing duplicate processing
        if dnsQuery.queryType == 28 {  // AAAA record (IPv6)
            os_log("⏭ Skipping IPv6 (AAAA) query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)
            // Return empty answer (no IPv6 support)
            if let emptyResponse = createEmptyAAAAResponse(for: packet) {
                packetFlow.writePackets([emptyResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            return
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

        // CRITICAL FIX: Bypass DNS queries for DoH server itself to prevent circular dependency
        // This prevents the infinite loop where:
        // 1. App needs to query DoH server (i-dns.wnluo.com)
        // 2. DoH server domain needs DNS resolution
        // 3. DNS query is intercepted by VPN
        // 4. VPN needs to contact DoH server -> back to step 1 (infinite loop)
        if shouldBypassDNSQuery(domain) {
            os_log("⏭ Bypassing DoH server DNS query: %{public}@", log: logger, type: .info, domain)
            // Use direct DNS query (not through DoH) to avoid circular dependency
            // This forwards the query directly to a reliable DNS server and returns the response
            forwardDNSQueryDirect(dnsQuery: dnsQuery, originalPacket: packet, protocolNumber: protocolNumber)
            return
        }

        // DEDUPLICATION DISABLED: Removed because it was causing queries to be dropped without responses
        // iOS may send multiple queries with different transaction IDs, each needs a response
        // IPv6 filtering already reduces query volume by 50%
        // Future: Implement response caching instead of dropping duplicate queries

        // This is a DNS packet - apply filtering
        os_log("DNS query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

        // Check if domain should be blocked
        let shouldBlock = shouldBlockDomain(dnsQuery.domain)

        if shouldBlock {
            // Block by returning NXDOMAIN response immediately
            os_log("🚫 Blocking domain: %{public}@", log: logger, type: .info, dnsQuery.domain)
            if let blockResponse = createBlockResponse(for: packet) {
                packetFlow.writePackets([blockResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
            // Send event with 0 latency for blocked domains
            sendDNSEvent(domain: dnsQuery.domain, blocked: true, latency: 0)
        } else {
            // Forward to real DNS server and measure latency
            os_log("✅ Allowing domain: %{public}@", log: logger, type: .info, dnsQuery.domain)

            // Choose forwarding method based on DNS server type
            if dnsServerType == "doh" {
                os_log("📡 Using DoH method for query", log: logger, type: .info)
                forwardDNSQueryDoH(dnsQuery: dnsQuery, originalPacket: packet, protocolNumber: protocolNumber)
            } else {
                os_log("📡 Using UDP method for query", log: logger, type: .info)
                forwardDNSQueryUDP(dnsQuery: dnsQuery, originalPacket: packet, protocolNumber: protocolNumber)
            }
        }
    }

    private func forwardDNSQueryUDP(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        let startTime = Date()

        // 1. Check cache first (before any async operations)
        if let cachedResponse = getCachedDNSResponse(domain: dnsQuery.domain) {
            os_log("✓ DNS cache hit for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)
            let resolvedIP = parseResolvedIP(from: cachedResponse) ?? ""

            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: cachedResponse)

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
            let connection = self.getOrCreateSharedConnection()

            // Set timeout for this specific query
            let timeoutWorkItem = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                os_log("⏱ DNS query timeout for: %{public}@", log: self.logger, type: .error, dnsQuery.domain)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0, resolvedIP: "")
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 5.0, execute: timeoutWorkItem)

            // 4. Send DNS query using shared connection
            connection.send(content: dnsQueryData, completion: .contentProcessed { [weak self] error in
                guard let self = self else {
                    timeoutWorkItem.cancel()
                    return
                }

                if let error = error {
                    os_log("Failed to send DNS query: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0)
                    timeoutWorkItem.cancel()

                    // FIX: Don't reset connection immediately - only mark for recreation
                    // The serial queue ensures only one query uses it at a time
                    self.connectionLock.lock()
                    if self.sharedUDPConnection === connection {
                        self.sharedUDPConnection?.cancel()
                        self.sharedUDPConnection = nil
                        os_log("⚠️ Shared UDP connection reset due to send error", log: self.logger, type: .info)
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
                        os_log("Failed to receive DNS response: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                        self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency)

                        // FIX: Only reset if this is still the shared connection
                        self.connectionLock.lock()
                        if self.sharedUDPConnection === connection {
                            self.sharedUDPConnection?.cancel()
                            self.sharedUDPConnection = nil
                            os_log("⚠️ Shared UDP connection reset due to receive error", log: self.logger, type: .info)
                        }
                        self.connectionLock.unlock()
                        return
                    }

                    guard let responseData = content else {
                        os_log("Empty DNS response", log: self.logger, type: .error)
                        self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: "")
                        return
                    }

                    // 6. Cache the response
                    self.cacheDNSResponse(domain: dnsQuery.domain, response: responseData)

                    // Parse resolved IP from DNS response
                    let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""

                    // Send event to main app with actual latency and resolved IP
                    self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: responseData)
                    os_log("DNS query completed in %d ms, resolved to: %{public}@", log: self.logger, type: .debug, latency, resolvedIP)

                    // Create response packet (reconstruct IP + UDP + DNS)
                    if let responsePacket = self.createDNSResponsePacket(
                        originalPacket: originalPacket,
                        dnsResponse: responseData,
                        ipHeaderLength: ipHeaderLength
                    ) {
                        self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
                    }
                }
            })
        }
    }

    /// Forward DNS query using direct UDP connection (bypassing VPN tunnel)
    /// This is used for DoH server domain queries to avoid circular dependency
    private func forwardDNSQueryDirect(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        let startTime = Date()

        os_log("🔄 Direct DNS query for: %{public}@", log: logger, type: .info, dnsQuery.domain)

        // Extract DNS query data (skip IP and UDP headers)
        let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard originalPacket.count > dnsStart else {
            os_log("❌ Invalid packet size for direct query", log: logger, type: .error)
            return
        }

        let dnsQueryData = originalPacket.subdata(in: dnsStart..<originalPacket.count)

        // Use a reliable DNS server (not routed through VPN)
        // Try reliable DNS servers in order until one succeeds
        tryDirectDNSQuery(
            dnsQueryData: dnsQueryData,
            dnsServers: reliableDNSServers,
            currentIndex: 0,
            startTime: startTime,
            dnsQuery: dnsQuery,
            originalPacket: originalPacket,
            protocolNumber: protocolNumber,
            ipHeaderLength: ipHeaderLength
        )
    }

    /// Recursively try DNS servers until one succeeds
    private func tryDirectDNSQuery(
        dnsQueryData: Data,
        dnsServers: [String],
        currentIndex: Int,
        startTime: Date,
        dnsQuery: DNSQuery,
        originalPacket: Data,
        protocolNumber: UInt32,
        ipHeaderLength: Int
    ) {
        guard currentIndex < dnsServers.count else {
            os_log("❌ All DNS servers failed for direct query: %{public}@", log: logger, type: .error, dnsQuery.domain)
            // DO NOT send event - this is an internal query for DoH server domain
            // If this fails, the VPN will automatically fallback to UDP DNS mode (see fallbackToUDP)
            return
        }

        let dnsServer = dnsServers[currentIndex]
        os_log("🔍 Trying direct DNS server: %{public}@", log: logger, type: .info, dnsServer)

        // Create UDP connection to DNS server (bypasses VPN)
        let connection = NWConnection(
            host: NWEndpoint.Host(dnsServer),
            port: 53,
            using: .udp
        )

        // Set timeout
        let timeoutWorkItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            os_log("⏱ Direct DNS query timeout for %{public}@", log: self.logger, type: .error, dnsServer)
            connection.cancel()
            // Try next DNS server
            self.tryDirectDNSQuery(
                dnsQueryData: dnsQueryData,
                dnsServers: dnsServers,
                currentIndex: currentIndex + 1,
                startTime: startTime,
                dnsQuery: dnsQuery,
                originalPacket: originalPacket,
                protocolNumber: protocolNumber,
                ipHeaderLength: ipHeaderLength
            )
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }

            switch state {
            case .ready:
                // Send DNS query
                connection.send(content: dnsQueryData, completion: .contentProcessed { error in
                    if let error = error {
                        os_log("❌ Failed to send direct DNS query: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                        timeoutWorkItem.cancel()
                        connection.cancel()
                        // Try next DNS server
                        self.tryDirectDNSQuery(
                            dnsQueryData: dnsQueryData,
                            dnsServers: dnsServers,
                            currentIndex: currentIndex + 1,
                            startTime: startTime,
                            dnsQuery: dnsQuery,
                            originalPacket: originalPacket,
                            protocolNumber: protocolNumber,
                            ipHeaderLength: ipHeaderLength
                        )
                        return
                    }

                    // Receive DNS response
                    connection.receiveMessage { content, _, _, error in
                        timeoutWorkItem.cancel()
                        connection.cancel()

                        let latency = Int(Date().timeIntervalSince(startTime) * 1000)

                        if let error = error {
                            os_log("❌ Failed to receive direct DNS response: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                            // Try next DNS server
                            self.tryDirectDNSQuery(
                                dnsQueryData: dnsQueryData,
                                dnsServers: dnsServers,
                                currentIndex: currentIndex + 1,
                                startTime: startTime,
                                dnsQuery: dnsQuery,
                                originalPacket: originalPacket,
                                protocolNumber: protocolNumber,
                                ipHeaderLength: ipHeaderLength
                            )
                            return
                        }

                        guard let responseData = content else {
                            os_log("❌ Empty direct DNS response", log: self.logger, type: .error)
                            // Try next DNS server
                            self.tryDirectDNSQuery(
                                dnsQueryData: dnsQueryData,
                                dnsServers: dnsServers,
                                currentIndex: currentIndex + 1,
                                startTime: startTime,
                                dnsQuery: dnsQuery,
                                originalPacket: originalPacket,
                                protocolNumber: protocolNumber,
                                ipHeaderLength: ipHeaderLength
                            )
                            return
                        }

                        os_log("✅ Direct DNS query succeeded via %{public}@ in %d ms", log: self.logger, type: .info, dnsServer, latency)

                        // Cache the response
                        self.cacheDNSResponse(domain: dnsQuery.domain, response: responseData)

                        // Parse resolved IP for logging
                        let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""
                        os_log("✓ Resolved %{public}@ to: %{public}@", log: self.logger, type: .info, dnsQuery.domain, resolvedIP)

                        // DO NOT send event to UI - this is an internal query for DoH server domain
                        // Direct DNS queries are used to resolve DoH server domains to avoid circular dependency
                        // These queries should not appear in user-facing logs

                        // Create response packet and send back to app
                        if let responsePacket = self.createDNSResponsePacket(
                            originalPacket: originalPacket,
                            dnsResponse: responseData,
                            ipHeaderLength: ipHeaderLength
                        ) {
                            self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
                            os_log("✅ Direct DNS response sent to app", log: self.logger, type: .info)
                        }
                    }
                })

            case .failed(let error):
                os_log("❌ Direct DNS connection failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                timeoutWorkItem.cancel()
                connection.cancel()
                // Try next DNS server
                self.tryDirectDNSQuery(
                    dnsQueryData: dnsQueryData,
                    dnsServers: dnsServers,
                    currentIndex: currentIndex + 1,
                    startTime: startTime,
                    dnsQuery: dnsQuery,
                    originalPacket: originalPacket,
                    protocolNumber: protocolNumber,
                    ipHeaderLength: ipHeaderLength
                )

            default:
                break
            }
        }

        connection.start(queue: .global())
    }

    private func forwardDNSQueryDoH(dnsQuery: DNSQuery, originalPacket: Data, protocolNumber: UInt32) {
        let startTime = Date()

        os_log("=== DoH Query Start ===", log: logger, type: .info)
        os_log("Domain: %{public}@", log: logger, type: .info, dnsQuery.domain)
        os_log("DoH Server: %{public}@", log: logger, type: .info, dnsServer)

        // 1. Check if there's already an in-flight request for this domain
        inflightRequestsLock.lock()
        let isInflight = inflightRequests.contains(dnsQuery.domain)
        if !isInflight {
            inflightRequests.insert(dnsQuery.domain)
        }
        inflightRequestsLock.unlock()

        if isInflight {
            os_log("⏸ Request already in flight for: %{public}@, dropping duplicate", log: logger, type: .info, dnsQuery.domain)
            return
        }

        // Ensure we clean up the inflight request when done
        defer {
            inflightRequestsLock.lock()
            inflightRequests.remove(dnsQuery.domain)
            inflightRequestsLock.unlock()
        }

        // 2. Check cache first
        if let cachedResponse = getCachedDNSResponse(domain: dnsQuery.domain) {
            os_log("✓ DNS cache hit for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)
            let resolvedIP = parseResolvedIP(from: cachedResponse) ?? ""

            // Check if cached response is blocked (shouldn't happen since we don't cache blocked responses, but safety check)
            if resolvedIP == "0.0.0.0" {
                os_log("🚫 Cached response is blocked (0.0.0.0), returning NXDOMAIN", log: logger, type: .info)
                sendDNSEvent(domain: dnsQuery.domain, blocked: true, latency: latency, resolvedIP: "0.0.0.0", dnsResponse: cachedResponse)
                if let blockResponse = createBlockResponse(for: originalPacket) {
                    packetFlow.writePackets([blockResponse], withProtocols: [NSNumber(value: protocolNumber)])
                }
                return
            }

            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: cachedResponse)

            let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
            if let responsePacket = createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: cachedResponse,
                ipHeaderLength: ipHeaderLength
            ) {
                os_log("✓ Sending cached response packet to app", log: logger, type: .info)
                packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            } else {
                os_log("❌ Failed to create response packet from cache", log: logger, type: .error)
            }

            return
        }

        // Extract DNS query data (skip IP and UDP headers)
        let ipHeaderLength = Int((originalPacket[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard originalPacket.count > dnsStart else {
            os_log("❌ Invalid packet size: %d", log: logger, type: .error, originalPacket.count)
            return
        }

        let dnsQueryData = originalPacket.subdata(in: dnsStart..<originalPacket.count)
        os_log("DNS query data size: %d bytes", log: logger, type: .info, dnsQueryData.count)

        // Create HTTPS request for DoH
        // We can use the domain name because we've excluded the resolved IP from VPN routing
        guard let url = URL(string: dnsServer) else {
            os_log("❌ Invalid DoH URL: %{public}@", log: logger, type: .error, dnsServer)
            sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: 0)
            return
        }

        os_log("✓ DoH URL created: %{public}@", log: logger, type: .info, url.absoluteString)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")
        request.setValue(String(dnsQueryData.count), forHTTPHeaderField: "Content-Length")
        request.httpBody = dnsQueryData
        request.timeoutInterval = 5.0  // Reduced from 10s to 5s - fail fast

        os_log("DoH Request configured:", log: logger, type: .info)
        os_log("  Method: POST", log: logger, type: .info)
        os_log("  Content-Type: application/dns-message", log: logger, type: .info)
        os_log("  Accept: application/dns-message", log: logger, type: .info)
        os_log("  Content-Length: %d", log: logger, type: .info, dnsQueryData.count)
        os_log("  Body size: %d bytes", log: logger, type: .info, dnsQueryData.count)
        os_log("  Timeout: 5.0s", log: logger, type: .info)

        os_log("📤 Sending DoH request...", log: logger, type: .info)

        let task = dohSession.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            let latency = Int(Date().timeIntervalSince(startTime) * 1000)

            if let error = error {
                let nsError = error as NSError
                os_log("❌ DoH request failed after %d ms", log: self.logger, type: .error, latency)
                os_log("   Error: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                os_log("   Error code: %d", log: self.logger, type: .error, nsError.code)
                os_log("   Error domain: %{public}@", log: self.logger, type: .error, nsError.domain)

                // 详细的错误诊断
                switch nsError.code {
                case NSURLErrorTimedOut:
                    os_log("   ⚠️ Timeout: DoH server took too long to respond", log: self.logger, type: .error)
                case NSURLErrorCannotConnectToHost:
                    os_log("   ⚠️ Cannot connect: Check if DoH server is reachable", log: self.logger, type: .error)
                case NSURLErrorNetworkConnectionLost:
                    os_log("   ⚠️ Network lost: Connection interrupted", log: self.logger, type: .error)
                case NSURLErrorNotConnectedToInternet:
                    os_log("   ⚠️ No internet: Device is offline", log: self.logger, type: .error)
                case NSURLErrorSecureConnectionFailed:
                    os_log("   ⚠️ SSL error: Certificate validation failed", log: self.logger, type: .error)
                case NSURLErrorServerCertificateUntrusted:
                    os_log("   ⚠️ Certificate untrusted: SSL certificate issue", log: self.logger, type: .error)
                case NSURLErrorCannotFindHost:
                    os_log("   ⚠️ DNS lookup failed: Cannot resolve DoH server hostname", log: self.logger, type: .error)
                default:
                    os_log("   ⚠️ Unknown error type", log: self.logger, type: .error)
                }

                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency)
                return
            }

            os_log("📥 DoH response received after %d ms", log: self.logger, type: .info, latency)

            // Check HTTP response
            if let httpResponse = response as? HTTPURLResponse {
                os_log("HTTP Status: %d", log: self.logger, type: .info, httpResponse.statusCode)
                os_log("HTTP Headers:", log: self.logger, type: .info)
                for (key, value) in httpResponse.allHeaderFields {
                    os_log("  %{public}@: %{public}@", log: self.logger, type: .info, String(describing: key), String(describing: value))
                }

                // 验证Content-Type
                if let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") {
                    if contentType.contains("application/dns-message") {
                        os_log("✓ Content-Type validated: %{public}@", log: self.logger, type: .info, contentType)
                    } else {
                        os_log("⚠️ Unexpected Content-Type: %{public}@", log: self.logger, type: .error, contentType)
                        os_log("   Expected: application/dns-message", log: self.logger, type: .error)
                    }
                }

                if httpResponse.statusCode != 200 {
                    os_log("❌ DoH HTTP error: %d", log: self.logger, type: .error, httpResponse.statusCode)

                    // 详细的HTTP错误码说明
                    switch httpResponse.statusCode {
                    case 400:
                        os_log("   Bad Request: DNS query format invalid", log: self.logger, type: .error)
                    case 404:
                        os_log("   Not Found: DoH endpoint not available", log: self.logger, type: .error)
                    case 413:
                        os_log("   Payload Too Large: DNS query too big", log: self.logger, type: .error)
                    case 415:
                        os_log("   Unsupported Media Type: Wrong Content-Type", log: self.logger, type: .error)
                    case 500, 502, 503:
                        os_log("   Server Error: DoH server having issues", log: self.logger, type: .error)
                    default:
                        break
                    }

                    self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency)
                    return
                }
            } else {
                os_log("⚠️ No HTTP response received", log: self.logger, type: .error)
            }

            guard let responseData = data, !responseData.isEmpty else {
                os_log("❌ Empty DoH response", log: self.logger, type: .error)
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: "", dnsResponse: nil)
                return
            }

            os_log("✓ DoH response data size: %d bytes", log: self.logger, type: .info, responseData.count)

            // Parse DNS response details for logging
            let rcode = responseData.count > 3 ? Int(responseData[3]) & 0x0F : -1
            let answerCount = responseData.count > 7 ? Int(responseData[6]) << 8 | Int(responseData[7]) : 0
            let rcodeString: String
            switch rcode {
            case 0: rcodeString = "NOERROR"
            case 3: rcodeString = "NXDOMAIN"
            case 2: rcodeString = "SERVFAIL"
            case 5: rcodeString = "REFUSED"
            default: rcodeString = "Unknown(\(rcode))"
            }

            // Parse resolved IP from DNS response FIRST (before caching)
            let resolvedIP = self.parseResolvedIP(from: responseData) ?? ""

            os_log("📊 DNS Response Analysis:", log: self.logger, type: .info)
            os_log("  RCODE: %{public}@ (%d)", log: self.logger, type: .info, rcodeString, rcode)
            os_log("  Answer Count: %d", log: self.logger, type: .info, answerCount)
            os_log("  Parsed IP: %{public}@", log: self.logger, type: .info, resolvedIP.isEmpty ? "(no A records)" : resolvedIP)

            // CRITICAL FIX: Detect if DoH server blocked the domain (returns 0.0.0.0 or empty)
            // When blocked, send NXDOMAIN instead of 0.0.0.0 to properly signal to apps
            // Do NOT cache blocked responses to avoid poisoning cache
            let isBlockedByDohServer = resolvedIP == "0.0.0.0"

            if isBlockedByDohServer {
                os_log("🚫 DoH server blocked domain: %{public}@ (returned 0.0.0.0)", log: self.logger, type: .info, dnsQuery.domain)

                // Send blocked event with original DoH response
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: true, latency: latency, resolvedIP: "0.0.0.0", dnsResponse: responseData)

                // Return NXDOMAIN to properly signal blocking (DO NOT CACHE)
                if let blockResponse = self.createBlockResponse(for: originalPacket) {
                    os_log("✓ Sending NXDOMAIN response for blocked domain", log: self.logger, type: .info)
                    self.packetFlow.writePackets([blockResponse], withProtocols: [NSNumber(value: protocolNumber)])
                }
                return
            }

            // Only cache responses that are useful
            // Don't cache NOERROR with 0 answers (except for actual NXDOMAIN which has rcode=3)
            if rcode == 0 && answerCount == 0 && resolvedIP.isEmpty {
                os_log("⚠️ Not caching NOERROR with 0 answers (likely incomplete/temporary response)", log: self.logger, type: .info)
                // Send event but don't cache
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: responseData)
            } else {
                // Cache valid responses (has answers OR is NXDOMAIN)
                self.cacheDNSResponse(domain: dnsQuery.domain, response: responseData)
                // Send event to main app with actual latency and resolved IP
                self.sendDNSEvent(domain: dnsQuery.domain, blocked: false, latency: latency, resolvedIP: resolvedIP, dnsResponse: responseData)
            }
            os_log("✅ DoH query completed successfully in %d ms, resolved to: %{public}@", log: self.logger, type: .info, latency, resolvedIP)
            os_log("=== DoH Query End ===", log: self.logger, type: .info)

            // Create response packet (reconstruct IP + UDP + DNS)
            if let responsePacket = self.createDNSResponsePacket(
                originalPacket: originalPacket,
                dnsResponse: responseData,
                ipHeaderLength: ipHeaderLength
            ) {
                os_log("✓ Response packet created, sending back to app", log: self.logger, type: .info)
                self.packetFlow.writePackets([responsePacket], withProtocols: [NSNumber(value: protocolNumber)])
            } else {
                os_log("❌ Failed to create response packet", log: self.logger, type: .error)
            }
        }

        task.resume()
        os_log("DoH task started", log: logger, type: .info)
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

    /// Check if DNS query should bypass VPN interception entirely
    /// This is critical to prevent circular dependency with DoH server resolution
    private func shouldBypassDNSQuery(_ domain: String) -> Bool {
        let normalizedDomain = domain.lowercased()

        // List of DoH server domains that should never be intercepted
        // This prevents infinite loop where VPN intercepts DNS queries needed to reach the DoH server itself
        let dohServerDomains = [
            "i-dns.wnluo.com"            // I-DNS DoH server
        ]

        // Check if the domain matches any DoH server domain (exact match or subdomain)
        for dohDomain in dohServerDomains {
            if normalizedDomain == dohDomain || normalizedDomain.hasSuffix("." + dohDomain) {
                return true
            }
        }

        // Also bypass if the domain appears in the current dnsServer URL
        // This handles custom DoH servers dynamically
        if dnsServerType == "doh" {
            // Extract hostname from DoH URL
            if let url = URL(string: dnsServer), let host = url.host {
                let hostLowercased = host.lowercased()
                if normalizedDomain == hostLowercased || normalizedDomain.hasSuffix("." + hostLowercased) {
                    return true
                }
            }
        }

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
        for blacklistedDomain in blacklist {
            // Check for wildcard patterns
            if blacklistedDomain.contains("*") {
                let pattern = blacklistedDomain.replacingOccurrences(of: "*", with: ".*")
                if let regex = try? NSRegularExpression(pattern: "^" + pattern + "$", options: .caseInsensitive) {
                    let range = NSRange(domain.startIndex..., in: domain)
                    if regex.firstMatch(in: domain, range: range) != nil {
                        return true
                    }
                }
            } else {
                // Exact match or subdomain match
                if domain == blacklistedDomain || domain.hasSuffix("." + blacklistedDomain) {
                    return true
                }
            }
        }
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

    private func sendDNSEvent(domain: String, blocked: Bool, latency: Int, resolvedIP: String = "", dnsResponse: Data? = nil) {
        // Send event to main app via Darwin notification or shared storage
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            return
        }

        // Determine display info based on status and resolved IP
        let displayInfo: String
        if blocked {
            displayInfo = "已拦截"
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
        } else if resolvedIP == "0.0.0.0" || resolvedIP == "::" || resolvedIP == "::0" {
            // DoH server blocked the domain (returns 0.0.0.0 or ::)
            displayInfo = "已拦截"
        } else {
            displayInfo = resolvedIP
        }

        let event: [String: Any] = [
            "domain": domain,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "status": blocked ? "blocked" : "allowed",
            "category": displayInfo,  // Now stores IP address or status
            "latency": latency
        ]

        // Save to shared storage (main app will read this)
        var events = sharedDefaults.array(forKey: "dnsEvents") as? [[String: Any]] ?? []

        // MEMORY LEAK FIX: Remove events older than 24 hours before adding new event
        let now = Date()
        let maxAge: TimeInterval = 24 * 60 * 60 // 24 hours
        events = events.filter { eventDict in
            guard let timestampStr = eventDict["timestamp"] as? String,
                  let timestamp = ISO8601DateFormatter().date(from: timestampStr) else {
                // Remove events with invalid timestamps
                return false
            }
            return now.timeIntervalSince(timestamp) < maxAge
        }

        events.append(event)

        // Keep only last 1000 events (secondary limit)
        if events.count > 1000 {
            events = Array(events.suffix(1000))
        }

        sharedDefaults.set(events, forKey: "dnsEvents")
        sharedDefaults.synchronize()

        // Post notification
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.idns.dnsEvent" as CFString),
            nil, nil, true
        )
    }

    /// Parse DNS response to extract the first A record (IPv4 address)
    private func parseResolvedIP(from dnsResponse: Data) -> String? {
        // DNS response structure:
        // Header: 12 bytes
        // Question section: variable
        // Answer section: contains A records

        guard dnsResponse.count > 12 else { return nil }

        // Get answer count from header (bytes 6-7)
        let answerCount = Int(dnsResponse[6]) << 8 | Int(dnsResponse[7])
        guard answerCount > 0 else { return nil }

        // Skip header (12 bytes)
        var index = 12

        // Skip question section
        // Question format: QNAME (variable) + QTYPE (2) + QCLASS (2)
        while index < dnsResponse.count {
            let length = Int(dnsResponse[index])
            if length == 0 {
                index += 1  // Skip null terminator
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
                // Compressed name (pointer)
                index += 2
            } else {
                // Regular name
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

            // Skip CLASS (2 bytes)
            index += 2

            // Skip TTL (4 bytes)
            index += 4

            // Read RDLENGTH (2 bytes)
            let rdLength = Int(dnsResponse[index]) << 8 | Int(dnsResponse[index + 1])
            index += 2

            // Check if this is an A record (TYPE = 1) with 4 bytes of data
            if recordType == 1 && rdLength == 4 && index + 4 <= dnsResponse.count {
                // Extract IPv4 address
                let ip = "\(dnsResponse[index]).\(dnsResponse[index + 1]).\(dnsResponse[index + 2]).\(dnsResponse[index + 3])"
                return ip
            }

            // Skip RDATA
            index += rdLength
        }

        return nil
    }

    private func loadFilterRules() {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            os_log("Failed to access shared defaults", log: logger, type: .error)
            return
        }

        if let savedBlacklist = sharedDefaults.array(forKey: "blacklist") as? [String] {
            blacklist = Set(savedBlacklist.map { $0.lowercased() })
            os_log("Loaded %d blacklist rules", log: logger, type: .info, blacklist.count)
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
        sharedDefaults.synchronize()
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

    private func resolveDohServerIP(completion: @escaping () -> Void) {
        // Use direct UDP query to reliable DNS servers (bypassing system DNS)
        // This avoids circular dependency where system DNS is intercepted by VPN
        os_log("🔍 Resolving DoH server using direct UDP queries to reliable DNS", log: self.logger, type: .info)

        tryResolveWithDNS(hostname: dohServerHostname,
                          dnsServers: reliableDNSServers,
                          currentIndex: 0,
                          completion: completion)
    }

    private func tryResolveWithDNS(hostname: String,
                                    dnsServers: [String],
                                    currentIndex: Int,
                                    completion: @escaping () -> Void) {
        guard currentIndex < dnsServers.count else {
            os_log("❌ All DNS servers failed to resolve %{public}@", log: logger, type: .error, hostname)
            // Fallback to UDP DNS mode
            fallbackToUDP()
            completion()
            return
        }

        let dnsServer = dnsServers[currentIndex]
        os_log("🔍 Querying %{public}@ via DNS server %{public}@", log: logger, type: .info, hostname, dnsServer)

        // Create UDP connection to DNS server
        let connection = NWConnection(
            host: NWEndpoint.Host(dnsServer),
            port: 53,
            using: .udp
        )

        // Set timeout
        let timeoutWorkItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            os_log("⏱ DNS query timeout for %{public}@", log: self.logger, type: .error, dnsServer)
            connection.cancel()
            // Try next DNS server
            self.tryResolveWithDNS(hostname: hostname,
                                   dnsServers: dnsServers,
                                   currentIndex: currentIndex + 1,
                                   completion: completion)
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }

            switch state {
            case .ready:
                // Build DNS query packet
                let queryData = self.buildDNSQuery(hostname: hostname)

                connection.send(content: queryData, completion: .contentProcessed { error in
                    if let error = error {
                        os_log("Failed to send DNS query: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                        timeoutWorkItem.cancel()
                        connection.cancel()
                        // Try next DNS server
                        self.tryResolveWithDNS(hostname: hostname,
                                               dnsServers: dnsServers,
                                               currentIndex: currentIndex + 1,
                                               completion: completion)
                        return
                    }

                    // Receive DNS response
                    connection.receive(minimumIncompleteLength: 1, maximumLength: 512) { content, _, _, error in
                        timeoutWorkItem.cancel()
                        connection.cancel()

                        if let error = error {
                            os_log("Failed to receive DNS response: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                            // Try next DNS server
                            self.tryResolveWithDNS(hostname: hostname,
                                                   dnsServers: dnsServers,
                                                   currentIndex: currentIndex + 1,
                                                   completion: completion)
                            return
                        }

                        guard let responseData = content else {
                            os_log("Empty DNS response from %{public}@", log: self.logger, type: .error, dnsServer)
                            // Try next DNS server
                            self.tryResolveWithDNS(hostname: hostname,
                                                   dnsServers: dnsServers,
                                                   currentIndex: currentIndex + 1,
                                                   completion: completion)
                            return
                        }

                        // Parse DNS response to get all A records
                        if let ips = self.parseAllARecords(from: responseData), !ips.isEmpty {
                            self.dohServerIPs = ips
                            os_log("✅ Resolved %d IP(s) from %{public}@: %{public}@",
                                   log: self.logger, type: .info,
                                   ips.count, dnsServer, ips.joined(separator: ", "))
                            completion()
                        } else {
                            os_log("Failed to parse DNS response from %{public}@", log: self.logger, type: .error, dnsServer)
                            // Try next DNS server
                            self.tryResolveWithDNS(hostname: hostname,
                                                   dnsServers: dnsServers,
                                                   currentIndex: currentIndex + 1,
                                                   completion: completion)
                        }
                    }
                })

            case .failed(let error):
                os_log("DNS connection failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                timeoutWorkItem.cancel()
                connection.cancel()
                // Try next DNS server
                self.tryResolveWithDNS(hostname: hostname,
                                       dnsServers: dnsServers,
                                       currentIndex: currentIndex + 1,
                                       completion: completion)

            default:
                break
            }
        }

        connection.start(queue: .global())
    }

    private func buildDNSQuery(hostname: String) -> Data {
        var data = Data()

        // DNS Header (12 bytes)
        data.append(contentsOf: [0x00, 0x01])  // Transaction ID
        data.append(contentsOf: [0x01, 0x00])  // Flags: Standard query, recursion desired
        data.append(contentsOf: [0x00, 0x01])  // Questions: 1
        data.append(contentsOf: [0x00, 0x00])  // Answer RRs: 0
        data.append(contentsOf: [0x00, 0x00])  // Authority RRs: 0
        data.append(contentsOf: [0x00, 0x00])  // Additional RRs: 0

        // Query: QNAME (domain name)
        let labels = hostname.split(separator: ".")
        for label in labels {
            data.append(UInt8(label.count))
            data.append(contentsOf: label.utf8)
        }
        data.append(0x00)  // Null terminator

        // QTYPE: A (IPv4 address)
        data.append(contentsOf: [0x00, 0x01])
        // QCLASS: IN (Internet)
        data.append(contentsOf: [0x00, 0x01])

        return data
    }

    private func parseAllARecords(from dnsResponse: Data) -> [String]? {
        guard dnsResponse.count > 12 else { return nil }

        // Get answer count from header (bytes 6-7)
        let answerCount = Int(dnsResponse[6]) << 8 | Int(dnsResponse[7])
        guard answerCount > 0 else { return nil }

        var ips: [String] = []

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

        // Parse answer section - collect ALL A records
        for _ in 0..<answerCount {
            guard index + 12 <= dnsResponse.count else { break }

            // Handle name (might be compressed with pointer)
            if dnsResponse[index] & 0xC0 == 0xC0 {
                // Compressed name (pointer)
                index += 2
            } else {
                // Regular name
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

            // Skip CLASS (2 bytes)
            index += 2

            // Skip TTL (4 bytes)
            index += 4

            // Read RDLENGTH (2 bytes)
            let rdLength = Int(dnsResponse[index]) << 8 | Int(dnsResponse[index + 1])
            index += 2

            // Check if this is an A record (TYPE = 1) with 4 bytes of data
            if recordType == 1 && rdLength == 4 && index + 4 <= dnsResponse.count {
                // Extract IPv4 address
                let ip = "\(dnsResponse[index]).\(dnsResponse[index + 1]).\(dnsResponse[index + 2]).\(dnsResponse[index + 3])"
                ips.append(ip)
            }

            // Skip RDATA
            index += rdLength
        }

        return ips.isEmpty ? nil : ips
    }

    private func fallbackToUDP() {
        // Helper method to fallback to UDP DNS
        // Using China mainland DNS for better performance and stability
        if self.dnsServerType == "doh" {
            os_log("🔄 Falling back to UDP DNS (Tencent DNSPod)", log: self.logger, type: .info)
            self.dnsServer = "119.29.29.29"  // 腾讯云DNSPod公共DNS
            self.dnsServerType = "udp"
            os_log("✓ DNS server changed to UDP fallback: 119.29.29.29", log: self.logger, type: .info)
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

            // Log cache size for monitoring
            os_log("📊 DNS cache size: %d, Serial queue processing", log: self.logger, type: .info, self.dnsCache.count)
        }

        os_log("✓ Started cleanup timer for DNS cache", log: logger, type: .info)
    }

    // MARK: - Connection Management

    /**
     * Get or create shared UDP connection
     * Only one connection is used for all queries (serial processing)
     */
    private func getOrCreateSharedConnection() -> NWConnection {
        connectionLock.lock()
        defer { connectionLock.unlock() }

        // Return existing connection if still valid
        if let existing = sharedUDPConnection, existing.state == .ready {
            return existing
        }

        // Create new connection
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(dnsServer), port: 53)
        let connection = NWConnection(to: endpoint, using: .udp)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }

            switch state {
            case .ready:
                os_log("✅ Shared UDP connection ready", log: self.logger, type: .info)

            case .failed(let error):
                os_log("❌ Shared UDP connection failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                // Will be recreated on next query
                self.connectionLock.lock()
                self.sharedUDPConnection = nil
                self.connectionLock.unlock()

            case .cancelled:
                os_log("🚫 Shared UDP connection cancelled", log: self.logger, type: .debug)

            default:
                break
            }
        }

        connection.start(queue: .global())
        sharedUDPConnection = connection

        os_log("🆕 Created new shared UDP connection", log: logger, type: .info)
        return connection
    }

    // MARK: - DNS Cache Management

    /**
     * Get cached DNS response if available and not expired
     */
    private func getCachedDNSResponse(domain: String) -> Data? {
        dnsCacheLock.lock()
        defer { dnsCacheLock.unlock() }

        let key = domain.lowercased()
        guard let entry = dnsCache[key] else {
            return nil
        }

        let age = Date().timeIntervalSince(entry.timestamp)
        if age > entry.ttl {
            dnsCache.removeValue(forKey: key)
            os_log("🗑 Cache expired for %{public}@ (age: %.1fs, TTL: %.1fs)", log: logger, type: .debug, domain, age, entry.ttl)
            return nil
        }

        os_log("✅ Cache hit for %{public}@ (age: %.1fs, TTL: %.1fs)", log: logger, type: .debug, domain, age, entry.ttl)
        return entry.response
    }

    /**
     * Cache DNS response with TTL
     */
    private func cacheDNSResponse(domain: String, response: Data) {
        dnsCacheLock.lock()
        defer { dnsCacheLock.unlock() }

        let key = domain.lowercased()
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

        os_log("💾 Cached %{public}@ with TTL %.1fs", log: logger, type: .debug, domain, ttl)
    }

    /**
     * Extract TTL from DNS response
     * Returns minimum TTL from all answer records
     */
    private func extractTTLFromDNSResponse(_ dnsResponse: Data) -> TimeInterval? {
        guard dnsResponse.count > 12 else { return nil }

        // Get answer count from header (bytes 6-7)
        let answerCount = Int(dnsResponse[6]) << 8 | Int(dnsResponse[7])
        guard answerCount > 0 else { return nil }

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
            // Clamp TTL between 60 seconds and 1 hour
            return TimeInterval(min(max(ttl, 60), 3600))
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
}

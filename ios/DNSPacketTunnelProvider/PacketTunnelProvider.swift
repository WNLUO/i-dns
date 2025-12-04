//
//  PacketTunnelProvider.swift
//  DNSPacketTunnelProvider
//
//  iDNS Family Protection VPN Extension
//

import NetworkExtension
import os.log

class PacketTunnelProvider: NEPacketTunnelProvider {

    private var blacklist: Set<String> = []
    private var whitelist: Set<String> = []
    private var dnsServer: String = "94.140.14.14" // AdGuard DNS Family Protection
    private let logger = OSLog(subsystem: "com.idns.vpn", category: "PacketTunnel")

    // App Group for sharing data with main app
    private let appGroupIdentifier = "group.org.reactjs.native.example.iDNS"

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("Starting VPN tunnel", log: logger, type: .info)

        // Load configuration from options
        if let options = options {
            if let dns = options["dnsServer"] as? String {
                dnsServer = dns
                os_log("DNS server set to: %{public}@", log: logger, type: .info, dns)
            }
        }

        // Load blacklist and whitelist from shared storage
        loadFilterRules()

        // Configure VPN settings
        let settings = createTunnelSettings()

        // Apply settings
        setTunnelNetworkSettings(settings) { error in
            if let error = error {
                os_log("Failed to set tunnel settings: %{public}@", log: logger, type: .error, error.localizedDescription)
                completionHandler(error)
                return
            }

            os_log("VPN tunnel started successfully", log: logger, type: .info)

            // Start reading packets
            self.startPacketFlow()
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log("Stopping VPN tunnel, reason: %{public}d", log: logger, type: .info, reason.rawValue)
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
                dnsServer = dns
                os_log("DNS server updated to: %{public}@", log: logger, type: .info, dns)
                // Restart tunnel with new DNS
                restartTunnel()
            }

        default:
            os_log("Unknown message type: %{public}@", log: logger, type: .warning, message.type)
        }

        completionHandler?(nil)
    }

    // MARK: - Private Methods

    private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "240.0.0.1")

        // IPv4 settings
        let ipv4Settings = NEIPv4Settings(addresses: ["240.0.0.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        // DNS settings - use our custom DNS server
        let dnsSettings = NEDNSSettings(servers: [dnsServer])
        dnsSettings.matchDomains = [""] // Match all domains
        settings.dnsSettings = dnsSettings

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
        // Check if this is a DNS packet (UDP port 53)
        guard let dnsQuery = parseDNSQuery(from: packet) else {
            // Not a DNS packet, forward it
            packetFlow.writePackets([packet], withProtocols: [NSNumber(value: protocolNumber)])
            return
        }

        os_log("DNS query for: %{public}@", log: logger, type: .debug, dnsQuery.domain)

        // Check if domain should be blocked
        let shouldBlock = shouldBlockDomain(dnsQuery.domain)

        // Send event to main app
        sendDNSEvent(domain: dnsQuery.domain, blocked: shouldBlock)

        if shouldBlock {
            // Block by returning NXDOMAIN response
            os_log("Blocking domain: %{public}@", log: logger, type: .info, dnsQuery.domain)
            if let blockResponse = createBlockResponse(for: packet) {
                packetFlow.writePackets([blockResponse], withProtocols: [NSNumber(value: protocolNumber)])
            }
        } else {
            // Forward to real DNS server
            os_log("Allowing domain: %{public}@", log: logger, type: .debug, dnsQuery.domain)
            packetFlow.writePackets([packet], withProtocols: [NSNumber(value: protocolNumber)])
        }
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

        return DNSQuery(domain: domain, packet: packet)
    }

    private func createBlockResponse(for packet: Data) -> Data? {
        // Create a DNS response with NXDOMAIN (name doesn't exist)
        // This is a simplified implementation

        var response = packet

        // Modify DNS flags to indicate response with NXDOMAIN
        let ipHeaderLength = Int((packet[0] & 0x0F)) * 4
        let udpHeaderStart = ipHeaderLength
        let dnsStart = udpHeaderStart + 8

        guard response.count > dnsStart + 2 else { return nil }

        // Set QR=1 (response), RCODE=3 (NXDOMAIN)
        response[dnsStart + 2] = 0x81
        response[dnsStart + 3] = 0x83

        return response
    }

    private func sendDNSEvent(domain: String, blocked: Bool) {
        // Send event to main app via Darwin notification or shared storage
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            return
        }

        let event: [String: Any] = [
            "domain": domain,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "status": blocked ? "blocked" : "allowed",
            "category": categorize(domain: domain),
            "latency": 0
        ]

        // Save to shared storage (main app will read this)
        var events = sharedDefaults.array(forKey: "dnsEvents") as? [[String: Any]] ?? []
        events.append(event)

        // Keep only last 1000 events
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

    private func categorize(domain: String) -> String {
        let domain = domain.lowercased()

        // Simple categorization based on keywords
        if domain.contains("ads") || domain.contains("ad.") || domain.contains("doubleclick") {
            return "ad"
        } else if domain.contains("analytics") || domain.contains("tracking") || domain.contains("tracker") {
            return "tracker"
        } else if domain.contains("porn") || domain.contains("xxx") {
            return "content"
        }

        return "unknown"
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
}

// MARK: - Supporting Structures

struct DNSQuery {
    let domain: String
    let packet: Data
}

struct VPNMessage: Codable {
    let type: String
    let domain: String?
    let dnsServer: String?
}

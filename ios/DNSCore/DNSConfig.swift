//
//  DNSConfig.swift
//  DNSCore
//
//  Centralized DNS configuration management with auto-tuning
//

import Foundation
import UIKit

// MARK: - DNS Configuration
struct DNSConfig {

    // MARK: - Cache Settings
    var maxHotCacheSize: Int
    var maxColdCacheSize: Int
    var minCacheTTL: TimeInterval
    var maxCacheTTL: TimeInterval
    var defaultCacheTTL: TimeInterval

    // MARK: - Performance Settings
    var dnsTimeout: TimeInterval
    var maxConcurrentRequests: Int
    var maxQueriesPerDomain: Int
    var queryCounterResetInterval: TimeInterval

    // MARK: - Logging Settings
    var maxLogCount: Int
    var logRetentionPeriod: TimeInterval
    var minLogLevel: DNSLogLevel

    // MARK: - Statistics Settings
    var maxStatisticsEntries: Int
    var statisticsRetentionPeriod: TimeInterval

    // MARK: - DNS Servers
    var servers: [DNSServer]

    // MARK: - App Group
    let appGroupIdentifier: String

    // MARK: - Default Configuration

    static func `default`(appGroupIdentifier: String) -> DNSConfig {
        return DNSConfig(
            maxHotCacheSize: 100,
            maxColdCacheSize: 900,
            minCacheTTL: 5,
            maxCacheTTL: 86400,  // 24 hours
            defaultCacheTTL: 300,
            dnsTimeout: 8.0,
            maxConcurrentRequests: 30,
            maxQueriesPerDomain: 15,
            queryCounterResetInterval: 2.0,
            maxLogCount: 1000,
            logRetentionPeriod: 86400,  // 24 hours
            minLogLevel: .info,
            maxStatisticsEntries: 10000,
            statisticsRetentionPeriod: 604800,  // 7 days
            servers: [
                DNSServer(url: "https://i-dns.wnluo.com/dns-query", type: .doh, priority: 1),
                DNSServer(url: "https://cloudflare-dns.com/dns-query", type: .doh, priority: 2),
                DNSServer(url: "8.8.8.8", type: .udp, priority: 3)
            ],
            appGroupIdentifier: appGroupIdentifier
        )
    }

    // MARK: - Auto-Tuned Configuration

    static func autoTuned(appGroupIdentifier: String) -> DNSConfig {
        var config = DNSConfig.default(appGroupIdentifier: appGroupIdentifier)

        // Detect device capabilities
        let deviceMemory = ProcessInfo.processInfo.physicalMemory
        let deviceCPUCount = ProcessInfo.processInfo.processorCount

        // Adjust cache size based on available memory
        if deviceMemory >= 4_000_000_000 {  // 4GB+
            config.maxHotCacheSize = 200
            config.maxColdCacheSize = 1800
            config.maxStatisticsEntries = 20000
        } else if deviceMemory >= 2_000_000_000 {  // 2GB+
            config.maxHotCacheSize = 150
            config.maxColdCacheSize = 1350
            config.maxStatisticsEntries = 15000
        } else {  // <2GB
            config.maxHotCacheSize = 100
            config.maxColdCacheSize = 900
            config.maxStatisticsEntries = 10000
        }

        // Adjust concurrency based on CPU cores
        if deviceCPUCount >= 6 {
            config.maxConcurrentRequests = 50
        } else if deviceCPUCount >= 4 {
            config.maxConcurrentRequests = 30
        } else {
            config.maxConcurrentRequests = 20
        }

        return config
    }

    // MARK: - Performance Presets

    static func lowMemory(appGroupIdentifier: String) -> DNSConfig {
        var config = DNSConfig.default(appGroupIdentifier: appGroupIdentifier)
        config.maxHotCacheSize = 50
        config.maxColdCacheSize = 450
        config.maxLogCount = 500
        config.maxStatisticsEntries = 5000
        return config
    }

    static func highPerformance(appGroupIdentifier: String) -> DNSConfig {
        var config = DNSConfig.default(appGroupIdentifier: appGroupIdentifier)
        config.maxHotCacheSize = 300
        config.maxColdCacheSize = 2700
        config.maxConcurrentRequests = 50
        config.maxLogCount = 2000
        config.maxStatisticsEntries = 30000
        config.dnsTimeout = 5.0  // Fail faster for better responsiveness
        return config
    }

    static func balanced(appGroupIdentifier: String) -> DNSConfig {
        return autoTuned(appGroupIdentifier: appGroupIdentifier)
    }

    // MARK: - Persistence

    private static let configKey = "dnsConfig"

    func save() {
        guard let userDefaults = UserDefaults(suiteName: appGroupIdentifier) else { return }

        let dict: [String: Any] = [
            "maxHotCacheSize": maxHotCacheSize,
            "maxColdCacheSize": maxColdCacheSize,
            "minCacheTTL": minCacheTTL,
            "maxCacheTTL": maxCacheTTL,
            "defaultCacheTTL": defaultCacheTTL,
            "dnsTimeout": dnsTimeout,
            "maxConcurrentRequests": maxConcurrentRequests,
            "maxQueriesPerDomain": maxQueriesPerDomain,
            "queryCounterResetInterval": queryCounterResetInterval,
            "maxLogCount": maxLogCount,
            "logRetentionPeriod": logRetentionPeriod,
            "minLogLevel": minLogLevel.rawValue,
            "maxStatisticsEntries": maxStatisticsEntries,
            "statisticsRetentionPeriod": statisticsRetentionPeriod,
            "servers": servers.map { [
                "url": $0.url,
                "type": "\($0.type)",
                "priority": $0.priority
            ]}
        ]

        userDefaults.set(dict, forKey: Self.configKey)
    }

    static func load(appGroupIdentifier: String) -> DNSConfig? {
        guard let userDefaults = UserDefaults(suiteName: appGroupIdentifier),
              let dict = userDefaults.dictionary(forKey: configKey) else {
            return nil
        }

        let serversData = dict["servers"] as? [[String: Any]] ?? []
        let servers = serversData.compactMap { serverDict -> DNSServer? in
            guard let url = serverDict["url"] as? String,
                  let typeString = serverDict["type"] as? String,
                  let priority = serverDict["priority"] as? Int else {
                return nil
            }

            let type: DNSServer.ServerType
            switch typeString {
            case "doh": type = .doh
            case "dot": type = .dot
            case "udp": type = .udp
            case "direct": type = .direct
            default: return nil
            }

            return DNSServer(url: url, type: type, priority: priority)
        }

        return DNSConfig(
            maxHotCacheSize: dict["maxHotCacheSize"] as? Int ?? 100,
            maxColdCacheSize: dict["maxColdCacheSize"] as? Int ?? 900,
            minCacheTTL: dict["minCacheTTL"] as? TimeInterval ?? 5,
            maxCacheTTL: dict["maxCacheTTL"] as? TimeInterval ?? 86400,
            defaultCacheTTL: dict["defaultCacheTTL"] as? TimeInterval ?? 300,
            dnsTimeout: dict["dnsTimeout"] as? TimeInterval ?? 8.0,
            maxConcurrentRequests: dict["maxConcurrentRequests"] as? Int ?? 30,
            maxQueriesPerDomain: dict["maxQueriesPerDomain"] as? Int ?? 15,
            queryCounterResetInterval: dict["queryCounterResetInterval"] as? TimeInterval ?? 2.0,
            maxLogCount: dict["maxLogCount"] as? Int ?? 1000,
            logRetentionPeriod: dict["logRetentionPeriod"] as? TimeInterval ?? 86400,
            minLogLevel: DNSLogLevel(rawValue: dict["minLogLevel"] as? Int ?? 1) ?? .info,
            maxStatisticsEntries: dict["maxStatisticsEntries"] as? Int ?? 10000,
            statisticsRetentionPeriod: dict["statisticsRetentionPeriod"] as? TimeInterval ?? 604800,
            servers: servers.isEmpty ? [DNSServer(url: "https://i-dns.wnluo.com/dns-query", type: .doh, priority: 1)] : servers,
            appGroupIdentifier: appGroupIdentifier
        )
    }

    // MARK: - Validation

    func validate() -> [String] {
        var errors: [String] = []

        if maxHotCacheSize < 10 || maxHotCacheSize > 1000 {
            errors.append("maxHotCacheSize must be between 10 and 1000")
        }

        if maxColdCacheSize < 100 || maxColdCacheSize > 10000 {
            errors.append("maxColdCacheSize must be between 100 and 10000")
        }

        if minCacheTTL < 1 || minCacheTTL > 3600 {
            errors.append("minCacheTTL must be between 1 and 3600 seconds")
        }

        if maxCacheTTL < 60 || maxCacheTTL > 604800 {
            errors.append("maxCacheTTL must be between 60 and 604800 seconds (7 days)")
        }

        if minCacheTTL >= maxCacheTTL {
            errors.append("minCacheTTL must be less than maxCacheTTL")
        }

        if dnsTimeout < 1.0 || dnsTimeout > 30.0 {
            errors.append("dnsTimeout must be between 1.0 and 30.0 seconds")
        }

        if maxConcurrentRequests < 1 || maxConcurrentRequests > 100 {
            errors.append("maxConcurrentRequests must be between 1 and 100")
        }

        if servers.isEmpty {
            errors.append("At least one DNS server must be configured")
        }

        return errors
    }

    var isValid: Bool {
        return validate().isEmpty
    }

    // MARK: - Description

    func description() -> String {
        return """
        DNS Configuration:
        - Cache: Hot=\(maxHotCacheSize), Cold=\(maxColdCacheSize)
        - TTL: Min=\(minCacheTTL)s, Max=\(maxCacheTTL)s, Default=\(defaultCacheTTL)s
        - Performance: Timeout=\(dnsTimeout)s, MaxConcurrent=\(maxConcurrentRequests)
        - Logging: MaxLogs=\(maxLogCount), Retention=\(logRetentionPeriod)s, Level=\(minLogLevel.description)
        - Statistics: MaxEntries=\(maxStatisticsEntries), Retention=\(statisticsRetentionPeriod)s
        - Servers: \(servers.count) configured
        """
    }
}

// MARK: - Configuration Manager
class DNSConfigManager {

    static let shared = DNSConfigManager()

    private(set) var config: DNSConfig
    private let lock = NSLock()

    private init() {
        let appGroupIdentifier = "group.com.idns.wnlluo"

        // Try to load saved config, otherwise use auto-tuned default
        if let loadedConfig = DNSConfig.load(appGroupIdentifier: appGroupIdentifier) {
            self.config = loadedConfig
        } else {
            self.config = DNSConfig.autoTuned(appGroupIdentifier: appGroupIdentifier)
            self.config.save()
        }
    }

    func updateConfig(_ newConfig: DNSConfig) throws {
        let errors = newConfig.validate()
        guard errors.isEmpty else {
            throw NSError(domain: "DNSConfigManager", code: -1,
                        userInfo: [NSLocalizedDescriptionKey: errors.joined(separator: ", ")])
        }

        lock.lock()
        defer { lock.unlock() }

        config = newConfig
        config.save()
    }

    func getConfig() -> DNSConfig {
        lock.lock()
        defer { lock.unlock() }
        return config
    }

    func resetToDefault() {
        lock.lock()
        defer { lock.unlock() }

        config = DNSConfig.default(appGroupIdentifier: config.appGroupIdentifier)
        config.save()
    }

    func resetToAutoTuned() {
        lock.lock()
        defer { lock.unlock() }

        config = DNSConfig.autoTuned(appGroupIdentifier: config.appGroupIdentifier)
        config.save()
    }
}

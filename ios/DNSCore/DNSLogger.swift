//
//  DNSLogger.swift
//  DNSCore
//
//  DNS event logging with level filtering and shared storage
//

import Foundation
import os.log

// MARK: - Log Level
enum DNSLogLevel: Int, Comparable {
    case debug = 0
    case info = 1
    case warning = 2
    case error = 3

    var description: String {
        switch self {
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .warning: return "WARNING"
        case .error: return "ERROR"
        }
    }

    static func < (lhs: DNSLogLevel, rhs: DNSLogLevel) -> Bool {
        return lhs.rawValue < rhs.rawValue
    }
}

// MARK: - DNS Event
struct DNSEvent: Codable {
    let id: String
    let timestamp: String  // ISO8601 format
    let domain: String
    let queryType: String
    let status: String     // "allowed" or "blocked"
    let category: String
    let latency: Int       // milliseconds
    let cacheHit: Bool

    init(domain: String,
         queryType: String,
         status: String,
         category: String,
         latency: TimeInterval,
         cacheHit: Bool = false) {
        self.id = UUID().uuidString
        self.timestamp = ISO8601DateFormatter().string(from: Date())
        self.domain = domain
        self.queryType = queryType
        self.status = status
        self.category = category
        self.latency = Int(latency * 1000)  // Convert to milliseconds
        self.cacheHit = cacheHit
    }
}

// MARK: - DNS Logger
class DNSLogger {

    // MARK: - Configuration
    private let maxLogCount: Int
    private let retentionPeriod: TimeInterval  // In seconds
    private let appGroupIdentifier: String
    private let minLogLevel: DNSLogLevel

    // MARK: - Storage
    private var events: [DNSEvent] = []
    private let lock = NSLock()

    // MARK: - Shared Storage
    private let userDefaults: UserDefaults?
    private let eventsKey = "dnsEvents"

    // MARK: - System Logger
    private let osLogger: OSLog

    // MARK: - Statistics
    private(set) var totalEventsLogged: Int = 0
    private(set) var eventsDropped: Int = 0

    // MARK: - Initialization

    init(appGroupIdentifier: String,
         maxLogCount: Int = 1000,
         retentionPeriod: TimeInterval = 86400,  // 24 hours
         minLogLevel: DNSLogLevel = .info) {

        self.appGroupIdentifier = appGroupIdentifier
        self.maxLogCount = maxLogCount
        self.retentionPeriod = retentionPeriod
        self.minLogLevel = minLogLevel

        self.userDefaults = UserDefaults(suiteName: appGroupIdentifier)
        self.osLogger = OSLog(subsystem: "com.idns.dns", category: "DNSLogger")

        loadEvents()
    }

    // MARK: - Logging

    func log(domain: String,
             queryType: String,
             status: String,
             category: String,
             latency: TimeInterval,
             cacheHit: Bool = false,
             level: DNSLogLevel = .info) {

        // Check log level
        guard level >= minLogLevel else { return }

        // Filter out unwanted events
        if shouldFilterEvent(domain: domain, queryType: queryType, category: category) {
            return
        }

        let event = DNSEvent(
            domain: domain,
            queryType: queryType,
            status: status,
            category: category,
            latency: latency,
            cacheHit: cacheHit
        )

        lock.lock()
        defer { lock.unlock() }

        events.append(event)
        totalEventsLogged += 1

        // Trim if over limit
        if events.count > maxLogCount {
            let removeCount = events.count - maxLogCount
            events.removeFirst(removeCount)
            eventsDropped += removeCount
        }

        // Log to system
        logToSystem(event: event, level: level)

        // Save to shared storage (batched)
        if events.count % 10 == 0 {
            saveEvents()
        }
    }

    // MARK: - Event Filtering

    private func shouldFilterEvent(domain: String, queryType: String, category: String) -> Bool {
        // Filter TYPE 65 (HTTPS) queries with no records
        if queryType == "HTTPS" && (category == "无记录" || category == "no records") {
            return true
        }

        // Filter anomalous domain suffixes
        let anomalousSuffixes = [".com.com", ".net.net", ".org.org"]
        for suffix in anomalousSuffixes {
            if domain.hasSuffix(suffix) {
                return true
            }
        }

        // Filter DDR queries
        if domain.contains("_dns.resolver.arpa") {
            return true
        }

        return false
    }

    // MARK: - System Logging

    private func logToSystem(event: DNSEvent, level: DNSLogLevel) {
        let message = "[\(event.status)] \(event.domain) -> \(event.category) (\(event.latency)ms)"

        switch level {
        case .debug:
            os_log("%{public}@", log: osLogger, type: .debug, message)
        case .info:
            os_log("%{public}@", log: osLogger, type: .info, message)
        case .warning:
            os_log("%{public}@", log: osLogger, type: .default, message)
        case .error:
            os_log("%{public}@", log: osLogger, type: .error, message)
        }
    }

    // MARK: - Retrieval

    func getEvents(limit: Int? = nil, status: String? = nil, domain: String? = nil) -> [DNSEvent] {
        lock.lock()
        defer { lock.unlock() }

        var filtered = events

        // Filter by status
        if let status = status {
            filtered = filtered.filter { $0.status == status }
        }

        // Filter by domain
        if let domain = domain {
            filtered = filtered.filter { $0.domain.contains(domain) }
        }

        // Apply limit
        if let limit = limit {
            filtered = Array(filtered.suffix(limit))
        }

        return filtered
    }

    func getRecentEvents(count: Int) -> [DNSEvent] {
        lock.lock()
        defer { lock.unlock() }

        return Array(events.suffix(count))
    }

    func getEventsInTimeRange(from: Date, to: Date) -> [DNSEvent] {
        lock.lock()
        defer { lock.unlock() }

        let formatter = ISO8601DateFormatter()
        return events.filter { event in
            guard let eventDate = formatter.date(from: event.timestamp) else { return false }
            return eventDate >= from && eventDate <= to
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        lock.lock()
        defer { lock.unlock() }

        let formatter = ISO8601DateFormatter()
        let cutoffDate = Date().addingTimeInterval(-retentionPeriod)

        let originalCount = events.count
        events.removeAll { event in
            guard let eventDate = formatter.date(from: event.timestamp) else { return true }
            return eventDate < cutoffDate
        }

        let removedCount = originalCount - events.count
        if removedCount > 0 {
            os_log("Cleaned up %d old events", log: osLogger, type: .info, removedCount)
            saveEvents()
        }
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }

        events.removeAll()
        totalEventsLogged = 0
        eventsDropped = 0
        saveEvents()

        os_log("Cleared all events", log: osLogger, type: .info)
    }

    // MARK: - Persistence

    private func saveEvents() {
        guard let userDefaults = userDefaults else { return }

        do {
            let data = try JSONEncoder().encode(events)
            userDefaults.set(data, forKey: eventsKey)

            // Send Darwin notification to main app
            CFNotificationCenterPostNotification(
                CFNotificationCenterGetDarwinNotifyCenter(),
                CFNotificationName("com.idns.dnsEvent" as CFString),
                nil, nil, true
            )
        } catch {
            os_log("Failed to save events: %{public}@", log: osLogger, type: .error, error.localizedDescription)
        }
    }

    private func loadEvents() {
        guard let userDefaults = userDefaults,
              let data = userDefaults.data(forKey: eventsKey) else {
            return
        }

        do {
            events = try JSONDecoder().decode([DNSEvent].self, from: data)
            os_log("Loaded %d events from storage", log: osLogger, type: .info, events.count)
        } catch {
            os_log("Failed to load events: %{public}@", log: osLogger, type: .error, error.localizedDescription)
            events = []
        }
    }

    func forceSync() {
        lock.lock()
        defer { lock.unlock() }
        saveEvents()
    }

    // MARK: - Statistics

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        let blockedCount = events.filter { $0.status == "blocked" }.count
        let allowedCount = events.filter { $0.status == "allowed" }.count
        let cacheHitCount = events.filter { $0.cacheHit }.count

        return [
            "totalEvents": events.count,
            "blockedEvents": blockedCount,
            "allowedEvents": allowedCount,
            "cacheHitEvents": cacheHitCount,
            "totalEventsLogged": totalEventsLogged,
            "eventsDropped": eventsDropped,
            "retentionPeriod": retentionPeriod,
            "maxLogCount": maxLogCount
        ]
    }

    // MARK: - Export

    func exportToJSON() -> String? {
        lock.lock()
        defer { lock.unlock() }

        do {
            let data = try JSONEncoder().encode(events)
            return String(data: data, encoding: .utf8)
        } catch {
            os_log("Failed to export events: %{public}@", log: osLogger, type: .error, error.localizedDescription)
            return nil
        }
    }

    func exportToCSV() -> String {
        lock.lock()
        defer { lock.unlock() }

        var csv = "Timestamp,Domain,QueryType,Status,Category,Latency(ms),CacheHit\n"
        for event in events {
            csv += "\(event.timestamp),\(event.domain),\(event.queryType),\(event.status),\(event.category),\(event.latency),\(event.cacheHit)\n"
        }
        return csv
    }
}

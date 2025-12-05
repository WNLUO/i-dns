//
//  DNSStatistics.swift
//  DNSCore
//
//  Advanced DNS statistics with time windows and latency percentiles
//

import Foundation

// MARK: - Time Window
enum TimeWindow {
    case oneMinute
    case fiveMinutes
    case oneHour
    case oneDay

    var duration: TimeInterval {
        switch self {
        case .oneMinute: return 60
        case .fiveMinutes: return 300
        case .oneHour: return 3600
        case .oneDay: return 86400
        }
    }
}

// MARK: - Statistics Entry
struct StatisticsEntry {
    let timestamp: Date
    let domain: String
    let queryType: DNSQueryType
    let wasBlocked: Bool
    let category: String
    let latency: TimeInterval
    let cacheHit: Bool
}

// MARK: - Window Statistics
struct WindowStatistics {
    let window: TimeWindow
    let totalQueries: Int
    let blockedQueries: Int
    let allowedQueries: Int
    let cacheHits: Int
    let cacheMisses: Int

    var blockRate: Double {
        return totalQueries > 0 ? Double(blockedQueries) / Double(totalQueries) : 0.0
    }

    var cacheHitRate: Double {
        let total = cacheHits + cacheMisses
        return total > 0 ? Double(cacheHits) / Double(total) : 0.0
    }

    var allowRate: Double {
        return totalQueries > 0 ? Double(allowedQueries) / Double(totalQueries) : 0.0
    }
}

// MARK: - Latency Statistics
struct LatencyStatistics {
    let p50: TimeInterval  // Median
    let p90: TimeInterval
    let p95: TimeInterval
    let p99: TimeInterval
    let average: TimeInterval
    let min: TimeInterval
    let max: TimeInterval

    static let zero = LatencyStatistics(p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0)
}

// MARK: - Category Breakdown
struct CategoryBreakdown {
    var tracker: Int = 0
    var ad: Int = 0
    var adult: Int = 0
    var malware: Int = 0
    var allowed: Int = 0
    var unknown: Int = 0

    mutating func increment(category: String) {
        switch category.lowercased() {
        case "tracker": tracker += 1
        case "ad": ad += 1
        case "adult": adult += 1
        case "malware": malware += 1
        case "allowed": allowed += 1
        default: unknown += 1
        }
    }

    var total: Int {
        return tracker + ad + adult + malware + allowed + unknown
    }

    func toDictionary() -> [String: Int] {
        return [
            "tracker": tracker,
            "ad": ad,
            "adult": adult,
            "malware": malware,
            "allowed": allowed,
            "unknown": unknown
        ]
    }
}

// MARK: - DNS Statistics
class DNSStatistics {

    // MARK: - Storage
    private var entries: [StatisticsEntry] = []
    private let maxEntries: Int
    private let lock = NSLock()

    // MARK: - Aggregated Counters
    private var totalQueries: Int = 0
    private var totalBlocked: Int = 0
    private var totalAllowed: Int = 0
    private var totalCacheHits: Int = 0
    private var totalCacheMisses: Int = 0
    private var totalLatency: TimeInterval = 0

    // MARK: - Initialization

    init(maxEntries: Int = 10000) {
        self.maxEntries = maxEntries
    }

    // MARK: - Record Entry

    func record(domain: String,
                queryType: DNSQueryType,
                wasBlocked: Bool,
                category: String,
                latency: TimeInterval,
                cacheHit: Bool = false) {

        let entry = StatisticsEntry(
            timestamp: Date(),
            domain: domain,
            queryType: queryType,
            wasBlocked: wasBlocked,
            category: category,
            latency: latency,
            cacheHit: cacheHit
        )

        lock.lock()
        defer { lock.unlock() }

        entries.append(entry)

        // Update aggregated counters
        totalQueries += 1
        if wasBlocked {
            totalBlocked += 1
        } else {
            totalAllowed += 1
        }
        if cacheHit {
            totalCacheHits += 1
        } else {
            totalCacheMisses += 1
        }
        totalLatency += latency

        // Trim old entries if over limit
        if entries.count > maxEntries {
            let removeCount = entries.count - maxEntries
            entries.removeFirst(removeCount)
        }
    }

    // MARK: - Window Statistics

    func getStatistics(for window: TimeWindow) -> WindowStatistics {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        let totalQueries = windowEntries.count
        let blockedQueries = windowEntries.filter { $0.wasBlocked }.count
        let allowedQueries = windowEntries.filter { !$0.wasBlocked }.count
        let cacheHits = windowEntries.filter { $0.cacheHit }.count
        let cacheMisses = windowEntries.filter { !$0.cacheHit }.count

        return WindowStatistics(
            window: window,
            totalQueries: totalQueries,
            blockedQueries: blockedQueries,
            allowedQueries: allowedQueries,
            cacheHits: cacheHits,
            cacheMisses: cacheMisses
        )
    }

    // MARK: - Latency Statistics

    func getLatencyStatistics(for window: TimeWindow) -> LatencyStatistics {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let latencies = entries
            .filter { $0.timestamp >= cutoffTime && !$0.cacheHit }  // Exclude cache hits
            .map { $0.latency }
            .sorted()

        guard !latencies.isEmpty else {
            return LatencyStatistics.zero
        }

        let count = latencies.count
        let p50Index = Int(Double(count) * 0.50)
        let p90Index = Int(Double(count) * 0.90)
        let p95Index = Int(Double(count) * 0.95)
        let p99Index = Int(Double(count) * 0.99)

        let average = latencies.reduce(0, +) / Double(count)

        return LatencyStatistics(
            p50: latencies[min(p50Index, count - 1)],
            p90: latencies[min(p90Index, count - 1)],
            p95: latencies[min(p95Index, count - 1)],
            p99: latencies[min(p99Index, count - 1)],
            average: average,
            min: latencies.first ?? 0,
            max: latencies.last ?? 0
        )
    }

    // MARK: - Category Breakdown

    func getCategoryBreakdown(for window: TimeWindow) -> CategoryBreakdown {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        var breakdown = CategoryBreakdown()
        for entry in windowEntries {
            breakdown.increment(category: entry.category)
        }

        return breakdown
    }

    // MARK: - Top Domains

    func getTopBlockedDomains(limit: Int = 10, window: TimeWindow) -> [(domain: String, count: Int)] {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let blockedEntries = entries.filter { $0.timestamp >= cutoffTime && $0.wasBlocked }

        var domainCounts: [String: Int] = [:]
        for entry in blockedEntries {
            domainCounts[entry.domain, default: 0] += 1
        }

        return domainCounts
            .sorted { $0.value > $1.value }
            .prefix(limit)
            .map { ($0.key, $0.value) }
    }

    func getTopQueriedDomains(limit: Int = 10, window: TimeWindow) -> [(domain: String, count: Int)] {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        var domainCounts: [String: Int] = [:]
        for entry in windowEntries {
            domainCounts[entry.domain, default: 0] += 1
        }

        return domainCounts
            .sorted { $0.value > $1.value }
            .prefix(limit)
            .map { ($0.key, $0.value) }
    }

    // MARK: - Time Series Data

    func getTimeSeries(window: TimeWindow, buckets: Int = 24) -> [(timestamp: Date, blocked: Int, allowed: Int)] {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        guard !windowEntries.isEmpty else {
            return []
        }

        let bucketSize = window.duration / Double(buckets)
        var series: [(timestamp: Date, blocked: Int, allowed: Int)] = []

        for i in 0..<buckets {
            let bucketStart = cutoffTime.addingTimeInterval(Double(i) * bucketSize)
            let bucketEnd = bucketStart.addingTimeInterval(bucketSize)

            let bucketEntries = windowEntries.filter {
                $0.timestamp >= bucketStart && $0.timestamp < bucketEnd
            }

            let blocked = bucketEntries.filter { $0.wasBlocked }.count
            let allowed = bucketEntries.filter { !$0.wasBlocked }.count

            series.append((timestamp: bucketStart, blocked: blocked, allowed: allowed))
        }

        return series
    }

    // MARK: - Query Type Distribution

    func getQueryTypeDistribution(window: TimeWindow) -> [String: Int] {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        var distribution: [String: Int] = [:]
        for entry in windowEntries {
            let typeName = entry.queryType.description
            distribution[typeName, default: 0] += 1
        }

        return distribution
    }

    // MARK: - Overall Statistics

    func getOverallStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        let averageLatency = totalQueries > 0 ? totalLatency / Double(totalQueries) : 0
        let blockRate = totalQueries > 0 ? Double(totalBlocked) / Double(totalQueries) : 0
        let cacheHitRate = (totalCacheHits + totalCacheMisses) > 0 ?
            Double(totalCacheHits) / Double(totalCacheHits + totalCacheMisses) : 0

        return [
            "totalQueries": totalQueries,
            "totalBlocked": totalBlocked,
            "totalAllowed": totalAllowed,
            "totalCacheHits": totalCacheHits,
            "totalCacheMisses": totalCacheMisses,
            "averageLatency": averageLatency,
            "blockRate": blockRate,
            "cacheHitRate": cacheHitRate,
            "entriesCount": entries.count
        ]
    }

    // MARK: - Cleanup

    func cleanup(olderThan interval: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-interval)
        let originalCount = entries.count
        entries.removeAll { $0.timestamp < cutoffTime }

        let removedCount = originalCount - entries.count
        print("Cleaned up \(removedCount) old statistics entries")
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }

        entries.removeAll()
        totalQueries = 0
        totalBlocked = 0
        totalAllowed = 0
        totalCacheHits = 0
        totalCacheMisses = 0
        totalLatency = 0
    }

    // MARK: - Export

    func exportData(window: TimeWindow) -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }

        let cutoffTime = Date().addingTimeInterval(-window.duration)
        let windowEntries = entries.filter { $0.timestamp >= cutoffTime }

        return windowEntries.map { entry in
            return [
                "timestamp": ISO8601DateFormatter().string(from: entry.timestamp),
                "domain": entry.domain,
                "queryType": entry.queryType.description,
                "wasBlocked": entry.wasBlocked,
                "category": entry.category,
                "latency": entry.latency * 1000,  // Convert to ms
                "cacheHit": entry.cacheHit
            ]
        }
    }
}

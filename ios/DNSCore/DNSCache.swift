//
//  DNSCache.swift
//  DNSCore
//
//  High-performance DNS cache with LRU eviction and tiered caching
//

import Foundation

// MARK: - Cache Entry
struct DNSCacheEntry {
    let response: Data
    let timestamp: Date
    let ttl: TimeInterval
    let addresses: [String]

    var isExpired: Bool {
        return Date().timeIntervalSince(timestamp) > ttl
    }

    var remainingTTL: TimeInterval {
        let elapsed = Date().timeIntervalSince(timestamp)
        return max(0, ttl - elapsed)
    }
}

// MARK: - LRU Node
private class LRUNode {
    let key: String
    var entry: DNSCacheEntry
    var prev: LRUNode?
    var next: LRUNode?

    init(key: String, entry: DNSCacheEntry) {
        self.key = key
        self.entry = entry
    }
}

// MARK: - DNS Cache
class DNSCache {

    // MARK: - Configuration
    private let maxHotCacheSize: Int
    private let maxColdCacheSize: Int
    private let minTTL: TimeInterval
    private let maxTTL: TimeInterval
    private let defaultTTL: TimeInterval

    // MARK: - Hot Cache (LRU)
    private var hotCache: [String: LRUNode] = [:]
    private var hotCacheHead: LRUNode?
    private var hotCacheTail: LRUNode?

    // MARK: - Cold Cache
    private var coldCache: [String: DNSCacheEntry] = [:]

    // MARK: - Thread Safety
    private let lock = NSLock()

    // MARK: - Statistics
    private(set) var totalHits: Int = 0
    private(set) var totalMisses: Int = 0
    private(set) var hotCacheHits: Int = 0
    private(set) var coldCacheHits: Int = 0

    var hitRate: Double {
        let total = totalHits + totalMisses
        return total > 0 ? Double(totalHits) / Double(total) : 0.0
    }

    var currentSize: Int {
        lock.lock()
        defer { lock.unlock() }
        return hotCache.count + coldCache.count
    }

    // MARK: - Initialization

    init(maxHotCacheSize: Int = 100,
         maxColdCacheSize: Int = 900,
         minTTL: TimeInterval = 5,
         maxTTL: TimeInterval = 86400,  // 24 hours
         defaultTTL: TimeInterval = 300) {
        self.maxHotCacheSize = maxHotCacheSize
        self.maxColdCacheSize = maxColdCacheSize
        self.minTTL = minTTL
        self.maxTTL = maxTTL
        self.defaultTTL = defaultTTL
    }

    // MARK: - Cache Operations

    /// Get cached DNS response
    /// - Parameters:
    ///   - domain: Domain name
    ///   - queryType: DNS query type
    /// - Returns: Cached entry or nil if not found or expired
    func get(domain: String, queryType: DNSQueryType) -> DNSCacheEntry? {
        let key = cacheKey(domain: domain, queryType: queryType)

        lock.lock()
        defer { lock.unlock() }

        // Check hot cache first
        if let node = hotCache[key] {
            if node.entry.isExpired {
                removeFromHotCache(node)
                totalMisses += 1
                return nil
            }
            // Move to front (most recently used)
            moveToFront(node)
            totalHits += 1
            hotCacheHits += 1
            return node.entry
        }

        // Check cold cache
        if let entry = coldCache[key] {
            if entry.isExpired {
                coldCache.removeValue(forKey: key)
                totalMisses += 1
                return nil
            }
            // Promote to hot cache on access
            promoteToHotCache(key: key, entry: entry)
            coldCache.removeValue(forKey: key)
            totalHits += 1
            coldCacheHits += 1
            return entry
        }

        totalMisses += 1
        return nil
    }

    /// Store DNS response in cache
    /// - Parameters:
    ///   - domain: Domain name
    ///   - queryType: DNS query type
    ///   - response: DNS response data
    ///   - addresses: Resolved IP addresses
    ///   - ttl: Time-to-live (will be clamped to min/max)
    func set(domain: String, queryType: DNSQueryType, response: Data, addresses: [String], ttl: TimeInterval) {
        let key = cacheKey(domain: domain, queryType: queryType)
        let clampedTTL = min(max(ttl, minTTL), maxTTL)

        let entry = DNSCacheEntry(
            response: response,
            timestamp: Date(),
            ttl: clampedTTL,
            addresses: addresses
        )

        lock.lock()
        defer { lock.unlock() }

        // Always add to hot cache (most recently used)
        if let existingNode = hotCache[key] {
            // Update existing entry
            existingNode.entry = entry
            moveToFront(existingNode)
        } else {
            // Add new entry
            let node = LRUNode(key: key, entry: entry)
            hotCache[key] = node
            addToFront(node)

            // Evict from hot cache if over capacity
            if hotCache.count > maxHotCacheSize {
                if let evicted = evictFromHotCache() {
                    // Move evicted entry to cold cache
                    if coldCache.count >= maxColdCacheSize {
                        // Evict oldest from cold cache
                        evictFromColdCache()
                    }
                    coldCache[evicted.key] = evicted.entry
                }
            }
        }

        // Remove from cold cache if it was there
        coldCache.removeValue(forKey: key)
    }

    /// Remove entry from cache
    /// - Parameters:
    ///   - domain: Domain name
    ///   - queryType: DNS query type
    func remove(domain: String, queryType: DNSQueryType) {
        let key = cacheKey(domain: domain, queryType: queryType)

        lock.lock()
        defer { lock.unlock() }

        if let node = hotCache[key] {
            removeFromHotCache(node)
        }
        coldCache.removeValue(forKey: key)
    }

    /// Clear all cache entries
    func clear() {
        lock.lock()
        defer { lock.unlock() }

        hotCache.removeAll()
        coldCache.removeAll()
        hotCacheHead = nil
        hotCacheTail = nil

        // Reset statistics
        totalHits = 0
        totalMisses = 0
        hotCacheHits = 0
        coldCacheHits = 0
    }

    /// Remove all entries matching a domain pattern
    /// - Parameter domain: Domain name or pattern (e.g., "google.com" matches "www.google.com")
    func removeMatching(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        // Remove from hot cache
        let hotKeysToRemove = hotCache.keys.filter { key in
            key.contains(domain)
        }
        for key in hotKeysToRemove {
            if let node = hotCache[key] {
                removeFromHotCache(node)
            }
        }

        // Remove from cold cache
        let coldKeysToRemove = coldCache.keys.filter { key in
            key.contains(domain)
        }
        for key in coldKeysToRemove {
            coldCache.removeValue(forKey: key)
        }
    }

    /// Clean up expired entries
    /// - Returns: Number of entries removed
    @discardableResult
    func cleanup() -> Int {
        lock.lock()
        defer { lock.unlock() }

        var removedCount = 0

        // Clean hot cache
        var current = hotCacheHead
        while let node = current {
            let next = node.next
            if node.entry.isExpired {
                removeFromHotCache(node)
                removedCount += 1
            }
            current = next
        }

        // Clean cold cache
        let expiredKeys = coldCache.filter { $0.value.isExpired }.map { $0.key }
        for key in expiredKeys {
            coldCache.removeValue(forKey: key)
            removedCount += 1
        }

        return removedCount
    }

    // MARK: - LRU Operations

    private func addToFront(_ node: LRUNode) {
        node.next = hotCacheHead
        node.prev = nil

        if let head = hotCacheHead {
            head.prev = node
        }
        hotCacheHead = node

        if hotCacheTail == nil {
            hotCacheTail = node
        }
    }

    private func removeFromHotCache(_ node: LRUNode) {
        if node.prev != nil {
            node.prev?.next = node.next
        } else {
            hotCacheHead = node.next
        }

        if node.next != nil {
            node.next?.prev = node.prev
        } else {
            hotCacheTail = node.prev
        }

        hotCache.removeValue(forKey: node.key)
    }

    private func moveToFront(_ node: LRUNode) {
        if node === hotCacheHead {
            return
        }

        // Remove from current position
        if node.prev != nil {
            node.prev?.next = node.next
        }
        if node.next != nil {
            node.next?.prev = node.prev
        } else {
            hotCacheTail = node.prev
        }

        // Add to front
        node.next = hotCacheHead
        node.prev = nil
        hotCacheHead?.prev = node
        hotCacheHead = node
    }

    private func evictFromHotCache() -> LRUNode? {
        guard let tail = hotCacheTail else { return nil }

        if tail.prev != nil {
            tail.prev?.next = nil
            hotCacheTail = tail.prev
        } else {
            hotCacheHead = nil
            hotCacheTail = nil
        }

        hotCache.removeValue(forKey: tail.key)
        return tail
    }

    private func promoteToHotCache(key: String, entry: DNSCacheEntry) {
        let node = LRUNode(key: key, entry: entry)
        hotCache[key] = node
        addToFront(node)

        // Evict if over capacity
        if hotCache.count > maxHotCacheSize {
            if let evicted = evictFromHotCache() {
                // Move back to cold cache
                if coldCache.count >= maxColdCacheSize {
                    evictFromColdCache()
                }
                coldCache[evicted.key] = evicted.entry
            }
        }
    }

    private func evictFromColdCache() {
        // Find entry with earliest expiration (shortest remaining TTL)
        guard let oldestKey = coldCache.min(by: { a, b in
            a.value.remainingTTL < b.value.remainingTTL
        })?.key else {
            return
        }
        coldCache.removeValue(forKey: oldestKey)
    }

    // MARK: - Utilities

    private func cacheKey(domain: String, queryType: DNSQueryType) -> String {
        return "\(domain)_\(queryType.rawValue)"
    }

    // MARK: - Statistics

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        return [
            "totalHits": totalHits,
            "totalMisses": totalMisses,
            "hitRate": hitRate,
            "hotCacheHits": hotCacheHits,
            "coldCacheHits": coldCacheHits,
            "hotCacheSize": hotCache.count,
            "coldCacheSize": coldCache.count,
            "totalSize": hotCache.count + coldCache.count
        ]
    }

    func resetStatistics() {
        lock.lock()
        defer { lock.unlock() }

        totalHits = 0
        totalMisses = 0
        hotCacheHits = 0
        coldCacheHits = 0
    }
}

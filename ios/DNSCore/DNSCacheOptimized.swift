//
//  DNSCacheOptimized.swift
//  DNSCore
//
//  Optimized DNS cache with:
//  - P0-2: CACurrentMediaTime for fast expiry checks
//  - P1-1: Read-write lock for better concurrency
//  - Improved memory efficiency
//

import Foundation
import QuartzCore  // For CACurrentMediaTime

// MARK: - Optimized Cache Entry
struct DNSCacheEntryOptimized {
    let response: Data
    let createdAt: TimeInterval  // CACurrentMediaTime timestamp
    let expiresAt: TimeInterval  // Precomputed expiration time
    let addresses: [String]

    // P0-2: Fast expiry check using precomputed time
    var isExpired: Bool {
        return CACurrentMediaTime() > expiresAt
    }

    var remainingTTL: TimeInterval {
        return max(0, expiresAt - CACurrentMediaTime())
    }
}

// MARK: - LRU Node
private class LRUNode {
    let key: String
    var entry: DNSCacheEntryOptimized
    var prev: LRUNode?
    var next: LRUNode?

    init(key: String, entry: DNSCacheEntryOptimized) {
        self.key = key
        self.entry = entry
    }
}

// MARK: - Read-Write Lock Wrapper
private class ReadWriteLock {
    private var rwlock = pthread_rwlock_t()

    init() {
        pthread_rwlock_init(&rwlock, nil)
    }

    deinit {
        pthread_rwlock_destroy(&rwlock)
    }

    func readLock() {
        pthread_rwlock_rdlock(&rwlock)
    }

    func writeLock() {
        pthread_rwlock_wrlock(&rwlock)
    }

    func unlock() {
        pthread_rwlock_unlock(&rwlock)
    }

    // Helper for read operations
    func withReadLock<T>(_ body: () -> T) -> T {
        readLock()
        defer { unlock() }
        return body()
    }

    // Helper for write operations
    func withWriteLock<T>(_ body: () -> T) -> T {
        writeLock()
        defer { unlock() }
        return body()
    }
}

// MARK: - Optimized DNS Cache
class DNSCacheOptimized {

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
    private var coldCache: [String: DNSCacheEntryOptimized] = [:]

    // MARK: - Thread Safety (P1-1: Read-Write Lock)
    private let rwLock = ReadWriteLock()

    // MARK: - Statistics (separate lock to avoid contention)
    private var _totalHits: Int = 0
    private var _totalMisses: Int = 0
    private var _hotCacheHits: Int = 0
    private var _coldCacheHits: Int = 0
    private let statsLock = NSLock()

    var hitRate: Double {
        statsLock.lock()
        defer { statsLock.unlock() }
        let total = _totalHits + _totalMisses
        return total > 0 ? Double(_totalHits) / Double(total) : 0.0
    }

    var currentSize: Int {
        return rwLock.withReadLock {
            return hotCache.count + coldCache.count
        }
    }

    // MARK: - Initialization

    init(maxHotCacheSize: Int = 100,
         maxColdCacheSize: Int = 900,
         minTTL: TimeInterval = 5,
         maxTTL: TimeInterval = 86400,
         defaultTTL: TimeInterval = 300) {
        self.maxHotCacheSize = maxHotCacheSize
        self.maxColdCacheSize = maxColdCacheSize
        self.minTTL = minTTL
        self.maxTTL = maxTTL
        self.defaultTTL = defaultTTL
    }

    // MARK: - Cache Operations

    /// Get cached DNS response with read lock
    func get(domain: String, queryType: DNSQueryType) -> DNSCacheEntryOptimized? {
        let key = cacheKey(domain: domain, queryType: queryType)

        // P1-1: Use read lock for lookup (allows concurrent reads)
        rwLock.readLock()

        // Check hot cache first
        if let node = hotCache[key] {
            if node.entry.isExpired {
                rwLock.unlock()
                // Need write lock to remove
                removeExpiredEntry(key: key)
                recordMiss()
                return nil
            }

            let entry = node.entry
            rwLock.unlock()

            // Move to front (needs write lock, but don't block read)
            moveToFrontAsync(key: key)

            recordHit(hot: true)
            return entry
        }

        // Check cold cache
        if let entry = coldCache[key] {
            if entry.isExpired {
                rwLock.unlock()
                removeExpiredEntry(key: key)
                recordMiss()
                return nil
            }

            rwLock.unlock()

            // Promote to hot cache (needs write lock)
            promoteToHotCacheAsync(key: key, entry: entry)

            recordHit(hot: false)
            return entry
        }

        rwLock.unlock()
        recordMiss()
        return nil
    }

    /// Get without updating stats (for fast path)
    func getWithoutStatsUpdate(domain: String, queryType: DNSQueryType) -> DNSCacheEntryOptimized? {
        let key = cacheKey(domain: domain, queryType: queryType)

        return rwLock.withReadLock {
            // Check hot cache
            if let node = hotCache[key], !node.entry.isExpired {
                return node.entry
            }

            // Check cold cache
            if let entry = coldCache[key], !entry.isExpired {
                return entry
            }

            return nil
        }
    }

    /// Record hit for fast path (called from async queue)
    func recordHit(hot: Bool) {
        statsLock.lock()
        defer { statsLock.unlock() }

        _totalHits += 1
        if hot {
            _hotCacheHits += 1
        } else {
            _coldCacheHits += 1
        }
    }

    private func recordMiss() {
        statsLock.lock()
        defer { statsLock.unlock() }
        _totalMisses += 1
    }

    /// Store DNS response in cache with write lock
    func set(domain: String, queryType: DNSQueryType, response: Data, addresses: [String], ttl: TimeInterval) {
        let key = cacheKey(domain: domain, queryType: queryType)
        let clampedTTL = min(max(ttl, minTTL), maxTTL)

        // P0-2: Precompute expiration time
        let now = CACurrentMediaTime()
        let entry = DNSCacheEntryOptimized(
            response: response,
            createdAt: now,
            expiresAt: now + clampedTTL,
            addresses: addresses
        )

        // P1-1: Use write lock for modifications
        rwLock.withWriteLock {
            setInternal(key: key, entry: entry)
        }
    }

    private func setInternal(key: String, entry: DNSCacheEntryOptimized) {
        // Always add to hot cache (most recently used)
        if let existingNode = hotCache[key] {
            existingNode.entry = entry
            moveToFrontInternal(existingNode)
        } else {
            let node = LRUNode(key: key, entry: entry)
            hotCache[key] = node
            addToFrontInternal(node)

            // Evict from hot cache if over capacity
            if hotCache.count > maxHotCacheSize {
                if let evicted = evictFromHotCacheInternal() {
                    // Move evicted entry to cold cache
                    if coldCache.count >= maxColdCacheSize {
                        evictFromColdCacheInternal()
                    }
                    coldCache[evicted.key] = evicted.entry
                }
            }
        }

        // Remove from cold cache if it was there
        coldCache.removeValue(forKey: key)
    }

    // MARK: - Async Operations (reduce lock contention)

    private func moveToFrontAsync(key: String) {
        // Use background queue to avoid blocking
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }

            self.rwLock.withWriteLock {
                if let node = self.hotCache[key] {
                    self.moveToFrontInternal(node)
                }
            }
        }
    }

    private func promoteToHotCacheAsync(key: String, entry: DNSCacheEntryOptimized) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }

            self.rwLock.withWriteLock {
                // Check if still in cold cache
                if self.coldCache[key] != nil {
                    self.coldCache.removeValue(forKey: key)
                    self.promoteToHotCacheInternal(key: key, entry: entry)
                }
            }
        }
    }

    private func removeExpiredEntry(key: String) {
        rwLock.withWriteLock {
            if let node = hotCache[key] {
                removeFromHotCacheInternal(node)
            }
            coldCache.removeValue(forKey: key)
        }
    }

    // MARK: - Cleanup

    func remove(domain: String, queryType: DNSQueryType) {
        let key = cacheKey(domain: domain, queryType: queryType)

        rwLock.withWriteLock {
            if let node = hotCache[key] {
                removeFromHotCacheInternal(node)
            }
            coldCache.removeValue(forKey: key)
        }
    }

    func clear() {
        rwLock.withWriteLock {
            hotCache.removeAll()
            coldCache.removeAll()
            hotCacheHead = nil
            hotCacheTail = nil
        }

        statsLock.lock()
        _totalHits = 0
        _totalMisses = 0
        _hotCacheHits = 0
        _coldCacheHits = 0
        statsLock.unlock()
    }

    func removeMatching(domain: String) {
        rwLock.withWriteLock {
            let hotKeysToRemove = hotCache.keys.filter { key in
                key.contains(domain)
            }
            for key in hotKeysToRemove {
                if let node = hotCache[key] {
                    removeFromHotCacheInternal(node)
                }
            }

            let coldKeysToRemove = coldCache.keys.filter { key in
                key.contains(domain)
            }
            for key in coldKeysToRemove {
                coldCache.removeValue(forKey: key)
            }
        }
    }

    @discardableResult
    func cleanup() -> Int {
        return rwLock.withWriteLock {
            var removedCount = 0

            // Clean hot cache
            var current = hotCacheHead
            while let node = current {
                let next = node.next
                if node.entry.isExpired {
                    removeFromHotCacheInternal(node)
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
    }

    // MARK: - LRU Operations (Internal - assume write lock held)

    private func addToFrontInternal(_ node: LRUNode) {
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

    private func removeFromHotCacheInternal(_ node: LRUNode) {
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

    private func moveToFrontInternal(_ node: LRUNode) {
        if node === hotCacheHead {
            return
        }

        if node.prev != nil {
            node.prev?.next = node.next
        }
        if node.next != nil {
            node.next?.prev = node.prev
        } else {
            hotCacheTail = node.prev
        }

        node.next = hotCacheHead
        node.prev = nil
        hotCacheHead?.prev = node
        hotCacheHead = node
    }

    private func evictFromHotCacheInternal() -> LRUNode? {
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

    private func promoteToHotCacheInternal(key: String, entry: DNSCacheEntryOptimized) {
        let node = LRUNode(key: key, entry: entry)
        hotCache[key] = node
        addToFrontInternal(node)

        if hotCache.count > maxHotCacheSize {
            if let evicted = evictFromHotCacheInternal() {
                if coldCache.count >= maxColdCacheSize {
                    evictFromColdCacheInternal()
                }
                coldCache[evicted.key] = evicted.entry
            }
        }
    }

    private func evictFromColdCacheInternal() {
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
        let stats = statsLock.withLock {
            return [
                "totalHits": _totalHits,
                "totalMisses": _totalMisses,
                "hotCacheHits": _hotCacheHits,
                "coldCacheHits": _coldCacheHits
            ]
        }

        let sizes = rwLock.withReadLock {
            return [
                "hotCacheSize": hotCache.count,
                "coldCacheSize": coldCache.count,
                "totalSize": hotCache.count + coldCache.count
            ]
        }

        let hitRate = self.hitRate

        return stats.merging(sizes) { $1 }
            .merging(["hitRate": hitRate]) { $1 }
    }

    func resetStatistics() {
        statsLock.lock()
        defer { statsLock.unlock() }

        _totalHits = 0
        _totalMisses = 0
        _hotCacheHits = 0
        _coldCacheHits = 0
    }
}

// MARK: - NSLock Extension for convenience
extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}

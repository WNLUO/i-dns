//
//  DNSFilterOptimized.swift
//  DNSCore
//
//  Optimized DNS filter with:
//  - P1-3: Zero-copy reverse domain iterator
//  - P2-2: Compact Trie implementation (memory efficient)
//  - Improved performance
//

import Foundation

// MARK: - Reverse Domain Iterator (P1-3: Zero-copy)
struct ReverseDomainIterator: IteratorProtocol {
    private let domain: String
    private var currentEnd: String.Index
    private var finished: Bool = false

    init(domain: String) {
        self.domain = domain
        self.currentEnd = domain.endIndex
    }

    mutating func next() -> Substring? {
        guard !finished, currentEnd > domain.startIndex else {
            finished = true
            return nil
        }

        // Find next dot from right to left
        var start = domain.startIndex
        var lastDot: String.Index?

        var idx = domain.startIndex
        while idx < currentEnd {
            if domain[idx] == "." {
                lastDot = idx
            }
            idx = domain.index(after: idx)
        }

        let label: Substring
        if let dotIndex = lastDot {
            start = domain.index(after: dotIndex)
            label = domain[start..<currentEnd]
            currentEnd = dotIndex
        } else {
            label = domain[start..<currentEnd]
            finished = true
        }

        return label.isEmpty ? nil : label
    }
}

// MARK: - Sequence wrapper
struct ReverseDomainSequence: Sequence {
    let domain: String

    func makeIterator() -> ReverseDomainIterator {
        return ReverseDomainIterator(domain: domain)
    }
}

// MARK: - Compact Trie Node (P2-2: Memory efficient)
private class CompactTrieNode {
    // Small children: use array (more memory efficient)
    private var smallChildren: [(label: String, node: CompactTrieNode)]?

    // Large children: upgrade to dictionary when > 4 children
    private var largeChildren: [String: CompactTrieNode]?

    var isBlocked: Bool = false
    var categoryCode: UInt8 = 0  // Use enum instead of String
    var isWildcard: Bool = false

    private static let smallToLargeThreshold = 4

    init() {}

    // Get child node
    func getChild(_ label: String) -> CompactTrieNode? {
        if let large = largeChildren {
            return large[label]
        }

        if let small = smallChildren {
            return small.first(where: { $0.label == label })?.node
        }

        return nil
    }

    // Set child node (auto-upgrade to large if needed)
    func setChild(_ label: String, node: CompactTrieNode) {
        // Check if already in large children
        if var large = largeChildren {
            large[label] = node
            largeChildren = large
            return
        }

        // Check if in small children
        if var small = smallChildren {
            if let index = small.firstIndex(where: { $0.label == label }) {
                small[index] = (label, node)
                smallChildren = small
                return
            }

            // Add to small children
            small.append((label, node))

            // Upgrade to large if threshold exceeded
            if small.count > Self.smallToLargeThreshold {
                var large: [String: CompactTrieNode] = [:]
                for (lbl, nd) in small {
                    large[lbl] = nd
                }
                largeChildren = large
                smallChildren = nil
            } else {
                smallChildren = small
            }
        } else {
            // First child
            smallChildren = [(label, node)]
        }
    }

    // Remove child
    func removeChild(_ label: String) {
        if var large = largeChildren {
            large.removeValue(forKey: label)
            largeChildren = large
            return
        }

        if var small = smallChildren {
            small.removeAll(where: { $0.label == label })
            smallChildren = small.isEmpty ? nil : small
        }
    }

    var hasChildren: Bool {
        return (largeChildren?.count ?? 0) + (smallChildren?.count ?? 0) > 0
    }
}

// MARK: - Category Code (memory efficient)
private enum CategoryCode: UInt8 {
    case unknown = 0
    case tracker = 1
    case ad = 2
    case adult = 3
    case malware = 4
    case allowed = 5

    init(from string: String) {
        switch string.lowercased() {
        case "tracker": self = .tracker
        case "ad": self = .ad
        case "adult": self = .adult
        case "malware": self = .malware
        case "allowed": self = .allowed
        default: self = .unknown
        }
    }

    var string: String {
        switch self {
        case .unknown: return "unknown"
        case .tracker: return "tracker"
        case .ad: return "ad"
        case .adult: return "adult"
        case .malware: return "malware"
        case .allowed: return "allowed"
        }
    }
}

// MARK: - Compact Domain Trie
private class CompactDomainTrie {
    private let root = CompactTrieNode()
    private var count: Int = 0

    /// Insert domain using zero-copy iterator (P1-3)
    func insert(domain: String, category: String, isWildcard: Bool = false) {
        let normalized = domain.lowercased()
        let categoryCode = CategoryCode(from: category)

        var current = root

        // Use zero-copy reverse iterator
        for label in ReverseDomainSequence(domain: normalized) {
            let labelStr = String(label)  // Only allocate when storing
            if let child = current.getChild(labelStr) {
                current = child
            } else {
                let newNode = CompactTrieNode()
                current.setChild(labelStr, node: newNode)
                current = newNode
            }
        }

        if !current.isBlocked {
            count += 1
        }
        current.isBlocked = true
        current.categoryCode = categoryCode.rawValue
        current.isWildcard = isWildcard
    }

    /// Search using zero-copy iterator (P1-3)
    func search(domain: String) -> (blocked: Bool, category: String?, isExact: Bool) {
        let normalized = domain.lowercased()

        var current = root
        var lastMatch: CompactTrieNode?
        var isExactMatch = false
        var labelCount = 0

        for label in ReverseDomainSequence(domain: normalized) {
            labelCount += 1

            // Check for exact match
            if let next = current.getChild(String(label)) {
                current = next
                if current.isBlocked {
                    lastMatch = current
                    // Will determine exactness after loop
                }
            }
            // Check for wildcard
            else if let wildcard = current.getChild("*") {
                if wildcard.isBlocked {
                    let code = CategoryCode(rawValue: wildcard.categoryCode) ?? .unknown
                    return (true, code.string, false)
                }
                break
            }
            else {
                break
            }
        }

        if let match = lastMatch {
            // Exact match if we consumed all labels and node is terminal
            isExactMatch = !match.hasChildren || labelCount == countLabels(in: normalized)
            let code = CategoryCode(rawValue: match.categoryCode) ?? .unknown
            return (true, code.string, isExactMatch)
        }

        return (false, nil, false)
    }

    /// Remove domain using zero-copy iterator
    func remove(domain: String) {
        let normalized = domain.lowercased()

        var path: [(node: CompactTrieNode, label: String)] = []
        var current = root

        // Build path using zero-copy iterator
        for label in ReverseDomainSequence(domain: normalized) {
            let labelStr = String(label)
            guard let next = current.getChild(labelStr) else { return }
            path.append((current, labelStr))
            current = next
        }

        // Unmark as blocked
        if current.isBlocked {
            current.isBlocked = false
            current.categoryCode = 0
            current.isWildcard = false
            count -= 1
        }

        // Clean up empty nodes
        for (node, label) in path.reversed() {
            if let child = node.getChild(label),
               !child.hasChildren && !child.isBlocked {
                node.removeChild(label)
            } else {
                break
            }
        }
    }

    func clear() {
        // Just reset root
        root.largeChildren = nil
        root.smallChildren = nil
        count = 0
    }

    var size: Int { return count }

    private func countLabels(in domain: String) -> Int {
        return domain.split(separator: ".").count
    }
}

// MARK: - DNS Filter Optimized
class DNSFilterOptimized {

    // MARK: - Properties
    private let blacklistTrie = CompactDomainTrie()
    private let whitelistTrie = CompactDomainTrie()
    private let childProtectionTrie = CompactDomainTrie()

    private var childProtectionEnabled: Bool = false

    private let lock = NSLock()

    // MARK: - Statistics
    private(set) var totalQueries: Int = 0
    private(set) var blockedQueries: Int = 0
    private(set) var allowedQueries: Int = 0

    var blockRate: Double {
        return totalQueries > 0 ? Double(blockedQueries) / Double(totalQueries) : 0.0
    }

    // MARK: - Initialization

    init() {
        loadDefaultRules()
    }

    // MARK: - Filter Operations

    /// Filter domain with zero-copy operations (P1-3)
    func filter(domain: String) -> FilterResult {
        lock.lock()
        defer {
            lock.unlock()
            totalQueries += 1
        }

        // No need to normalize here, Trie handles it

        // 1. Whitelist (highest priority)
        let whitelistResult = whitelistTrie.search(domain: domain)
        if whitelistResult.blocked {
            allowedQueries += 1
            return FilterResult.allow
        }

        // 2. Blacklist
        let blacklistResult = blacklistTrie.search(domain: domain)
        if blacklistResult.blocked {
            blockedQueries += 1
            return FilterResult.block(
                category: blacklistResult.category ?? "blacklist",
                rule: domain
            )
        }

        // 3. Child protection
        if childProtectionEnabled {
            let childProtectionResult = childProtectionTrie.search(domain: domain)
            if childProtectionResult.blocked {
                blockedQueries += 1
                return FilterResult.block(
                    category: childProtectionResult.category ?? "adult",
                    rule: domain
                )
            }
        }

        allowedQueries += 1
        return FilterResult.allow
    }

    // MARK: - Blacklist Management

    func addToBlacklist(domain: String, category: String = "blacklist") {
        lock.lock()
        defer { lock.unlock() }

        let isWildcard = domain.hasPrefix("*.")
        let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain

        blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
    }

    func removeFromBlacklist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let cleanDomain = domain.hasPrefix("*.") ? String(domain.dropFirst(2)) : domain
        blacklistTrie.remove(domain: cleanDomain)
    }

    func clearBlacklist() {
        lock.lock()
        defer { lock.unlock() }

        blacklistTrie.clear()
    }

    func loadBlacklist(_ domains: [String: String]) {
        lock.lock()
        defer { lock.unlock() }

        for (domain, category) in domains {
            let isWildcard = domain.hasPrefix("*.")
            let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain
            blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
        }
    }

    // MARK: - Whitelist Management

    func addToWhitelist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let isWildcard = domain.hasPrefix("*.")
        let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain

        whitelistTrie.insert(domain: cleanDomain, category: "allowed", isWildcard: isWildcard)
    }

    func removeFromWhitelist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let cleanDomain = domain.hasPrefix("*.") ? String(domain.dropFirst(2)) : domain
        whitelistTrie.remove(domain: cleanDomain)
    }

    func clearWhitelist() {
        lock.lock()
        defer { lock.unlock() }

        whitelistTrie.clear()
    }

    func loadWhitelist(_ domains: [String]) {
        lock.lock()
        defer { lock.unlock() }

        for domain in domains {
            let isWildcard = domain.hasPrefix("*.")
            let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain
            whitelistTrie.insert(domain: cleanDomain, category: "allowed", isWildcard: isWildcard)
        }
    }

    // MARK: - Child Protection

    func setChildProtectionEnabled(_ enabled: Bool) {
        lock.lock()
        defer { lock.unlock() }

        childProtectionEnabled = enabled
    }

    func isChildProtectionEnabled() -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return childProtectionEnabled
    }

    private func loadDefaultRules() {
        let childProtectionDomains: [String: String] = [
            "pornhub.com": "adult",
            "xvideos.com": "adult",
            "xnxx.com": "adult",
            "xhamster.com": "adult",
            "redtube.com": "adult",
            "youporn.com": "adult",
            "tube8.com": "adult",
            "spankbang.com": "adult",
            "txxx.com": "adult",
            "pornhd.com": "adult"
        ]

        for (domain, category) in childProtectionDomains {
            childProtectionTrie.insert(domain: domain, category: category)
        }
    }

    // MARK: - Statistics

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        return [
            "totalQueries": totalQueries,
            "blockedQueries": blockedQueries,
            "allowedQueries": allowedQueries,
            "blockRate": blockRate,
            "blacklistSize": blacklistTrie.size,
            "whitelistSize": whitelistTrie.size,
            "childProtectionSize": childProtectionTrie.size,
            "childProtectionEnabled": childProtectionEnabled
        ]
    }

    func resetStatistics() {
        lock.lock()
        defer { lock.unlock() }

        totalQueries = 0
        blockedQueries = 0
        allowedQueries = 0
    }

    // MARK: - Bulk Operations

    func updateRules(blacklist: [String: String]?, whitelist: [String]?, childProtection: Bool?) {
        lock.lock()
        defer { lock.unlock() }

        if let blacklist = blacklist {
            blacklistTrie.clear()
            for (domain, category) in blacklist {
                let isWildcard = domain.hasPrefix("*.")
                let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain
                blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
            }
        }

        if let whitelist = whitelist {
            whitelistTrie.clear()
            for domain in whitelist {
                let isWildcard = domain.hasPrefix("*.")
                let cleanDomain = isWildcard ? String(domain.dropFirst(2)) : domain
                whitelistTrie.insert(domain: cleanDomain, category: "allowed", isWildcard: isWildcard)
            }
        }

        if let enabled = childProtection {
            childProtectionEnabled = enabled
        }
    }
}

//
//  DNSFilter.swift
//  DNSCore
//
//  High-performance domain filtering using Trie (prefix tree)
//

import Foundation

// MARK: - Filter Result
struct FilterResult {
    let shouldBlock: Bool
    let category: String
    let matchedRule: String?

    static let allow = FilterResult(shouldBlock: false, category: "allowed", matchedRule: nil)

    static func block(category: String, rule: String) -> FilterResult {
        return FilterResult(shouldBlock: true, category: category, matchedRule: rule)
    }
}

// MARK: - Domain Category
enum DomainCategory: String {
    case tracker = "tracker"
    case ad = "ad"
    case adult = "adult"
    case malware = "malware"
    case unknown = "unknown"
    case allowed = "allowed"
}

// MARK: - Trie Node
private class TrieNode {
    var children: [String: TrieNode] = [:]
    var isBlocked: Bool = false
    var category: String?
    var isWildcard: Bool = false  // For patterns like *.google.com

    init() {}
}

// MARK: - Domain Trie
private class DomainTrie {
    private let root = TrieNode()
    private var count: Int = 0

    /// Insert domain into trie (reversed for suffix matching)
    /// Example: "ads.google.com" -> ["com", "google", "ads"]
    func insert(domain: String, category: String, isWildcard: Bool = false) {
        let labels = domain.split(separator: ".").reversed().map(String.init)
        guard !labels.isEmpty else { return }

        var current = root
        for label in labels {
            if current.children[label] == nil {
                current.children[label] = TrieNode()
            }
            current = current.children[label]!
        }

        if !current.isBlocked {
            count += 1
        }
        current.isBlocked = true
        current.category = category
        current.isWildcard = isWildcard
    }

    /// Search for domain in trie
    /// Returns matching category and whether it's an exact or parent match
    func search(domain: String) -> (blocked: Bool, category: String?, isExact: Bool) {
        let labels = domain.split(separator: ".").reversed().map(String.init)
        guard !labels.isEmpty else { return (false, nil, false) }

        var current = root
        var lastMatch: TrieNode?
        var isExactMatch = false

        for (index, label) in labels.enumerated() {
            // Check for exact match
            if let next = current.children[label] {
                current = next
                if current.isBlocked {
                    lastMatch = current
                    isExactMatch = (index == labels.count - 1)
                }
            }
            // Check for wildcard match (*)
            else if let wildcard = current.children["*"] {
                if wildcard.isBlocked {
                    return (true, wildcard.category, false)
                }
                break
            }
            else {
                break
            }
        }

        if let match = lastMatch {
            return (true, match.category, isExactMatch)
        }

        return (false, nil, false)
    }

    /// Remove domain from trie
    func remove(domain: String) {
        let labels = domain.split(separator: ".").reversed().map(String.init)
        guard !labels.isEmpty else { return }

        var path: [(node: TrieNode, label: String)] = []
        var current = root

        // Build path
        for label in labels {
            guard let next = current.children[label] else { return }
            path.append((current, label))
            current = next
        }

        // Unmark as blocked
        if current.isBlocked {
            current.isBlocked = false
            current.category = nil
            current.isWildcard = false
            count -= 1
        }

        // Clean up empty nodes
        for (node, label) in path.reversed() {
            if let child = node.children[label],
               child.children.isEmpty && !child.isBlocked {
                node.children.removeValue(forKey: label)
            } else {
                break
            }
        }
    }

    /// Clear all entries
    func clear() {
        root.children.removeAll()
        count = 0
    }

    var size: Int { return count }
}

// MARK: - DNS Filter
class DNSFilter {

    // MARK: - Properties
    private let blacklistTrie = DomainTrie()
    private let whitelistTrie = DomainTrie()
    private let childProtectionTrie = DomainTrie()

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

    /// Check if domain should be blocked
    /// Priority: Whitelist > Blacklist > Child Protection
    /// - Parameter domain: Domain name to check
    /// - Returns: Filter result with block decision and category
    func filter(domain: String) -> FilterResult {
        lock.lock()
        defer {
            lock.unlock()
            totalQueries += 1
        }

        let normalizedDomain = domain.lowercased()

        // 1. Check whitelist (highest priority)
        let whitelistResult = whitelistTrie.search(domain: normalizedDomain)
        if whitelistResult.blocked {  // "blocked" in whitelist means explicitly allowed
            allowedQueries += 1
            return FilterResult.allow
        }

        // 2. Check blacklist
        let blacklistResult = blacklistTrie.search(domain: normalizedDomain)
        if blacklistResult.blocked {
            blockedQueries += 1
            return FilterResult.block(
                category: blacklistResult.category ?? "blacklist",
                rule: normalizedDomain
            )
        }

        // 3. Check child protection (if enabled)
        if childProtectionEnabled {
            let childProtectionResult = childProtectionTrie.search(domain: normalizedDomain)
            if childProtectionResult.blocked {
                blockedQueries += 1
                return FilterResult.block(
                    category: childProtectionResult.category ?? "adult",
                    rule: normalizedDomain
                )
            }
        }

        // Allow by default
        allowedQueries += 1
        return FilterResult.allow
    }

    // MARK: - Blacklist Management

    func addToBlacklist(domain: String, category: String = "blacklist") {
        lock.lock()
        defer { lock.unlock() }

        let normalized = domain.lowercased()
        let isWildcard = normalized.hasPrefix("*.")
        let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized

        blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
    }

    func removeFromBlacklist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let normalized = domain.lowercased()
        let cleanDomain = normalized.hasPrefix("*.") ? String(normalized.dropFirst(2)) : normalized

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
            let normalized = domain.lowercased()
            let isWildcard = normalized.hasPrefix("*.")
            let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized

            blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
        }
    }

    // MARK: - Whitelist Management

    func addToWhitelist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let normalized = domain.lowercased()
        let isWildcard = normalized.hasPrefix("*.")
        let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized

        whitelistTrie.insert(domain: cleanDomain, category: "allowed", isWildcard: isWildcard)
    }

    func removeFromWhitelist(domain: String) {
        lock.lock()
        defer { lock.unlock() }

        let normalized = domain.lowercased()
        let cleanDomain = normalized.hasPrefix("*.") ? String(normalized.dropFirst(2)) : normalized

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
            let normalized = domain.lowercased()
            let isWildcard = normalized.hasPrefix("*.")
            let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized

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
        // Default child protection blacklist
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
                let normalized = domain.lowercased()
                let isWildcard = normalized.hasPrefix("*.")
                let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized
                blacklistTrie.insert(domain: cleanDomain, category: category, isWildcard: isWildcard)
            }
        }

        if let whitelist = whitelist {
            whitelistTrie.clear()
            for domain in whitelist {
                let normalized = domain.lowercased()
                let isWildcard = normalized.hasPrefix("*.")
                let cleanDomain = isWildcard ? String(normalized.dropFirst(2)) : normalized
                whitelistTrie.insert(domain: cleanDomain, category: "allowed", isWildcard: isWildcard)
            }
        }

        if let enabled = childProtection {
            childProtectionEnabled = enabled
        }
    }

    // MARK: - Export/Import

    func exportBlacklist() -> [String: String] {
        lock.lock()
        defer { lock.unlock() }

        // This would require traversing the trie, which we'll implement if needed
        return [:]
    }

    func exportWhitelist() -> [String] {
        lock.lock()
        defer { lock.unlock() }

        // This would require traversing the trie, which we'll implement if needed
        return []
    }
}

// MARK: - Utility Extensions

extension DNSFilter {
    /// Check if domain matches parent pattern
    /// Example: "ads.google.com" matches "google.com"
    static func matchesParent(domain: String, parent: String) -> Bool {
        guard domain.count > parent.count else { return domain == parent }
        let suffix = "." + parent
        return domain.hasSuffix(suffix)
    }
}

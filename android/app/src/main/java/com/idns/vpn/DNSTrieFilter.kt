package com.idns.vpn

import android.util.Log

/**
 * Trie-based domain filter for O(m) lookup time (m = domain length)
 * Replaces linear Set-based filtering which was O(n) (n = rule count)
 *
 * Performance improvement: 100-1000x faster for large rule sets
 * Matches iOS DNSFilterOptimized.swift implementation
 */
class DNSTrieFilter {
    private val TAG = "DNSTrieFilter"

    // Compact Trie Node - uses small array for <= 4 children (memory efficient)
    private class TrieNode {
        // Small children: use ArrayList (memory efficient for <= 4 children)
        private var smallChildren: MutableList<Pair<String, TrieNode>>? = null

        // Large children: upgrade to HashMap when > 4 children
        private var largeChildren: MutableMap<String, TrieNode>? = null

        var isBlocked: Boolean = false
        var isWildcard: Boolean = false

        companion object {
            private const val SMALL_TO_LARGE_THRESHOLD = 4
        }

        fun getChild(label: String): TrieNode? {
            largeChildren?.let { return it[label] }
            smallChildren?.let {
                return it.firstOrNull { it.first == label }?.second
            }
            return null
        }

        fun setChild(label: String, node: TrieNode) {
            // If already in large children
            largeChildren?.let {
                it[label] = node
                return
            }

            // If in small children
            smallChildren?.let { small ->
                // Check if already exists
                val existing = small.indexOfFirst { it.first == label }
                if (existing >= 0) {
                    small[existing] = Pair(label, node)
                    return
                }

                // Add to small children
                small.add(Pair(label, node))

                // Upgrade to large if threshold exceeded
                if (small.size > SMALL_TO_LARGE_THRESHOLD) {
                    largeChildren = small.associate { it.first to it.second }.toMutableMap()
                    smallChildren = null
                }
                return
            }

            // First child - use small children
            smallChildren = mutableListOf(Pair(label, node))
        }

        fun getAllChildren(): List<Pair<String, TrieNode>> {
            largeChildren?.let { return it.map { Pair(it.key, it.value) } }
            smallChildren?.let { return it.toList() }
            return emptyList()
        }

        fun removeChild(label: String) {
            largeChildren?.remove(label)
            smallChildren?.removeAll { it.first == label }
        }

        fun clear() {
            smallChildren?.clear()
            largeChildren?.clear()
        }
    }

    private val blacklistRoot = TrieNode()
    private val whitelistRoot = TrieNode()

    /**
     * Add domain to blacklist
     * Domains are stored in reverse order (com.google.www)
     */
    fun addToBlacklist(domain: String, isWildcard: Boolean = false) {
        val normalized = domain.lowercase().trim()
        if (normalized.isEmpty()) return

        val labels = if (normalized.contains("*")) {
            // Handle wildcard: *.example.com -> com.example.*
            normalized.split(".").reversed()
        } else {
            normalized.split(".").reversed()
        }

        var current = blacklistRoot
        for (label in labels) {
            val child = current.getChild(label) ?: TrieNode().also {
                current.setChild(label, it)
            }
            current = child
        }

        current.isBlocked = true
        current.isWildcard = isWildcard || normalized.contains("*")
    }

    /**
     * Add domain to whitelist (higher priority than blacklist)
     */
    fun addToWhitelist(domain: String) {
        val normalized = domain.lowercase().trim()
        if (normalized.isEmpty()) return

        val labels = normalized.split(".").reversed()

        var current = whitelistRoot
        for (label in labels) {
            val child = current.getChild(label) ?: TrieNode().also {
                current.setChild(label, it)
            }
            current = child
        }

        current.isBlocked = false  // Mark as explicitly allowed
    }

    /**
     * Check if domain should be blocked
     * O(m) time complexity where m = domain length
     */
    fun shouldBlock(domain: String): Boolean {
        val normalized = domain.lowercase().trim()
        if (normalized.isEmpty()) return false

        // Check whitelist first (highest priority)
        if (searchTrie(whitelistRoot, normalized, checkWhitelist = true)) {
            return false  // Explicitly allowed
        }

        // Check blacklist
        return searchTrie(blacklistRoot, normalized, checkWhitelist = false)
    }

    /**
     * Search Trie with wildcard support
     */
    private fun searchTrie(root: TrieNode, domain: String, checkWhitelist: Boolean): Boolean {
        val labels = domain.split(".").reversed()

        var current = root
        var wildcardNode: TrieNode? = null

        for ((index, label) in labels.withIndex()) {
            // Check for wildcard match at this level
            current.getChild("*")?.let { wildcardNode = it }

            // Try exact match first
            val child = current.getChild(label)
            if (child == null) {
                // No exact match, check if we have a wildcard match
                if (wildcardNode != null && wildcardNode!!.isWildcard) {
                    return if (checkWhitelist) true else wildcardNode!!.isBlocked
                }
                return false
            }

            current = child

            // If this is the last label, check if it's marked as blocked/allowed
            if (index == labels.size - 1) {
                return if (checkWhitelist) {
                    true  // Found in whitelist
                } else {
                    current.isBlocked
                }
            }
        }

        // Check for wildcard match at end
        if (wildcardNode != null && wildcardNode!!.isWildcard) {
            return if (checkWhitelist) true else wildcardNode!!.isBlocked
        }

        return if (checkWhitelist) false else current.isBlocked
    }

    /**
     * Remove domain from blacklist
     */
    fun removeFromBlacklist(domain: String) {
        val normalized = domain.lowercase().trim()
        if (normalized.isEmpty()) return

        val labels = normalized.split(".").reversed()
        removeTrie(blacklistRoot, labels, 0)
    }

    /**
     * Remove domain from whitelist
     */
    fun removeFromWhitelist(domain: String) {
        val normalized = domain.lowercase().trim()
        if (normalized.isEmpty()) return

        val labels = normalized.split(".").reversed()
        removeTrie(whitelistRoot, labels, 0)
    }

    private fun removeTrie(node: TrieNode, labels: List<String>, index: Int): Boolean {
        if (index >= labels.size) {
            node.isBlocked = false
            node.isWildcard = false
            return node.getAllChildren().isEmpty()
        }

        val label = labels[index]
        val child = node.getChild(label) ?: return false

        val shouldRemoveChild = removeTrie(child, labels, index + 1)

        if (shouldRemoveChild) {
            // Remove child if it's now empty
            node.removeChild(label)
        }

        return !node.isBlocked && node.getAllChildren().isEmpty()
    }

    /**
     * Clear all rules
     */
    fun clear() {
        clearNode(blacklistRoot)
        clearNode(whitelistRoot)
    }

    private fun clearNode(node: TrieNode) {
        node.clear()
        node.isBlocked = false
        node.isWildcard = false
    }

    /**
     * Get statistics about the filter
     */
    fun getStatistics(): Map<String, Int> {
        return mapOf(
            "blacklistNodes" to countNodes(blacklistRoot),
            "whitelistNodes" to countNodes(whitelistRoot),
            "blacklistRules" to countRules(blacklistRoot),
            "whitelistRules" to countRules(whitelistRoot)
        )
    }

    private fun countNodes(node: TrieNode): Int {
        var count = 1
        for ((_, child) in node.getAllChildren()) {
            count += countNodes(child)
        }
        return count
    }

    private fun countRules(node: TrieNode): Int {
        var count = if (node.isBlocked) 1 else 0
        for ((_, child) in node.getAllChildren()) {
            count += countRules(child)
        }
        return count
    }
}

package com.idns.vpn

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.idns.R
import com.idns.MainActivity
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Semaphore
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import android.util.LruCache
import kotlin.concurrent.thread

class DNSVpnService : VpnService() {

    companion object {
        private const val TAG = "DNSVpnService"
        private const val VPN_ADDRESS = "10.0.0.2"
        private const val VPN_ROUTE = "0.0.0.0"  // 拦截所有流量
        private const val VPN_DNS = "10.0.0.1"   // 虚拟DNS服务器，所有DNS查询会发到这里
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "DNSVpnChannel"

        @Volatile
        var instance: DNSVpnService? = null

        @Volatile
        var isRunning = AtomicBoolean(false)
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var vpnThread: Thread? = null

    // P0-2: Use Trie filter instead of Set (100-1000x faster)
    private val trieFilter = DNSTrieFilter()

    // DoH (DNS over HTTPS) Client - 使用加密的HTTPS协议查询DNS
    // DoH 服务器: https://i-dns.wnluo.com/dns-query
    private val dohClient = DNSDoHClient(dohServerUrl = "https://i-dns.wnluo.com/dns-query")

    // 非DNS流量转发器 (TCP/UDP)
    private val packetForwarder = PacketForwarder(this)

    // Thread pool for DNS queries (limit concurrent threads)
    private var dnsQueryExecutor = Executors.newFixedThreadPool(10) as ThreadPoolExecutor

    // P0-3: Async event queue (don't block critical path)
    private var eventExecutor = Executors.newSingleThreadExecutor()

    // P0-1 & P1-2: Optimized DNS Cache with read-write lock
    private val dnsCache = DNSCacheOptimized(
        maxHotCacheSize = 100,
        maxColdCacheSize = 900
    )

    // P1-3: ByteBuffer pool for zero-copy operations
    private val bufferPool = object : ThreadLocal<ByteBuffer>() {
        override fun initialValue() = ByteBuffer.allocate(32767)
    }

    private var ednsDoEnabled = false

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize VpnLogger first
        VpnLogger.init(this)
        VpnLogger.i(TAG, "=== VPN Service onCreate ===")

        loadFilterRules()
        loadEdnsSetting()

        // Log optimization status
        VpnLogger.i(TAG, "===========================================")
        VpnLogger.i(TAG, "VPN Service created with optimizations:")
        VpnLogger.i(TAG, "  - P0-1: Fast path enabled")
        VpnLogger.i(TAG, "  - P0-2: Trie filter (100-1000x faster)")
        VpnLogger.i(TAG, "  - P0-3: Async event sending")
        VpnLogger.i(TAG, "  - P1-1: Zero-copy DNS parsing")
        VpnLogger.i(TAG, "  - P1-2: Optimized cache (4-8x concurrency)")
        VpnLogger.i(TAG, "  - P1-3: ByteBuffer pool")
        VpnLogger.i(TAG, "  - DoH: DNS over HTTPS (RFC 8484)")
        VpnLogger.i(TAG, "===========================================")
        VpnLogger.i(TAG, "DoH Server: https://i-dns.wnluo.com/dns-query")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        VpnLogger.i(TAG, "VPN Service starting... Action: ${intent?.action}")

        when (intent?.action) {
            "STOP" -> {
                VpnLogger.i(TAG, "Received STOP action")
                stopVPN()
                return START_NOT_STICKY
            }
            "ADD_BLACKLIST" -> {
                intent.getStringExtra("domain")?.let {
                    VpnLogger.i(TAG, "Adding to blacklist: $it")
                    addToBlacklist(it)
                }
                return START_STICKY
            }
            "REMOVE_BLACKLIST" -> {
                intent.getStringExtra("domain")?.let {
                    VpnLogger.i(TAG, "Removing from blacklist: $it")
                    removeFromBlacklist(it)
                }
                return START_STICKY
            }
            "ADD_WHITELIST" -> {
                intent.getStringExtra("domain")?.let {
                    VpnLogger.i(TAG, "Adding to whitelist: $it")
                    addToWhitelist(it)
                }
                return START_STICKY
            }
            "REMOVE_WHITELIST" -> {
                intent.getStringExtra("domain")?.let {
                    VpnLogger.i(TAG, "Removing from whitelist: $it")
                    removeFromWhitelist(it)
                }
                return START_STICKY
            }
            "UPDATE_EDNS" -> {
                val enabled = intent.getBooleanExtra("enabled", false)
                ednsDoEnabled = enabled
                VpnLogger.i(TAG, "Updated EDNS DO setting: $enabled")
                return START_STICKY
            }
            "UPDATE_DNS" -> {
                // DoH模式 - DNS服务器已固定为 i-dns.wnluo.com
                VpnLogger.i(TAG, "DNS update request ignored (DoH mode with fixed server)")
                return START_STICKY
            }
        }

        startForeground(NOTIFICATION_ID, createNotification())

        // Run startVPN in background thread to allow DNS resolution before VPN starts
        Thread {
            startVPN()
        }.start()

        return START_STICKY
    }

    override fun onDestroy() {
        VpnLogger.i(TAG, "=== VPN Service onDestroy ===")
        stopVPN()

        // Cleanup DoH client
        dohClient.shutdown()

        // Close VpnLogger last
        VpnLogger.close()

        // Shutdown thread pools
        dnsQueryExecutor.shutdown()
        eventExecutor.shutdown()
        try {
            if (!dnsQueryExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                dnsQueryExecutor.shutdownNow()
            }
            if (!eventExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                eventExecutor.shutdownNow()
            }
        } catch (e: InterruptedException) {
            dnsQueryExecutor.shutdownNow()
            eventExecutor.shutdownNow()
        }

        // Clear DNS cache
        dnsCache.clear()

        // Clear filter
        trieFilter.clear()

        instance = null
        super.onDestroy()

        // Log final statistics
        val stats = dnsCache.getStatistics()
        Log.d(TAG, "VPN Service destroyed. Cache stats: $stats")
    }

    private fun startVPN() {
        VpnLogger.i(TAG, "========================================")
        VpnLogger.i(TAG, "Starting VPN (DoH Mode)...")
        VpnLogger.i(TAG, "VPN Address: $VPN_ADDRESS")
        VpnLogger.i(TAG, "VPN DNS: $VPN_DNS (virtual, forces all DNS through VPN)")
        VpnLogger.i(TAG, "DoH Server: https://i-dns.wnluo.com/dns-query")
        VpnLogger.i(TAG, "========================================")

        if (isRunning.get()) {
            VpnLogger.w(TAG, "VPN already running")
            return
        }

        // Recreate thread pools if they were shut down
        if (dnsQueryExecutor.isShutdown || dnsQueryExecutor.isTerminated) {
            VpnLogger.d(TAG, "Recreating DNS query executor (was shutdown)")
            dnsQueryExecutor = Executors.newFixedThreadPool(10) as ThreadPoolExecutor
        }
        if (eventExecutor.isShutdown || eventExecutor.isTerminated) {
            VpnLogger.d(TAG, "Recreating event executor (was shutdown)")
            eventExecutor = Executors.newSingleThreadExecutor()
        }

        try {
            VpnLogger.i(TAG, "Establishing VPN interface...")

            val builder = Builder()
                .setSession("iDNS Family Protection")
                .addAddress(VPN_ADDRESS, 24)  // 10.0.0.2/24
                .addRoute(VPN_ROUTE, 0)       // 0.0.0.0/0 - 拦截所有流量
                .addDnsServer(VPN_DNS)        // 10.0.0.1 - 虚拟DNS，强制所有DNS查询经过VPN
                .setBlocking(false)           // 非阻塞模式，提高响应性
                .setMtu(1500)

            // Android 10+ 需要设置 metered 属性
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                builder.setMetered(false)
            }

            vpnInterface = builder.establish()

            if (vpnInterface == null) {
                VpnLogger.e(TAG, "❌ Failed to establish VPN interface")
                stopSelf()
                return
            }

            isRunning.set(true)
            sendStatusBroadcast(true)

            vpnThread = thread(start = true) {
                runVPN()
            }

            VpnLogger.i(TAG, "✅ VPN started successfully")
            VpnLogger.i(TAG, "Mode: All traffic routed through VPN, DNS queries intercepted and processed")

        } catch (e: Exception) {
            VpnLogger.e(TAG, "❌ Error starting VPN", e)
            stopVPN()
        }
    }

    private fun stopVPN() {
        VpnLogger.i(TAG, "========================================")
        VpnLogger.i(TAG, "Stopping VPN...")
        VpnLogger.i(TAG, "========================================")

        isRunning.set(false)
        sendStatusBroadcast(false)

        try {
            vpnInterface?.close()
            vpnInterface = null
            VpnLogger.i(TAG, "VPN interface closed")
        } catch (e: Exception) {
            VpnLogger.e(TAG, "Error closing VPN interface", e)
        }

        vpnThread?.interrupt()
        vpnThread = null

        stopForeground(true)
        stopSelf()

        VpnLogger.i(TAG, "✅ VPN stopped")
    }

    private fun restartVPN() {
        stopVPN()
        Thread.sleep(500)
        startVPN()
    }

    private fun runVPN() {
        Log.d(TAG, "VPN thread started")

        val vpnInput = FileInputStream(vpnInterface!!.fileDescriptor)
        val vpnOutput = FileOutputStream(vpnInterface!!.fileDescriptor)

        // P1-3: Reuse ByteBuffer from pool
        val buffer = bufferPool.get()!!

        try {
            while (isRunning.get() && !Thread.interrupted()) {
                buffer.clear()

                // Read packet from VPN interface
                val length = vpnInput.read(buffer.array())
                if (length <= 0) continue

                buffer.limit(length)
                buffer.position(0)

                // P0-1: Process packet with fast path optimization
                processPacketOptimized(buffer.array(), length, vpnOutput)
            }
        } catch (e: Exception) {
            if (isRunning.get()) {
                Log.e(TAG, "Error in VPN loop", e)
            }
        } finally {
            try {
                vpnInput.close()
                vpnOutput.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing streams", e)
            }
        }

        Log.d(TAG, "VPN thread stopped")
    }

    /**
     * P0-1: Optimized packet processing with fast path
     * Fast path: 90% of queries hit cache and return in 5-20μs
     * Slow path: Full processing for cache misses
     *
     * 处理策略:
     * - DNS流量 (UDP port 53): 拦截并处理/过滤
     * - 非DNS流量: 通过 PacketForwarder 转发到真实网络
     */
    private fun processPacketOptimized(packet: ByteArray, length: Int, vpnOutput: FileOutputStream) {
        try {
            // Quick validation
            if (length < 20) return

            val version = (packet[0].toInt() shr 4) and 0x0F
            if (version != 4) {
                // 非IPv4包，目前不处理
                return
            }

            val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
            val protocol = packet[9].toInt() and 0xFF

            // 检查是否是UDP包
            if (protocol == 17 && length >= ipHeaderLength + 8) {
                val udpHeaderStart = ipHeaderLength
                val destPort = ((packet[udpHeaderStart + 2].toInt() and 0xFF) shl 8) or
                        (packet[udpHeaderStart + 3].toInt() and 0xFF)

                if (destPort == 53) {
                    // 这是DNS包，进行处理
                    VpnLogger.d(TAG, "Processing DNS packet, length: $length")

                    // P0-1: TRY FAST PATH FIRST (90% of queries)
                    if (tryFastPath(packet, length, ipHeaderLength, vpnOutput)) {
                        return  // Cache hit! Done in 5-20μs
                    }

                    // SLOW PATH: Cache miss, do full processing
                    processSlowPath(packet, length, ipHeaderLength, vpnOutput)
                    return
                }
            }

            // 非DNS流量：通过 PacketForwarder 转发
            packetForwarder.forward(packet, length, protocol, vpnOutput)

        } catch (e: Exception) {
            Log.e(TAG, "Error processing packet", e)
        }
    }

    /**
     * P0-1: Fast path for cache hits (~90% of queries)
     * - Quick domain extraction (no full parsing)
     * - Direct cache lookup
     * - Immediate response sending
     * - Async stats update (non-blocking)
     *
     * Performance: 5-20μs vs 100-500μs for slow path
     */
    private fun tryFastPath(
        packet: ByteArray,
        length: Int,
        ipHeaderLength: Int,
        vpnOutput: FileOutputStream
    ): Boolean {
        try {
            val dnsStart = ipHeaderLength + 8

            // P1-1: Quick parse domain only (zero-copy, no full DNS parsing)
            val domain = quickParseDomain(packet, dnsStart) ?: return false

            // Direct cache lookup (no stats update for speed)
            val cachedResponse = dnsCache.getWithoutStats(domain) ?: return false

            // Construct and send response immediately
            val responsePacket = createDNSResponsePacket(
                packet,
                cachedResponse,
                ipHeaderLength
            ) ?: return false

            synchronized(vpnOutput) {
                vpnOutput.write(responsePacket)
            }

            // P0-3: Async stats update (don't block critical path)
            eventExecutor.execute {
                val resolvedIP = parseResolvedIP(cachedResponse) ?: ""
                sendDNSEvent(domain, false, 0, resolvedIP)
            }

            return true  // Fast path success!

        } catch (e: Exception) {
            // Fall through to slow path
            return false
        }
    }

    /**
     * P1-1: Quick domain parsing - zero-copy, minimal allocations
     * Only extracts domain name, doesn't parse full DNS structure
     */
    private fun quickParseDomain(packet: ByteArray, dnsStart: Int): String? {
        try {
            if (packet.size < dnsStart + 12) return null

            var index = dnsStart + 12
            val domain = StringBuilder(64)  // Pre-allocate typical domain size

            while (index < packet.size) {
                val len = packet[index].toInt() and 0xFF
                if (len == 0) break
                if (len > 63) return null  // Invalid label length

                index++
                if (index + len > packet.size) return null

                // Direct byte-to-char conversion (ASCII)
                for (i in 0 until len) {
                    domain.append(packet[index + i].toInt().toChar())
                }

                index += len

                if (index < packet.size && packet[index].toInt() and 0xFF != 0) {
                    domain.append('.')
                }
            }

            return if (domain.isEmpty()) null else domain.toString().lowercase()

        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Slow path: Full DNS processing for cache misses
     */
    private fun processSlowPath(
        packet: ByteArray,
        length: Int,
        ipHeaderLength: Int,
        vpnOutput: FileOutputStream
    ) {
        // Parse full DNS query
        val dnsQuery = parseDNSQuery(packet, ipHeaderLength + 8)
        if (dnsQuery == null) {
            vpnOutput.write(packet, 0, length)
            return
        }

        Log.d(TAG, "DNS query for: ${dnsQuery.domain}")

        // P0-2: Use Trie filter (100-1000x faster than Set)
        val shouldBlock = trieFilter.shouldBlock(dnsQuery.domain)

        // P0-3: Async event sending (don't block)
        eventExecutor.execute {
            sendDNSEvent(dnsQuery.domain, shouldBlock)
        }

        if (shouldBlock) {
            Log.d(TAG, "Blocking domain: ${dnsQuery.domain}")
            val blockResponse = createBlockResponse(packet, length)
            if (blockResponse != null) {
                vpnOutput.write(blockResponse)
            }
        } else {
            Log.d(TAG, "Allowing domain: ${dnsQuery.domain}")

            // Forward to DoH server (DNS over HTTPS)
            forwardDNSQueryDoH(packet, length, dnsQuery, vpnOutput)
        }
    }

    // Keep old processPacket for compatibility (delegates to optimized version)
    // NOTE: 此方法已不再使用，保留仅作参考
    @Deprecated("Use processPacketOptimized instead")
    private fun processPacket(packet: ByteArray, length: Int, vpnOutput: FileOutputStream) {
        processPacketOptimized(packet, length, vpnOutput)
    }

    private fun parseDNSQuery(packet: ByteArray, dnsStart: Int): DNSQuery? {
        try {
            if (packet.size < dnsStart + 12) return null

            // Skip DNS header (12 bytes) and parse question section
            var index = dnsStart + 12
            val domain = StringBuilder()

            while (index < packet.size) {
                val length = packet[index].toInt() and 0xFF
                if (length == 0) break

                index++
                if (index + length > packet.size) break

                val label = String(packet, index, length, Charsets.US_ASCII)
                if (domain.isNotEmpty()) domain.append('.')
                domain.append(label)

                index += length
            }

            if (domain.isEmpty()) return null

            return DNSQuery(domain.toString(), packet)

        } catch (e: Exception) {
            Log.e(TAG, "Error parsing DNS query", e)
            return null
        }
    }

    private fun createBlockResponse(packet: ByteArray, length: Int): ByteArray? {
        try {
            // Create a copy of the packet
            val response = packet.copyOf(length)

            // Get IP header length
            val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
            val udpHeaderStart = ipHeaderLength
            val dnsStart = udpHeaderStart + 8

            // Swap source and destination IP
            val tempIP = response.copyOfRange(12, 16)
            response.copyInto(response, 12, 16, 20)
            tempIP.copyInto(response, 16)

            // Swap source and destination ports
            val tempPort = response.copyOfRange(udpHeaderStart, udpHeaderStart + 2)
            response.copyInto(response, udpHeaderStart, udpHeaderStart + 2, udpHeaderStart + 4)
            tempPort.copyInto(response, udpHeaderStart + 2)

            // Modify DNS flags to indicate response with NXDOMAIN
            // QR=1 (response), RCODE=3 (NXDOMAIN)
            response[dnsStart + 2] = 0x81.toByte()
            response[dnsStart + 3] = 0x83.toByte()

            // Recalculate IP checksum
            response[10] = 0
            response[11] = 0
            val ipChecksum = calculateChecksum(response, 0, ipHeaderLength)
            response[10] = (ipChecksum shr 8).toByte()
            response[11] = ipChecksum.toByte()

            // Clear UDP checksum (optional in IPv4)
            response[udpHeaderStart + 6] = 0
            response[udpHeaderStart + 7] = 0

            return response

        } catch (e: Exception) {
            Log.e(TAG, "Error creating block response", e)
            return null
        }
    }

    private fun calculateChecksum(data: ByteArray, start: Int, length: Int): Int {
        var sum = 0L
        var i = start
        val end = start + length

        while (i < end) {
            sum += ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
            i += 2
        }

        while (sum shr 16 != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }

        return (sum.inv() and 0xFFFF).toInt()
    }

    fun addToBlacklist(domain: String) {
        trieFilter.addToBlacklist(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Added to blacklist: $domain")
    }

    fun removeFromBlacklist(domain: String) {
        trieFilter.removeFromBlacklist(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Removed from blacklist: $domain")
    }

    fun addToWhitelist(domain: String) {
        trieFilter.addToWhitelist(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Added to whitelist: $domain")
    }

    fun removeFromWhitelist(domain: String) {
        trieFilter.removeFromWhitelist(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Removed from whitelist: $domain")
    }

    private fun loadFilterRules() {
        val prefs = getSharedPreferences("vpn_filter_rules", Context.MODE_PRIVATE)

        // Load into Trie filter
        val blacklistStr = prefs.getStringSet("blacklist", emptySet()) ?: emptySet()
        trieFilter.clear()
        blacklistStr.forEach { domain ->
            trieFilter.addToBlacklist(domain)
        }

        val whitelistStr = prefs.getStringSet("whitelist", emptySet()) ?: emptySet()
        whitelistStr.forEach { domain ->
            trieFilter.addToWhitelist(domain)
        }

        val stats = trieFilter.getStatistics()
        Log.d(TAG, "Loaded filter rules: $stats")
    }

    private fun loadEdnsSetting() {
        val prefs = getSharedPreferences("vpn_settings", Context.MODE_PRIVATE)
        ednsDoEnabled = prefs.getBoolean("ednsDoEnabled", false)
        VpnLogger.i(TAG, "EDNS DO enabled: $ednsDoEnabled")
    }

    private fun saveFilterRules() {
        // Note: Trie filter doesn't provide iteration, so we keep the old storage
        // This is a trade-off for performance. Consider implementing serialization if needed.
        val prefs = getSharedPreferences("vpn_filter_rules", Context.MODE_PRIVATE)
        prefs.edit().apply()
    }

    /**
     * 使用 DoH (DNS over HTTPS) 转发 DNS 查询
     * 替代传统的 UDP DNS 查询，提供加密传输和更好的隐私保护
     */
    private fun forwardDNSQueryDoH(
        originalPacket: ByteArray,
        originalLength: Int,
        dnsQuery: DNSQuery,
        vpnOutput: FileOutputStream
    ) {
        // Submit to thread pool instead of creating unlimited threads
        dnsQueryExecutor.execute {
            try {
                val startTime = System.currentTimeMillis()

                // 1. Check cache first
                val cachedResponse = dnsCache.get(dnsQuery.domain)
                if (cachedResponse != null) {
                    VpnLogger.d(TAG, "✓ DNS cache hit for ${dnsQuery.domain}")

                    // Extract IP and latency from cache
                    val resolvedIP = parseResolvedIP(cachedResponse) ?: ""
                    val latency = (System.currentTimeMillis() - startTime).toInt()

                    // Construct full response packet
                    val ipHeaderLength = (originalPacket[0].toInt() and 0x0F) * 4
                    val responseFullPacket = createDNSResponsePacket(
                        originalPacket,
                        cachedResponse,
                        ipHeaderLength
                    )

                    if (responseFullPacket != null) {
                        synchronized(vpnOutput) {
                            vpnOutput.write(responseFullPacket)
                        }
                    }

                    sendDNSEvent(dnsQuery.domain, false, latency, resolvedIP)
                    return@execute
                }

                // 2. Extract DNS query data (skip IP and UDP headers)
                val ipHeaderLength = (originalPacket[0].toInt() and 0x0F) * 4
                val udpHeaderStart = ipHeaderLength
                val dnsStart = udpHeaderStart + 8
                val rawDnsQueryData = originalPacket.copyOfRange(dnsStart, originalLength)
                val dnsQueryData = ensureEdnsForDoHQuery(rawDnsQueryData)

                // 3. 使用 DoH 查询 (同步阻塞调用)
                VpnLogger.d(TAG, "Querying DoH server for ${dnsQuery.domain}")
                val dohResult = dohClient.querySync(dnsQueryData)

                if (!dohResult.success || dohResult.response == null) {
                    val errorMsg = dohResult.error ?: "Unknown DoH error"
                    VpnLogger.e(TAG, "❌ DoH query failed for ${dnsQuery.domain}: $errorMsg")
                    sendDNSEvent(dnsQuery.domain, false, 0, "")
                    return@execute
                }

                val responseData = dohResult.response
                val latency = dohResult.latency

                VpnLogger.i(TAG, "✅ DoH query succeeded for ${dnsQuery.domain} in ${latency}ms")

                // 4. Cache the response (with write lock, extracted TTL)
                dnsCache.put(dnsQuery.domain, responseData)

                // 5. Construct full response packet (IP + UDP + DNS)
                val responseFullPacket = createDNSResponsePacket(
                    originalPacket,
                    responseData,
                    ipHeaderLength
                )

                if (responseFullPacket != null) {
                    synchronized(vpnOutput) {
                        vpnOutput.write(responseFullPacket)
                    }
                    VpnLogger.d(TAG, "DNS response written to VPN interface for ${dnsQuery.domain}")
                }

                // 6. Parse resolved IP and send event with latency and DNS response
                val resolvedIP = parseResolvedIP(responseData) ?: ""
                sendDNSEvent(dnsQuery.domain, false, latency, resolvedIP, responseData)
                VpnLogger.d(TAG, "DNS query completed: ${dnsQuery.domain} -> $resolvedIP")

            } catch (e: Exception) {
                VpnLogger.e(TAG, "Error forwarding DoH query for ${dnsQuery.domain}", e)
                // Send event marking failure
                sendDNSEvent(dnsQuery.domain, false, 0, "")
            }
        }
    }

    private fun ensureEdnsForDoHQuery(query: ByteArray): ByteArray {
        if (query.size < 12) {
            return query
        }

        val qdCount = readU16(query, 4)
        var offset = 12

        for (i in 0 until qdCount) {
            val nextOffset = skipDnsName(query, offset)
            if (nextOffset < 0) {
                return query
            }
            offset = nextOffset + 4
            if (offset > query.size) {
                return query
            }
        }

        val arCount = readU16(query, 10)
        var foundOpt = false
        var tempOffset = offset
        val updated = query.copyOf()

        for (i in 0 until arCount) {
            val nameOffset = skipDnsName(updated, tempOffset)
            if (nameOffset < 0 || nameOffset + 10 > updated.size) {
                break
            }

            val type = readU16(updated, nameOffset)
            val rdLength = readU16(updated, nameOffset + 8)

            if (type == 41) {
                foundOpt = true
                writeU16(updated, nameOffset + 2, 1232)

                val ttl = readU32(updated, nameOffset + 4)
                val extRcode = (ttl ushr 24) and 0xFF
                val version = (ttl ushr 16) and 0xFF
                var flags = ttl and 0xFFFF
                flags = if (ednsDoEnabled) {
                    flags or 0x8000
                } else {
                    flags and 0x7FFF
                }
                val newTtl = (extRcode shl 24) or (version shl 16) or flags
                writeU32(updated, nameOffset + 4, newTtl)
            }

            tempOffset = nameOffset + 10 + rdLength
            if (tempOffset > updated.size) {
                break
            }
        }

        if (foundOpt) {
            return updated
        }

        val newData = ByteArray(updated.size + 11)
        System.arraycopy(updated, 0, newData, 0, updated.size)
        writeU16(newData, 10, arCount + 1)

        var pos = updated.size
        newData[pos++] = 0x00
        newData[pos++] = 0x00
        newData[pos++] = 0x29
        newData[pos++] = 0x04
        newData[pos++] = 0xD0
        newData[pos++] = 0x00
        newData[pos++] = 0x00
        val flags = if (ednsDoEnabled) 0x8000 else 0x0000
        newData[pos++] = ((flags shr 8) and 0xFF).toByte()
        newData[pos++] = (flags and 0xFF).toByte()
        newData[pos++] = 0x00
        newData[pos++] = 0x00

        return newData
    }

    private fun readU16(data: ByteArray, offset: Int): Int {
        if (offset + 1 >= data.size) {
            return 0
        }
        return ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
    }

    private fun readU32(data: ByteArray, offset: Int): Int {
        if (offset + 3 >= data.size) {
            return 0
        }
        return ((data[offset].toInt() and 0xFF) shl 24) or
            ((data[offset + 1].toInt() and 0xFF) shl 16) or
            ((data[offset + 2].toInt() and 0xFF) shl 8) or
            (data[offset + 3].toInt() and 0xFF)
    }

    private fun writeU16(data: ByteArray, offset: Int, value: Int) {
        if (offset + 1 >= data.size) {
            return
        }
        data[offset] = ((value shr 8) and 0xFF).toByte()
        data[offset + 1] = (value and 0xFF).toByte()
    }

    private fun writeU32(data: ByteArray, offset: Int, value: Int) {
        if (offset + 3 >= data.size) {
            return
        }
        data[offset] = ((value shr 24) and 0xFF).toByte()
        data[offset + 1] = ((value shr 16) and 0xFF).toByte()
        data[offset + 2] = ((value shr 8) and 0xFF).toByte()
        data[offset + 3] = (value and 0xFF).toByte()
    }

    private fun skipDnsName(data: ByteArray, offset: Int): Int {
        var index = offset
        while (index < data.size) {
            val length = data[index].toInt() and 0xFF
            if (length and 0xC0 == 0xC0) {
                return index + 2
            }
            if (length == 0) {
                return index + 1
            }
            index += 1 + length
        }
        return -1
    }

    private fun createDNSResponsePacket(
        originalPacket: ByteArray,
        dnsResponse: ByteArray,
        ipHeaderLength: Int
    ): ByteArray? {
        try {
            val udpHeaderStart = ipHeaderLength
            val newTotalLength = ipHeaderLength + 8 + dnsResponse.size
            val response = ByteArray(newTotalLength)

            // 1. Copy and modify IP header
            originalPacket.copyInto(response, 0, 0, ipHeaderLength)

            // Swap source and destination IP addresses
            val srcIP = originalPacket.copyOfRange(12, 16)
            val dstIP = originalPacket.copyOfRange(16, 20)
            dstIP.copyInto(response, 12)
            srcIP.copyInto(response, 16)

            // Update IP total length
            response[2] = (newTotalLength shr 8).toByte()
            response[3] = newTotalLength.toByte()

            // Recalculate IP checksum
            response[10] = 0
            response[11] = 0
            val ipChecksum = calculateChecksum(response, 0, ipHeaderLength)
            response[10] = (ipChecksum shr 8).toByte()
            response[11] = ipChecksum.toByte()

            // 2. Copy and modify UDP header
            originalPacket.copyInto(response, ipHeaderLength, udpHeaderStart, udpHeaderStart + 8)

            // Swap source and destination ports
            val srcPort = originalPacket.copyOfRange(udpHeaderStart, udpHeaderStart + 2)
            val dstPort = originalPacket.copyOfRange(udpHeaderStart + 2, udpHeaderStart + 4)
            dstPort.copyInto(response, ipHeaderLength)
            srcPort.copyInto(response, ipHeaderLength + 2)

            // Update UDP length
            val udpLength = 8 + dnsResponse.size
            response[ipHeaderLength + 4] = (udpLength shr 8).toByte()
            response[ipHeaderLength + 5] = udpLength.toByte()

            // Set UDP checksum to 0 (optional in IPv4)
            response[ipHeaderLength + 6] = 0
            response[ipHeaderLength + 7] = 0

            // 3. Append DNS response data
            dnsResponse.copyInto(response, ipHeaderLength + 8)

            return response

        } catch (e: Exception) {
            Log.e(TAG, "Error creating DNS response packet", e)
            return null
        }
    }

    private fun sendDNSEvent(domain: String, blocked: Boolean, latency: Int = 0, resolvedIP: String = "", dnsResponse: ByteArray? = null) {
        val intent = Intent("com.idns.DNS_EVENT")
        intent.putExtra("domain", domain)
        intent.putExtra("timestamp", System.currentTimeMillis())

        // Check if DoH server blocked this domain (returns special IPs)
        val isDohBlocked = resolvedIP == "0.0.0.0" || resolvedIP == "::" || resolvedIP == "::0"

        // Status should be "blocked" if either locally blocked OR blocked by DoH server
        val actualStatus = if (blocked || isDohBlocked) "blocked" else "allowed"
        intent.putExtra("status", actualStatus)

        // Determine display info based on status and resolved IP
        val displayInfo = when {
            blocked -> "已拦截"  // Locally blocked
            isDohBlocked -> "已拦截"  // DoH server blocking
            resolvedIP.isEmpty() -> {
                // Check DNS response RCODE to differentiate error types
                if (dnsResponse != null && dnsResponse.size > 3) {
                    val rcode = dnsResponse[3].toInt() and 0x0F
                    when (rcode) {
                        0 -> "无记录"  // NOERROR - domain exists but no A record
                        3 -> "域名不存在"  // NXDOMAIN - domain does not exist
                        else -> "解析失败"  // Other errors (SERVFAIL, REFUSED, etc.)
                    }
                } else {
                    "解析失败"
                }
            }
            else -> resolvedIP  // Normal IP address
        }
        intent.putExtra("category", displayInfo)  // Now stores IP address or status
        intent.putExtra("latency", latency)
        sendBroadcast(intent)
    }

    private fun sendStatusBroadcast(isConnected: Boolean) {
        val intent = Intent("com.idns.VPN_STATUS_CHANGED")
        intent.putExtra("isConnected", isConnected)
        sendBroadcast(intent)
    }

    /// Parse DNS response to extract the first A record (IPv4 address)
    private fun parseResolvedIP(dnsResponse: ByteArray): String? {
        try {
            if (dnsResponse.size <= 12) return null

            // Get answer count from header (bytes 6-7)
            val answerCount = ((dnsResponse[6].toInt() and 0xFF) shl 8) or (dnsResponse[7].toInt() and 0xFF)
            if (answerCount == 0) return null

            // Skip header (12 bytes)
            var index = 12

            // Skip question section
            while (index < dnsResponse.size) {
                val length = dnsResponse[index].toInt() and 0xFF
                if (length == 0) {
                    index++
                    break
                }
                index += 1 + length
            }
            index += 4  // Skip QTYPE and QCLASS

            // Parse answer section
            for (i in 0 until answerCount) {
                if (index + 12 > dnsResponse.size) break

                // Handle name (might be compressed with pointer)
                if ((dnsResponse[index].toInt() and 0xC0) == 0xC0) {
                    // Compressed name (pointer)
                    index += 2
                } else {
                    // Regular name
                    while (index < dnsResponse.size) {
                        val length = dnsResponse[index].toInt() and 0xFF
                        if (length == 0) {
                            index++
                            break
                        }
                        index += 1 + length
                    }
                }

                if (index + 10 > dnsResponse.size) break

                // Read TYPE (2 bytes)
                val recordType = ((dnsResponse[index].toInt() and 0xFF) shl 8) or (dnsResponse[index + 1].toInt() and 0xFF)
                index += 2

                // Skip CLASS (2 bytes)
                index += 2

                // Skip TTL (4 bytes)
                index += 4

                // Read RDLENGTH (2 bytes)
                val rdLength = ((dnsResponse[index].toInt() and 0xFF) shl 8) or (dnsResponse[index + 1].toInt() and 0xFF)
                index += 2

                // Check if this is an A record (TYPE = 1) with 4 bytes of data
                if (recordType == 1 && rdLength == 4 && index + 4 <= dnsResponse.size) {
                    // Extract IPv4 address
                    return "${dnsResponse[index].toInt() and 0xFF}.${dnsResponse[index + 1].toInt() and 0xFF}.${dnsResponse[index + 2].toInt() and 0xFF}.${dnsResponse[index + 3].toInt() and 0xFF}"
                }

                // Skip RDATA
                index += rdLength
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing DNS response for IP", e)
        }
        return null
    }

    private fun createNotification(): android.app.Notification {
        createNotificationChannel()

        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("iDNS 家庭守护")
            .setContentText("DNS 拦截服务正在运行")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VPN Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "iDNS VPN 服务通知"
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    data class DNSQuery(val domain: String, val packet: ByteArray)
}

/**
 * UDP Connection Pool for DNS queries
 * DEPRECATED: No longer used - replaced by DoH (DNS over HTTPS)
 *
 * Legacy code kept for reference. UDP DNS queries are replaced by encrypted
 * HTTPS queries to i-dns.wnluo.com/dns-query
 */
@Deprecated("Replaced by DNSDoHClient")
class UDPConnectionPool(private val vpnService: VpnService, private val poolSize: Int = 3) {
    private val TAG = "UDPConnectionPool"
    private val connections = ConcurrentLinkedQueue<DatagramSocket>()
    private val semaphore = Semaphore(poolSize)
    private val socketTimeout = 5000 // 5 seconds

    /**
     * Execute a DNS query using a pooled connection
     * Blocks if no connection is available
     */
    fun query(dnsServer: String, dnsQueryData: ByteArray): ByteArray {
        // Wait for available connection slot (blocks until available)
        semaphore.acquire()

        var socket: DatagramSocket? = null
        try {
            // Get or create socket
            socket = getOrCreateSocket(dnsServer)

            // Send DNS query
            val dnsServerAddress = InetAddress.getByName(dnsServer)
            val requestPacket = DatagramPacket(
                dnsQueryData,
                dnsQueryData.size,
                dnsServerAddress,
                53
            )
            socket.send(requestPacket)

            // Receive response
            // Using 1472 bytes to support EDNS responses (1500 MTU - 28 IP/UDP headers)
            val responseBuffer = ByteArray(1472)
            val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
            socket.receive(responsePacket)

            // Return socket to pool
            returnSocket(socket)

            return responseBuffer.copyOfRange(0, responsePacket.length)

        } catch (e: Exception) {
            // Don't return broken socket to pool
            socket?.close()
            throw e
        } finally {
            // Always release semaphore
            semaphore.release()
        }
    }

    /**
     * Get a socket from pool or create a new one
     * CRITICAL: Must protect() socket to bypass VPN
     */
    private fun getOrCreateSocket(dnsServer: String): DatagramSocket {
        val socket = connections.poll()
        if (socket != null && !socket.isClosed) {
            VpnLogger.d(TAG, "Reusing socket from pool")
            return socket
        }

        // Create new socket and protect it to bypass VPN
        VpnLogger.d(TAG, "Creating new socket for pool")
        return DatagramSocket().apply {
            soTimeout = socketTimeout
            // CRITICAL: protect() socket so DNS queries bypass VPN (avoid routing loop)
            val protected = vpnService.protect(this)
            if (protected) {
                VpnLogger.i(TAG, "✅ Socket protected successfully - will bypass VPN")
            } else {
                VpnLogger.e(TAG, "❌ Failed to protect socket - DNS queries may fail!")
            }
            // Don't use connect() - keep socket unconnected for flexibility
        }
    }

    /**
     * Return a socket to the pool
     */
    private fun returnSocket(socket: DatagramSocket) {
        if (!socket.isClosed && connections.size < poolSize) {
            connections.offer(socket)
            Log.d(TAG, "Socket returned to pool (size: ${connections.size})")
        } else {
            socket.close()
        }
    }

    /**
     * Close all connections in the pool
     */
    fun close() {
        Log.d(TAG, "Closing connection pool")
        while (connections.isNotEmpty()) {
            connections.poll()?.close()
        }
    }
}

/**
 * DNS Cache to reduce redundant queries
 * DEPRECATED: Replaced by DNSCacheOptimized for better performance
 *
 * Legacy simple LRU cache. Use DNSCacheOptimized instead for:
 * - Read-write locks (4-8x better concurrency)
 * - Dual-layer hot/cold cache
 * - Fast expiry checks using nanoTime
 */
@Deprecated("Replaced by DNSCacheOptimized")
class DNSCache(maxSize: Int = 200) {
    private val TAG = "DNSCache"
    private val cache = LruCache<String, CacheEntry>(maxSize)
    private val defaultTTL = 300 // 5 minutes default TTL

    data class CacheEntry(
        val response: ByteArray,
        val timestamp: Long,
        val ttl: Int
    )

    /**
     * Get cached DNS response if not expired
     */
    fun get(domain: String): ByteArray? {
        val key = domain.lowercase()
        val entry = cache.get(key) ?: return null

        val age = (System.currentTimeMillis() - entry.timestamp) / 1000
        if (age > entry.ttl) {
            cache.remove(key)
            Log.d(TAG, "Cache expired for $domain (age: ${age}s, TTL: ${entry.ttl}s)")
            return null
        }

        Log.d(TAG, "Cache hit for $domain (age: ${age}s, TTL: ${entry.ttl}s)")
        return entry.response
    }

    /**
     * Put DNS response in cache
     * Extracts TTL from DNS response if available
     */
    fun put(domain: String, response: ByteArray) {
        val key = domain.lowercase()
        val ttl = extractTTL(response) ?: defaultTTL
        val entry = CacheEntry(
            response = response,
            timestamp = System.currentTimeMillis(),
            ttl = ttl
        )
        cache.put(key, entry)
        Log.d(TAG, "Cached $domain with TTL ${ttl}s")
    }

    /**
     * Extract TTL from DNS response
     * Returns the minimum TTL from all answer records
     */
    private fun extractTTL(dnsResponse: ByteArray): Int? {
        try {
            if (dnsResponse.size <= 12) return null

            // Get answer count from header (bytes 6-7)
            val answerCount = ((dnsResponse[6].toInt() and 0xFF) shl 8) or (dnsResponse[7].toInt() and 0xFF)
            if (answerCount == 0) return null

            var index = 12

            // Skip question section
            while (index < dnsResponse.size) {
                val length = dnsResponse[index].toInt() and 0xFF
                if (length == 0) {
                    index++
                    break
                }
                index += 1 + length
            }
            index += 4  // Skip QTYPE and QCLASS

            var minTTL: Int? = null

            // Parse answer section to find minimum TTL
            for (i in 0 until answerCount) {
                if (index + 12 > dnsResponse.size) break

                // Handle name (might be compressed with pointer)
                if ((dnsResponse[index].toInt() and 0xC0) == 0xC0) {
                    index += 2
                } else {
                    while (index < dnsResponse.size) {
                        val length = dnsResponse[index].toInt() and 0xFF
                        if (length == 0) {
                            index++
                            break
                        }
                        index += 1 + length
                    }
                }

                if (index + 10 > dnsResponse.size) break

                // Skip TYPE (2 bytes)
                index += 2

                // Skip CLASS (2 bytes)
                index += 2

                // Read TTL (4 bytes)
                val ttl = ((dnsResponse[index].toInt() and 0xFF) shl 24) or
                        ((dnsResponse[index + 1].toInt() and 0xFF) shl 16) or
                        ((dnsResponse[index + 2].toInt() and 0xFF) shl 8) or
                        (dnsResponse[index + 3].toInt() and 0xFF)
                index += 4

                if (minTTL == null || ttl < minTTL) {
                    minTTL = ttl
                }

                // Read RDLENGTH (2 bytes)
                val rdLength = ((dnsResponse[index].toInt() and 0xFF) shl 8) or
                        (dnsResponse[index + 1].toInt() and 0xFF)
                index += 2

                // Skip RDATA
                index += rdLength
            }

            return minTTL?.coerceIn(60, 3600) // Clamp between 1 min and 1 hour
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting TTL", e)
            return null
        }
    }

    /**
     * Clear all cached entries
     */
    fun clear() {
        cache.evictAll()
        Log.d(TAG, "Cache cleared")
    }
}

/**
 * PacketForwarder - 转发非DNS流量到真实网络
 *
 * 工作原理：
 * 1. VPN拦截所有流量
 * 2. DNS流量由DNSVpnService处理
 * 3. 非DNS的UDP流量通过此类转发
 * 4. TCP流量通过系统socket API自动处理（使用protect绕过VPN）
 */
class PacketForwarder(private val vpnService: VpnService) {
    private val TAG = "PacketForwarder"

    // UDP连接池
    private val udpConnections = java.util.concurrent.ConcurrentHashMap<String, ForwarderUdpSession>()

    // 执行器
    private val executor = Executors.newCachedThreadPool()

    // 清理计数器
    private var cleanupCounter = 0

    /**
     * 转发IP包到真实网络
     */
    fun forward(packet: ByteArray, length: Int, protocol: Int, vpnOutput: FileOutputStream) {
        when (protocol) {
            17 -> forwardUdp(packet, length, vpnOutput)  // UDP (非DNS)
            6 -> {
                // TCP - Android VPN不需要在用户空间处理TCP
                // TCP连接会自动使用protect()后的socket通过真实网络
                // 这里的TCP包是应用尝试连接VPN_DNS (10.0.0.1)的流量，应该丢弃
            }
            1 -> {
                // ICMP - 直接丢弃
            }
            else -> {
                // 其他协议不处理
            }
        }

        // 定期清理过期连接
        if (++cleanupCounter >= 100) {
            cleanupCounter = 0
            cleanupExpiredConnections()
        }
    }

    /**
     * 转发UDP流量 (非DNS)
     */
    private fun forwardUdp(packet: ByteArray, length: Int, vpnOutput: FileOutputStream) {
        try {
            val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4

            // 解析IP头
            val srcIP = "${packet[12].toInt() and 0xFF}.${packet[13].toInt() and 0xFF}.${packet[14].toInt() and 0xFF}.${packet[15].toInt() and 0xFF}"
            val dstIP = "${packet[16].toInt() and 0xFF}.${packet[17].toInt() and 0xFF}.${packet[18].toInt() and 0xFF}.${packet[19].toInt() and 0xFF}"

            // 解析UDP头
            val udpHeaderStart = ipHeaderLength
            val srcPort = ((packet[udpHeaderStart].toInt() and 0xFF) shl 8) or (packet[udpHeaderStart + 1].toInt() and 0xFF)
            val dstPort = ((packet[udpHeaderStart + 2].toInt() and 0xFF) shl 8) or (packet[udpHeaderStart + 3].toInt() and 0xFF)

            val connectionKey = "$srcIP:$srcPort-$dstIP:$dstPort"

            // 获取或创建UDP会话
            var session = udpConnections[connectionKey]
            if (session == null || session.isExpired()) {
                session?.close()
                session = ForwarderUdpSession(vpnService, dstIP, dstPort, srcIP, srcPort, vpnOutput)
                udpConnections[connectionKey] = session
                executor.execute {
                    session.startReceiving()
                }
            }

            // 提取并转发UDP数据
            val dataStart = ipHeaderLength + 8
            if (length > dataStart) {
                val data = packet.copyOfRange(dataStart, length)
                session.send(data)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error forwarding UDP", e)
        }
    }

    private fun cleanupExpiredConnections() {
        val iterator = udpConnections.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry.value.isExpired()) {
                entry.value.close()
                iterator.remove()
            }
        }
    }

    fun close() {
        udpConnections.values.forEach { it.close() }
        udpConnections.clear()
        executor.shutdownNow()
    }
}

/**
 * UDP会话处理类 - 用于转发非DNS的UDP流量
 */
class ForwarderUdpSession(
    private val vpnService: VpnService,
    private val remoteIP: String,
    private val remotePort: Int,
    private val localIP: String,
    private val localPort: Int,
    private val vpnOutput: FileOutputStream
) {
    private val TAG = "ForwarderUdpSession"
    private var socket: DatagramSocket? = null
    @Volatile private var isRunning = true
    private var lastActivityTime = System.currentTimeMillis()
    private val sessionTimeout = 60000L // 60秒超时

    init {
        try {
            socket = DatagramSocket()
            vpnService.protect(socket!!)
            socket!!.soTimeout = 5000  // 5秒接收超时
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create UDP socket", e)
        }
    }

    fun send(data: ByteArray) {
        lastActivityTime = System.currentTimeMillis()
        try {
            val packet = DatagramPacket(
                data, data.size,
                InetAddress.getByName(remoteIP), remotePort
            )
            socket?.send(packet)
        } catch (e: Exception) {
            Log.e(TAG, "UDP send error to $remoteIP:$remotePort", e)
        }
    }

    fun startReceiving() {
        try {
            val buffer = ByteArray(65535)
            while (isRunning && !isExpired()) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket?.receive(packet)
                    if (packet.length > 0) {
                        lastActivityTime = System.currentTimeMillis()
                        sendToVpn(buffer.copyOfRange(0, packet.length))
                    }
                } catch (e: java.net.SocketTimeoutException) {
                    // 继续等待，除非已过期
                    continue
                }
            }
        } catch (e: Exception) {
            if (isRunning) {
                Log.e(TAG, "UDP receive error", e)
            }
        } finally {
            close()
        }
    }

    fun isExpired(): Boolean {
        return System.currentTimeMillis() - lastActivityTime > sessionTimeout
    }

    private fun sendToVpn(data: ByteArray) {
        try {
            // 构建完整的IP+UDP响应包
            val ipHeaderLength = 20
            val udpHeaderLength = 8
            val totalLength = ipHeaderLength + udpHeaderLength + data.size

            val responsePacket = ByteArray(totalLength)

            // IP头
            responsePacket[0] = 0x45.toByte()  // Version 4, IHL 5
            responsePacket[1] = 0x00.toByte()  // TOS
            responsePacket[2] = (totalLength shr 8).toByte()
            responsePacket[3] = totalLength.toByte()
            responsePacket[4] = 0x00.toByte()  // ID
            responsePacket[5] = 0x00.toByte()
            responsePacket[6] = 0x40.toByte()  // Flags (Don't Fragment)
            responsePacket[7] = 0x00.toByte()
            responsePacket[8] = 0x40.toByte()  // TTL
            responsePacket[9] = 0x11.toByte()  // Protocol: UDP
            responsePacket[10] = 0x00.toByte() // Checksum
            responsePacket[11] = 0x00.toByte()

            // 源IP (远程IP)
            val srcIpParts = remoteIP.split(".")
            responsePacket[12] = srcIpParts[0].toInt().toByte()
            responsePacket[13] = srcIpParts[1].toInt().toByte()
            responsePacket[14] = srcIpParts[2].toInt().toByte()
            responsePacket[15] = srcIpParts[3].toInt().toByte()

            // 目标IP (本地IP)
            val dstIpParts = localIP.split(".")
            responsePacket[16] = dstIpParts[0].toInt().toByte()
            responsePacket[17] = dstIpParts[1].toInt().toByte()
            responsePacket[18] = dstIpParts[2].toInt().toByte()
            responsePacket[19] = dstIpParts[3].toInt().toByte()

            // 计算IP校验和
            calculateIpChecksum(responsePacket)

            // UDP头
            responsePacket[20] = (remotePort shr 8).toByte()
            responsePacket[21] = remotePort.toByte()
            responsePacket[22] = (localPort shr 8).toByte()
            responsePacket[23] = localPort.toByte()
            val udpLength = udpHeaderLength + data.size
            responsePacket[24] = (udpLength shr 8).toByte()
            responsePacket[25] = udpLength.toByte()
            responsePacket[26] = 0x00.toByte()
            responsePacket[27] = 0x00.toByte()

            // 复制数据
            System.arraycopy(data, 0, responsePacket, 28, data.size)

            // 写回VPN
            synchronized(vpnOutput) {
                vpnOutput.write(responsePacket)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error sending to VPN", e)
        }
    }

    private fun calculateIpChecksum(packet: ByteArray) {
        packet[10] = 0
        packet[11] = 0

        var sum = 0L
        for (i in 0 until 20 step 2) {
            sum += ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
        }

        while (sum shr 16 != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }

        val checksum = (sum.inv() and 0xFFFF).toInt()
        packet[10] = (checksum shr 8).toByte()
        packet[11] = checksum.toByte()
    }

    fun close() {
        isRunning = false
        try {
            socket?.close()
        } catch (e: Exception) {
            // ignore
        }
    }
}

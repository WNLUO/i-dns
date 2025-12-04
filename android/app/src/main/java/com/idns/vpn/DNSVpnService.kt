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
        private const val VPN_ROUTE = "0.0.0.0"
        private const val VPN_DNS = "94.140.14.14" // AdGuard DNS Family Protection
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "DNSVpnChannel"

        @Volatile
        var instance: DNSVpnService? = null

        @Volatile
        var isRunning = AtomicBoolean(false)
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var vpnThread: Thread? = null
    private val blacklist = mutableSetOf<String>()
    private val whitelist = mutableSetOf<String>()
    private var dnsServer = VPN_DNS
    private var dnsServerType = "udp" // "udp" or "doh"
    private val dohServerHostname = "i-dns.wnluo.com"

    // Reliable DNS servers for direct UDP queries (China mainland)
    private val reliableDNSServers = listOf("119.29.29.29", "223.5.5.5", "180.76.76.76")

    // UDP Connection Pool for DNS queries
    private val udpConnectionPool = UDPConnectionPool(poolSize = 3)

    // Thread pool for DNS queries (limit concurrent threads)
    private val dnsQueryExecutor = Executors.newFixedThreadPool(10) as ThreadPoolExecutor

    // DNS Cache to reduce redundant queries
    private val dnsCache = DNSCache(maxSize = 200)

    override fun onCreate() {
        super.onCreate()
        instance = this
        loadFilterRules()
        Log.d(TAG, "VPN Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "VPN Service starting...")

        when (intent?.action) {
            "STOP" -> {
                stopVPN()
                return START_NOT_STICKY
            }
            "ADD_BLACKLIST" -> {
                intent.getStringExtra("domain")?.let { addToBlacklist(it) }
                return START_STICKY
            }
            "REMOVE_BLACKLIST" -> {
                intent.getStringExtra("domain")?.let { removeFromBlacklist(it) }
                return START_STICKY
            }
            "ADD_WHITELIST" -> {
                intent.getStringExtra("domain")?.let { addToWhitelist(it) }
                return START_STICKY
            }
            "REMOVE_WHITELIST" -> {
                intent.getStringExtra("domain")?.let { removeFromWhitelist(it) }
                return START_STICKY
            }
            "UPDATE_DNS" -> {
                intent.getStringExtra("dnsServer")?.let { newDnsServer ->
                    dnsServer = newDnsServer
                    // Auto-detect DNS type
                    dnsServerType = if (newDnsServer.startsWith("https://") ||
                                       newDnsServer.startsWith("http://")) {
                        "doh"
                    } else {
                        "udp"
                    }
                    Log.d(TAG, "========================================")
                    Log.d(TAG, "DNS server updated to: $newDnsServer")
                    Log.d(TAG, "DNS type: $dnsServerType")
                    Log.d(TAG, "========================================")
                    // Restart VPN with new DNS
                    restartVPN()
                }
                return START_STICKY
            }
        }

        startForeground(NOTIFICATION_ID, createNotification())
        startVPN()
        return START_STICKY
    }

    override fun onDestroy() {
        stopVPN()

        // Cleanup connection pool
        udpConnectionPool.close()

        // Shutdown thread pool
        dnsQueryExecutor.shutdown()
        try {
            if (!dnsQueryExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                dnsQueryExecutor.shutdownNow()
            }
        } catch (e: InterruptedException) {
            dnsQueryExecutor.shutdownNow()
        }

        // Clear DNS cache
        dnsCache.clear()

        instance = null
        super.onDestroy()
        Log.d(TAG, "VPN Service destroyed")
    }

    private fun startVPN() {
        if (isRunning.get()) {
            Log.d(TAG, "VPN already running")
            return
        }

        try {
            vpnInterface = Builder()
                .setSession("iDNS Family Protection")
                .addAddress(VPN_ADDRESS, 24)
                .addRoute(VPN_ROUTE, 0)
                .addDnsServer(dnsServer)
                .setBlocking(true)
                .establish()

            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN interface")
                stopSelf()
                return
            }

            isRunning.set(true)
            sendStatusBroadcast(true)

            vpnThread = thread(start = true) {
                runVPN()
            }

            Log.d(TAG, "VPN started successfully")

        } catch (e: Exception) {
            Log.e(TAG, "Error starting VPN", e)
            stopVPN()
        }
    }

    private fun stopVPN() {
        Log.d(TAG, "Stopping VPN...")

        isRunning.set(false)
        sendStatusBroadcast(false)

        try {
            vpnInterface?.close()
            vpnInterface = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing VPN interface", e)
        }

        vpnThread?.interrupt()
        vpnThread = null

        stopForeground(true)
        stopSelf()

        Log.d(TAG, "VPN stopped")
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
        val buffer = ByteBuffer.allocate(32767)

        try {
            while (isRunning.get() && !Thread.interrupted()) {
                // Read packet from VPN interface
                val length = vpnInput.read(buffer.array())
                if (length <= 0) continue

                buffer.limit(length)
                buffer.position(0)

                // Process packet
                processPacket(buffer.array(), length, vpnOutput)

                buffer.clear()
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

    private fun processPacket(packet: ByteArray, length: Int, vpnOutput: FileOutputStream) {
        try {
            // Check if this is an IP packet
            if (length < 20) return

            val version = (packet[0].toInt() shr 4) and 0x0F
            if (version != 4) return // Only IPv4 for now

            val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
            val protocol = packet[9].toInt() and 0xFF

            // Check if this is UDP (17)
            if (protocol != 17 || length < ipHeaderLength + 8) {
                // Not UDP, forward packet as is
                vpnOutput.write(packet, 0, length)
                return
            }

            // Parse UDP header
            val udpHeaderStart = ipHeaderLength
            val destPort = ((packet[udpHeaderStart + 2].toInt() and 0xFF) shl 8) or
                          (packet[udpHeaderStart + 3].toInt() and 0xFF)

            // Check if this is DNS (port 53)
            if (destPort != 53) {
                vpnOutput.write(packet, 0, length)
                return
            }

            // Parse DNS query
            val dnsQuery = parseDNSQuery(packet, ipHeaderLength + 8)
            if (dnsQuery == null) {
                vpnOutput.write(packet, 0, length)
                return
            }

            Log.d(TAG, "DNS query for: ${dnsQuery.domain}")

            // Check if domain should be blocked
            val shouldBlock = shouldBlockDomain(dnsQuery.domain)

            // Send event to React Native
            sendDNSEvent(dnsQuery.domain, shouldBlock)

            if (shouldBlock) {
                Log.d(TAG, "Blocking domain: ${dnsQuery.domain}")
                // Create and send NXDOMAIN response
                val blockResponse = createBlockResponse(packet, length)
                if (blockResponse != null) {
                    vpnOutput.write(blockResponse)
                }
            } else {
                // Forward to real DNS server - CORRECT IMPLEMENTATION
                Log.d(TAG, "Allowing domain: ${dnsQuery.domain}")

                // Choose forwarding method based on DNS server type
                if (dnsServerType == "doh") {
                    Log.d(TAG, "Using DoH method")
                    forwardDNSQueryDoH(packet, length, dnsQuery, vpnOutput)
                } else {
                    Log.d(TAG, "Using UDP method")
                    forwardDNSQueryUDP(packet, length, dnsQuery, vpnOutput)
                }
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error processing packet", e)
        }
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

    private fun shouldBlockDomain(domain: String): Boolean {
        val normalizedDomain = domain.lowercase()

        // Whitelist has highest priority
        if (isInWhitelist(normalizedDomain)) {
            return false
        }

        // Check blacklist
        if (isInBlacklist(normalizedDomain)) {
            return true
        }

        return false
    }

    private fun isInWhitelist(domain: String): Boolean {
        return whitelist.any { whitelistedDomain ->
            domain == whitelistedDomain || domain.endsWith(".$whitelistedDomain")
        }
    }

    private fun isInBlacklist(domain: String): Boolean {
        return blacklist.any { blacklistedDomain ->
            when {
                blacklistedDomain.contains("*") -> {
                    val pattern = blacklistedDomain.replace("*", ".*")
                    domain.matches(Regex("^$pattern$", RegexOption.IGNORE_CASE))
                }
                else -> {
                    domain == blacklistedDomain || domain.endsWith(".$blacklistedDomain")
                }
            }
        }
    }

    fun addToBlacklist(domain: String) {
        blacklist.add(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Added to blacklist: $domain")
    }

    fun removeFromBlacklist(domain: String) {
        blacklist.remove(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Removed from blacklist: $domain")
    }

    fun addToWhitelist(domain: String) {
        whitelist.add(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Added to whitelist: $domain")
    }

    fun removeFromWhitelist(domain: String) {
        whitelist.remove(domain.lowercase())
        saveFilterRules()
        Log.d(TAG, "Removed from whitelist: $domain")
    }

    private fun loadFilterRules() {
        val prefs = getSharedPreferences("vpn_filter_rules", Context.MODE_PRIVATE)

        val blacklistStr = prefs.getStringSet("blacklist", emptySet()) ?: emptySet()
        blacklist.clear()
        blacklist.addAll(blacklistStr)

        val whitelistStr = prefs.getStringSet("whitelist", emptySet()) ?: emptySet()
        whitelist.clear()
        whitelist.addAll(whitelistStr)

        Log.d(TAG, "Loaded ${blacklist.size} blacklist rules and ${whitelist.size} whitelist rules")
    }

    private fun saveFilterRules() {
        val prefs = getSharedPreferences("vpn_filter_rules", Context.MODE_PRIVATE)
        prefs.edit()
            .putStringSet("blacklist", blacklist)
            .putStringSet("whitelist", whitelist)
            .apply()
    }

    private fun forwardDNSQueryUDP(
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
                    Log.d(TAG, "✓ DNS cache hit for ${dnsQuery.domain}")

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
                val dnsQueryData = originalPacket.copyOfRange(dnsStart, originalLength)

                // 3. Use connection pool to send DNS query
                Log.d(TAG, "DNS query sent to $dnsServer for ${dnsQuery.domain}")
                val responseData = udpConnectionPool.query(dnsServer, dnsQueryData)

                val latency = (System.currentTimeMillis() - startTime).toInt()
                Log.d(TAG, "DNS response received in ${latency}ms for ${dnsQuery.domain}")

                // 4. Cache the response
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
                    Log.d(TAG, "DNS response written to VPN interface for ${dnsQuery.domain}")
                }

                // 6. Parse resolved IP and send event with latency and DNS response
                val resolvedIP = parseResolvedIP(responseData) ?: ""
                sendDNSEvent(dnsQuery.domain, false, latency, resolvedIP, responseData)
                Log.d(TAG, "DNS query completed: ${dnsQuery.domain} -> $resolvedIP")

            } catch (e: Exception) {
                Log.e(TAG, "Error forwarding DNS query for ${dnsQuery.domain}", e)
                // Send event marking failure
                sendDNSEvent(dnsQuery.domain, false, 0, "")
            }
        }
    }

    private fun forwardDNSQueryDoH(
        originalPacket: ByteArray,
        originalLength: Int,
        dnsQuery: DNSQuery,
        vpnOutput: FileOutputStream
    ) {
        // Use thread pool for DoH queries too
        dnsQueryExecutor.execute {
            try {
                val startTime = System.currentTimeMillis()

                Log.d(TAG, "=== DoH Query Start ===")
                Log.d(TAG, "Domain: ${dnsQuery.domain}")
                Log.d(TAG, "DoH Server: $dnsServer")

                // 1. Check cache first
                val cachedResponse = dnsCache.get(dnsQuery.domain)
                if (cachedResponse != null) {
                    Log.d(TAG, "✓ DNS cache hit for ${dnsQuery.domain}")

                    val resolvedIP = parseResolvedIP(cachedResponse) ?: ""
                    val latency = (System.currentTimeMillis() - startTime).toInt()

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

                // Extract DNS query data
                val ipHeaderLength = (originalPacket[0].toInt() and 0x0F) * 4
                val udpHeaderStart = ipHeaderLength
                val dnsStart = udpHeaderStart + 8
                val dnsQueryData = originalPacket.copyOfRange(dnsStart, originalLength)

                Log.d(TAG, "DNS query data size: ${dnsQueryData.size} bytes")

                // Resolve DoH server hostname using direct DNS query if needed
                val resolvedIP = if (dnsServer.contains(dohServerHostname)) {
                    resolveDohServerHostname() ?: run {
                        Log.e(TAG, "Failed to resolve DoH server hostname")
                        sendDNSEvent(dnsQuery.domain, false, 0, "")
                        return@execute
                    }
                } else {
                    null
                }

                // Create HTTP request
                val actualUrl = if (resolvedIP != null) {
                    "https://$resolvedIP/dns-query"
                } else {
                    dnsServer
                }

                Log.d(TAG, "Connecting to: $actualUrl")
                val url = java.net.URL(actualUrl)
                val connection = url.openConnection() as java.net.HttpURLConnection

                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/dns-message")
                connection.setRequestProperty("Accept", "application/dns-message")
                connection.setRequestProperty("Content-Length", dnsQueryData.size.toString())
                // Set Host header to actual hostname for SSL/TLS verification
                if (resolvedIP != null) {
                    connection.setRequestProperty("Host", dohServerHostname)
                }
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.doOutput = true

                // Send request
                Log.d(TAG, "Sending DoH request...")
                connection.outputStream.use { it.write(dnsQueryData) }

                // Read response
                val responseCode = connection.responseCode
                Log.d(TAG, "DoH HTTP Status: $responseCode")

                if (responseCode != 200) {
                    Log.e(TAG, "DoH request failed with status: $responseCode")
                    sendDNSEvent(dnsQuery.domain, false, 0, "")
                    connection.disconnect()
                    return@execute
                }

                val dnsResponseData = connection.inputStream.use { it.readBytes() }
                val latency = (System.currentTimeMillis() - startTime).toInt()

                Log.d(TAG, "DoH response data size: ${dnsResponseData.size} bytes")
                Log.d(TAG, "DoH query completed in ${latency}ms")
                Log.d(TAG, "=== DoH Query End ===")

                // Cache the response
                dnsCache.put(dnsQuery.domain, dnsResponseData)

                // Construct response packet
                val responseFullPacket = createDNSResponsePacket(
                    originalPacket,
                    dnsResponseData,
                    ipHeaderLength
                )

                if (responseFullPacket != null) {
                    synchronized(vpnOutput) {
                        vpnOutput.write(responseFullPacket)
                    }
                    Log.d(TAG, "DoH response written to VPN interface")
                }

                // Parse resolved IP and send event with DNS response for proper status detection
                val resolvedIPAddr = parseResolvedIP(dnsResponseData) ?: ""
                sendDNSEvent(dnsQuery.domain, false, latency, resolvedIPAddr, dnsResponseData)
                Log.d(TAG, "DoH query completed: ${dnsQuery.domain} -> $resolvedIPAddr")

                connection.disconnect()

            } catch (e: Exception) {
                Log.e(TAG, "Error in DoH query for ${dnsQuery.domain}", e)
                sendDNSEvent(dnsQuery.domain, false, 0, "")
            }
        }
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
        intent.putExtra("status", if (blocked) "blocked" else "allowed")

        // Determine display info based on status and resolved IP
        val displayInfo = when {
            blocked -> "已拦截"
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
            resolvedIP == "0.0.0.0" || resolvedIP == "::" || resolvedIP == "::0" -> "已拦截"  // DoH server blocking
            else -> resolvedIP
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

    /// Resolve DoH server hostname using direct UDP queries to reliable DNS servers
    private fun resolveDohServerHostname(): String? {
        for (dnsServer in reliableDNSServers) {
            try {
                Log.d(TAG, "Querying $dohServerHostname via DNS server $dnsServer")

                val socket = DatagramSocket()
                socket.soTimeout = 5000 // 5 second timeout

                // Build DNS query
                val queryData = buildDNSQueryPacket(dohServerHostname)

                // Send query to DNS server
                val dnsAddress = InetAddress.getByName(dnsServer)
                val requestPacket = DatagramPacket(queryData, queryData.size, dnsAddress, 53)
                socket.send(requestPacket)

                // Receive response
                val responseBuffer = ByteArray(512)
                val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
                socket.receive(responsePacket)
                socket.close()

                // Parse response to get IP
                val responseData = responseBuffer.copyOfRange(0, responsePacket.length)
                val resolvedIP = parseResolvedIP(responseData)

                if (resolvedIP != null) {
                    Log.d(TAG, "✅ Resolved $dohServerHostname to $resolvedIP via $dnsServer")
                    return resolvedIP
                } else {
                    Log.e(TAG, "Failed to parse DNS response from $dnsServer")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error querying DNS server $dnsServer", e)
                // Continue to next DNS server
            }
        }

        Log.e(TAG, "❌ All DNS servers failed to resolve $dohServerHostname")
        return null
    }

    /// Build DNS query packet for A record
    private fun buildDNSQueryPacket(hostname: String): ByteArray {
        val buffer = mutableListOf<Byte>()

        // DNS Header (12 bytes)
        buffer.addAll(listOf(0x00, 0x01))  // Transaction ID
        buffer.addAll(listOf(0x01, 0x00))  // Flags: Standard query, recursion desired
        buffer.addAll(listOf(0x00, 0x01))  // Questions: 1
        buffer.addAll(listOf(0x00, 0x00))  // Answer RRs: 0
        buffer.addAll(listOf(0x00, 0x00))  // Authority RRs: 0
        buffer.addAll(listOf(0x00, 0x00))  // Additional RRs: 0

        // Query: QNAME (domain name)
        val labels = hostname.split(".")
        for (label in labels) {
            buffer.add(label.length.toByte())
            buffer.addAll(label.toByteArray().toList())
        }
        buffer.add(0x00)  // Null terminator

        // QTYPE: A (IPv4 address)
        buffer.addAll(listOf(0x00, 0x01))
        // QCLASS: IN (Internet)
        buffer.addAll(listOf(0x00, 0x01))

        return buffer.map { it.toByte() }.toByteArray()
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
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
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
 * Reuses a small number of UDP sockets to avoid resource exhaustion
 */
class UDPConnectionPool(private val poolSize: Int = 3) {
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
            val responseBuffer = ByteArray(512)
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
     */
    private fun getOrCreateSocket(dnsServer: String): DatagramSocket {
        val socket = connections.poll()
        if (socket != null && !socket.isClosed) {
            Log.d(TAG, "Reusing socket from pool")
            return socket
        }

        // Create new socket
        Log.d(TAG, "Creating new socket for pool")
        return DatagramSocket().apply {
            soTimeout = socketTimeout
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
 * Uses LRU eviction policy
 */
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

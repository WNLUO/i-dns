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
                intent.getStringExtra("dnsServer")?.let {
                    dnsServer = it
                    Log.d(TAG, "DNS server updated to: $it")
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
                // Forward to real DNS server
                vpnOutput.write(packet, 0, length)
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

    private fun sendDNSEvent(domain: String, blocked: Boolean) {
        val intent = Intent("com.idns.DNS_EVENT")
        intent.putExtra("domain", domain)
        intent.putExtra("timestamp", System.currentTimeMillis())
        intent.putExtra("status", if (blocked) "blocked" else "allowed")
        intent.putExtra("category", categorizeDomain(domain))
        intent.putExtra("latency", 0)
        sendBroadcast(intent)
    }

    private fun sendStatusBroadcast(isConnected: Boolean) {
        val intent = Intent("com.idns.VPN_STATUS_CHANGED")
        intent.putExtra("isConnected", isConnected)
        sendBroadcast(intent)
    }

    private fun categorizeDomain(domain: String): String {
        val lowerDomain = domain.lowercase()
        return when {
            lowerDomain.contains("ads") || lowerDomain.contains("ad.") || lowerDomain.contains("doubleclick") -> "ad"
            lowerDomain.contains("analytics") || lowerDomain.contains("tracking") || lowerDomain.contains("tracker") -> "tracker"
            lowerDomain.contains("porn") || lowerDomain.contains("xxx") -> "content"
            else -> "unknown"
        }
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

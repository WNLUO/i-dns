package com.idns.vpn

import android.net.VpnService
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer

/**
 * DNS预解析器
 * 在VPN启动前解析DoH服务器的IP地址,避免循环依赖
 *
 * 工作原理:
 * 1. VPN启动前,使用系统DNS或指定DNS服务器解析DoH域名
 * 2. 保存解析到的IP地址列表
 * 3. VPN启动后,直接使用IP地址访问DoH服务器,无需再次DNS解析
 */
class DNSPreResolver(private val vpnService: VpnService) {

    companion object {
        private const val TAG = "DNSPreResolver"

        // 可靠的DNS服务器列表(用于预解析)
        // 参考iOS: reliableDNSServers = ["180.76.76.76", "114.114.114.114", "1.2.4.8"]
        private val RELIABLE_DNS_SERVERS = listOf(
            "223.5.5.5",      // 阿里DNS
            "114.114.114.114", // 114 DNS
            "180.76.76.76"     // 百度DNS
        )

        private const val DNS_TIMEOUT = 5000 // 5秒超时
    }

    /**
     * 预解析DoH服务器的域名
     * 返回解析到的IP地址列表,如果失败返回空列表
     */
    fun resolveDoHServer(hostname: String): List<String> {
        VpnLogger.i(TAG, "========================================")
        VpnLogger.i(TAG, "🔍 开始预解析DoH服务器: $hostname")
        VpnLogger.i(TAG, "========================================")

        // 尝试每个可靠的DNS服务器
        for ((index, dnsServer) in RELIABLE_DNS_SERVERS.withIndex()) {
            VpnLogger.d(TAG, "尝试使用DNS服务器 $dnsServer (${index + 1}/${RELIABLE_DNS_SERVERS.size})")

            try {
                val ips = queryDNS(hostname, dnsServer)
                if (ips.isNotEmpty()) {
                    VpnLogger.i(TAG, "✅ 成功解析 $hostname")
                    VpnLogger.i(TAG, "解析到 ${ips.size} 个IP地址: ${ips.joinToString(", ")}")
                    VpnLogger.i(TAG, "========================================")
                    return ips
                }
            } catch (e: Exception) {
                VpnLogger.w(TAG, "DNS服务器 $dnsServer 查询失败: ${e.message}")
            }
        }

        VpnLogger.e(TAG, "❌ 所有DNS服务器都无法解析 $hostname")
        VpnLogger.i(TAG, "========================================")
        return emptyList()
    }

    /**
     * 使用指定DNS服务器查询域名
     * 返回A记录的IP地址列表
     */
    private fun queryDNS(hostname: String, dnsServer: String): List<String> {
        var socket: DatagramSocket? = null

        try {
            // 创建UDP socket
            socket = DatagramSocket()
            socket.soTimeout = DNS_TIMEOUT

            // 保护socket,确保查询不被VPN拦截
            val protected = vpnService.protect(socket)
            if (!protected) {
                VpnLogger.w(TAG, "⚠️ Socket protect失败,查询可能被拦截")
            }

            // 构建DNS查询包
            val queryData = buildDNSQuery(hostname)

            // 发送查询
            val dnsAddress = InetAddress.getByName(dnsServer)
            val queryPacket = DatagramPacket(queryData, queryData.size, dnsAddress, 53)
            socket.send(queryPacket)

            VpnLogger.d(TAG, "已发送DNS查询到 $dnsServer")

            // 接收响应
            val responseBuffer = ByteArray(1472) // 1500 MTU - 28 IP/UDP headers
            val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
            socket.receive(responsePacket)

            VpnLogger.d(TAG, "收到DNS响应,大小: ${responsePacket.length} 字节")

            // 解析响应
            val ips = parseARecords(responseBuffer, responsePacket.length)

            return ips

        } finally {
            socket?.close()
        }
    }

    /**
     * 构建DNS查询包(A记录查询)
     * 参考RFC 1035格式
     */
    private fun buildDNSQuery(hostname: String): ByteArray {
        val buffer = ByteBuffer.allocate(512)

        // Header (12 bytes)
        buffer.putShort(0x1234.toShort())  // Transaction ID
        buffer.putShort(0x0100.toShort())  // Flags: standard query
        buffer.putShort(1)                  // Questions: 1
        buffer.putShort(0)                  // Answer RRs: 0
        buffer.putShort(0)                  // Authority RRs: 0
        buffer.putShort(0)                  // Additional RRs: 0

        // Question section
        // 域名编码: 每个label前面加长度字节
        val labels = hostname.split(".")
        for (label in labels) {
            buffer.put(label.length.toByte())
            buffer.put(label.toByteArray(Charsets.US_ASCII))
        }
        buffer.put(0) // 结束标记

        buffer.putShort(1)  // Type: A (IPv4 address)
        buffer.putShort(1)  // Class: IN (Internet)

        val result = ByteArray(buffer.position())
        buffer.flip()
        buffer.get(result)

        return result
    }

    /**
     * 解析DNS响应中的所有A记录
     * 返回IP地址列表
     */
    private fun parseARecords(data: ByteArray, length: Int): List<String> {
        if (length < 12) {
            VpnLogger.w(TAG, "DNS响应太短: $length 字节")
            return emptyList()
        }

        val buffer = ByteBuffer.wrap(data, 0, length)

        // Skip header
        buffer.position(2)  // Skip transaction ID
        val flags = buffer.short.toInt() and 0xFFFF
        val rcode = flags and 0x000F

        if (rcode != 0) {
            VpnLogger.w(TAG, "DNS查询失败,RCODE: $rcode")
            return emptyList()
        }

        val questionCount = buffer.short.toInt() and 0xFFFF
        val answerCount = buffer.short.toInt() and 0xFFFF
        buffer.short // Authority RRs
        buffer.short // Additional RRs

        VpnLogger.d(TAG, "DNS响应: Questions=$questionCount, Answers=$answerCount")

        try {
            // Skip questions
            repeat(questionCount) {
                skipDomainName(buffer, data)
                buffer.short // Type
                buffer.short // Class
            }

            // Parse answers
            val ips = mutableListOf<String>()
            repeat(answerCount) {
                skipDomainName(buffer, data)
                val type = buffer.short.toInt() and 0xFFFF
                buffer.short // Class
                buffer.int   // TTL
                val rdLength = buffer.short.toInt() and 0xFFFF

                if (type == 1 && rdLength == 4) {  // A record
                    val ip = "${buffer.get().toInt() and 0xFF}." +
                            "${buffer.get().toInt() and 0xFF}." +
                            "${buffer.get().toInt() and 0xFF}." +
                            "${buffer.get().toInt() and 0xFF}"
                    ips.add(ip)
                    VpnLogger.d(TAG, "解析到A记录: $ip")
                } else {
                    // Skip other record types
                    buffer.position(buffer.position() + rdLength)
                }
            }

            return ips

        } catch (e: Exception) {
            VpnLogger.e(TAG, "解析DNS响应失败", e)
            return emptyList()
        }
    }

    /**
     * 跳过DNS响应中的域名
     * 处理压缩指针(RFC 1035 4.1.4)
     */
    private fun skipDomainName(buffer: ByteBuffer, data: ByteArray) {
        while (true) {
            if (buffer.position() >= buffer.limit()) break

            val length = buffer.get().toInt() and 0xFF

            if (length == 0) {
                break  // End of name
            } else if ((length and 0xC0) == 0xC0) {
                // Compression pointer
                buffer.get()  // Skip second byte
                break
            } else {
                // Normal label
                buffer.position(buffer.position() + length)
            }
        }
    }
}

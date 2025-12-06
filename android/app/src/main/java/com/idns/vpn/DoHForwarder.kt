package com.idns.vpn

import android.net.VpnService
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import javax.net.SocketFactory

/**
 * DNS over HTTPS (DoH) 转发器
 * 参考iOS的DoHForwarder实现
 *
 * 工作原理:
 * 1. 接收DNS查询包(二进制)
 * 2. 通过HTTPS POST发送到DoH服务器
 * 3. 接收加密的DNS响应
 * 4. 返回DNS响应包
 */
class DoHForwarder(
    private val vpnService: VpnService,
    private val dohUrl: String,
    private val resolvedIPs: List<String>
) {

    companion object {
        private const val TAG = "DoHForwarder"
        private const val REQUEST_TIMEOUT = 8000L // 8秒超时(参考iOS)
        private val DNS_MESSAGE_MEDIA_TYPE = "application/dns-message".toMediaType()
    }

    // OkHttp客户端 - 配置参考iOS URLSessionConfiguration
    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(REQUEST_TIMEOUT, TimeUnit.MILLISECONDS)
            .readTimeout(REQUEST_TIMEOUT, TimeUnit.MILLISECONDS)
            .writeTimeout(REQUEST_TIMEOUT, TimeUnit.MILLISECONDS)
            .socketFactory(ProtectedSocketFactory())  // 使用protected socket
            .dns(PreResolvedDns())  // 使用预解析的IP
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * 转发DNS查询到DoH服务器
     * 参数:
     *   - queryData: DNS查询包(二进制)
     * 返回: DNS响应包,失败时返回null
     */
    fun forward(queryData: ByteArray, domain: String): ByteArray? {
        val startTime = System.currentTimeMillis()

        try {
            VpnLogger.d(TAG, "📤 发送DoH查询: $domain")
            VpnLogger.d(TAG, "DoH URL: $dohUrl")
            VpnLogger.d(TAG, "使用预解析IP: ${resolvedIPs.joinToString(", ")}")

            // 构建HTTP请求
            val requestBody = queryData.toRequestBody(DNS_MESSAGE_MEDIA_TYPE)
            val request = Request.Builder()
                .url(dohUrl)
                .post(requestBody)
                .header("Accept", "application/dns-message")
                .header("Content-Type", "application/dns-message")
                .build()

            // 发送请求
            val response = client.newCall(request).execute()

            val latency = System.currentTimeMillis() - startTime

            // 检查响应
            if (!response.isSuccessful) {
                VpnLogger.w(TAG, "DoH请求失败: HTTP ${response.code}")
                return null
            }

            // 检查Content-Type
            val contentType = response.header("Content-Type")
            if (contentType != "application/dns-message") {
                VpnLogger.w(TAG, "DoH响应Content-Type错误: $contentType")
            }

            // 读取响应数据
            val responseData = response.body?.bytes()
            if (responseData == null || responseData.isEmpty()) {
                VpnLogger.w(TAG, "DoH响应为空")
                return null
            }

            VpnLogger.i(TAG, "✅ DoH查询成功: $domain (${latency}ms, ${responseData.size} bytes)")

            return responseData

        } catch (e: IOException) {
            val latency = System.currentTimeMillis() - startTime
            VpnLogger.e(TAG, "DoH查询失败: $domain (${latency}ms)", e)
            return null
        } catch (e: Exception) {
            val latency = System.currentTimeMillis() - startTime
            VpnLogger.e(TAG, "DoH查询异常: $domain (${latency}ms)", e)
            return null
        }
    }

    /**
     * 自定义SocketFactory - 所有socket都被protect
     * 这确保DoH的HTTPS连接不会被VPN拦截
     */
    private inner class ProtectedSocketFactory : SocketFactory() {

        override fun createSocket(): Socket {
            val socket = Socket()
            protectSocket(socket)
            return socket
        }

        override fun createSocket(host: String?, port: Int): Socket {
            val socket = Socket(host, port)
            protectSocket(socket)
            return socket
        }

        override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket {
            val socket = Socket(host, port, localHost, localPort)
            protectSocket(socket)
            return socket
        }

        override fun createSocket(host: InetAddress?, port: Int): Socket {
            val socket = Socket(host, port)
            protectSocket(socket)
            return socket
        }

        override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket {
            val socket = Socket(address, port, localAddress, localPort)
            protectSocket(socket)
            return socket
        }

        private fun protectSocket(socket: Socket) {
            val protected = vpnService.protect(socket)
            if (protected) {
                VpnLogger.d(TAG, "✅ DoH Socket protected successfully")
            } else {
                VpnLogger.e(TAG, "❌ Failed to protect DoH socket!")
            }
        }
    }

    /**
     * 自定义DNS解析器 - 使用预解析的IP地址
     * 这避免了在访问DoH服务器时再次进行DNS查询(循环依赖)
     *
     * 参考iOS: 使用预解析的dohServerIPs
     */
    private inner class PreResolvedDns : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            // 如果查询的是DoH服务器自身的域名,使用预解析的IP
            if (resolvedIPs.isNotEmpty() && dohUrl.contains(hostname)) {
                VpnLogger.d(TAG, "使用预解析IP访问DoH服务器: $hostname")
                return resolvedIPs.map { InetAddress.getByName(it) }
            }

            // 其他域名使用系统DNS(这不应该发生,因为只访问DoH服务器)
            VpnLogger.w(TAG, "⚠️ 使用系统DNS解析: $hostname (不应该发生)")
            return Dns.SYSTEM.lookup(hostname)
        }
    }

    /**
     * 清理资源
     */
    fun close() {
        try {
            client.dispatcher.executorService.shutdown()
            client.connectionPool.evictAll()
        } catch (e: Exception) {
            VpnLogger.e(TAG, "关闭DoH客户端失败", e)
        }
    }
}

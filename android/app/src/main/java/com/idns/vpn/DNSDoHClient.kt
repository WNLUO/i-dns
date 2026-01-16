package com.idns.vpn

import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * DNS over HTTPS (DoH) Client
 *
 * 实现标准的 DoH 协议 (RFC 8484)
 * - 使用 HTTP/2 协议提高性能
 * - 支持连接复用减少延迟
 * - 自动重试机制
 *
 * DoH 服务器: https://i-dns.wnluo.com/dns-query
 */
class DNSDoHClient(
    private val dohServerUrl: String = "https://i-dns.wnluo.com/dns-query"
) {
    private val TAG = "DNSDoHClient"

    companion object {
        private const val DNS_MESSAGE_MEDIA_TYPE = "application/dns-message"
        private const val CONNECT_TIMEOUT_MS = 5000L
        private const val READ_TIMEOUT_MS = 5000L
        private const val WRITE_TIMEOUT_MS = 5000L
    }

    // OkHttp client with HTTP/2 support and connection pooling
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .writeTimeout(WRITE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1)) // Prefer HTTP/2
        .connectionPool(ConnectionPool(
            maxIdleConnections = 5,
            keepAliveDuration = 5,
            timeUnit = TimeUnit.MINUTES
        ))
        .retryOnConnectionFailure(true)
        .build()

    /**
     * 查询结果
     */
    data class DoHResult(
        val success: Boolean,
        val response: ByteArray? = null,
        val latency: Int = 0,
        val error: String? = null
    )

    /**
     * 同步执行 DoH 查询 (阻塞调用)
     *
     * @param dnsQueryData DNS 查询的二进制数据 (wire format)
     * @return DoH 查询结果
     */
    fun querySync(dnsQueryData: ByteArray): DoHResult {
        val startTime = System.currentTimeMillis()

        try {
            VpnLogger.d(TAG, "Sending DoH query to $dohServerUrl (size: ${dnsQueryData.size} bytes)")

            // 构建 HTTP POST 请求
            val requestBody = dnsQueryData.toRequestBody(DNS_MESSAGE_MEDIA_TYPE.toMediaType())
            val request = Request.Builder()
                .url(dohServerUrl)
                .post(requestBody)
                .addHeader("Accept", DNS_MESSAGE_MEDIA_TYPE)
                .addHeader("Content-Type", DNS_MESSAGE_MEDIA_TYPE)
                .build()

            // 执行同步请求
            httpClient.newCall(request).execute().use { response ->
                val latency = (System.currentTimeMillis() - startTime).toInt()

                if (!response.isSuccessful) {
                    val errorMsg = "DoH server returned HTTP ${response.code}: ${response.message}"
                    VpnLogger.e(TAG, errorMsg)
                    return DoHResult(
                        success = false,
                        error = errorMsg,
                        latency = latency
                    )
                }

                val responseBody = response.body?.bytes()
                if (responseBody == null || responseBody.isEmpty()) {
                    val errorMsg = "DoH server returned empty response"
                    VpnLogger.e(TAG, errorMsg)
                    return DoHResult(
                        success = false,
                        error = errorMsg,
                        latency = latency
                    )
                }

                VpnLogger.i(TAG, "✅ DoH query succeeded in ${latency}ms (response: ${responseBody.size} bytes)")

                return DoHResult(
                    success = true,
                    response = responseBody,
                    latency = latency
                )
            }

        } catch (e: IOException) {
            val latency = (System.currentTimeMillis() - startTime).toInt()
            val errorMsg = "DoH query failed: ${e.message}"
            VpnLogger.e(TAG, errorMsg, e)

            return DoHResult(
                success = false,
                error = errorMsg,
                latency = latency
            )
        } catch (e: Exception) {
            val latency = (System.currentTimeMillis() - startTime).toInt()
            val errorMsg = "Unexpected error in DoH query: ${e.message}"
            VpnLogger.e(TAG, errorMsg, e)

            return DoHResult(
                success = false,
                error = errorMsg,
                latency = latency
            )
        }
    }

    /**
     * 异步执行 DoH 查询 (非阻塞)
     *
     * @param dnsQueryData DNS 查询的二进制数据
     * @param callback 查询完成回调
     */
    fun queryAsync(dnsQueryData: ByteArray, callback: (DoHResult) -> Unit) {
        val startTime = System.currentTimeMillis()

        try {
            VpnLogger.d(TAG, "Sending async DoH query to $dohServerUrl")

            val requestBody = dnsQueryData.toRequestBody(DNS_MESSAGE_MEDIA_TYPE.toMediaType())
            val request = Request.Builder()
                .url(dohServerUrl)
                .post(requestBody)
                .addHeader("Accept", DNS_MESSAGE_MEDIA_TYPE)
                .addHeader("Content-Type", DNS_MESSAGE_MEDIA_TYPE)
                .build()

            httpClient.newCall(request).enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    val latency = (System.currentTimeMillis() - startTime).toInt()

                    response.use {
                        if (!response.isSuccessful) {
                            val errorMsg = "DoH server returned HTTP ${response.code}"
                            VpnLogger.e(TAG, errorMsg)
                            callback(DoHResult(
                                success = false,
                                error = errorMsg,
                                latency = latency
                            ))
                            return
                        }

                        val responseBody = response.body?.bytes()
                        if (responseBody == null || responseBody.isEmpty()) {
                            val errorMsg = "DoH server returned empty response"
                            VpnLogger.e(TAG, errorMsg)
                            callback(DoHResult(
                                success = false,
                                error = errorMsg,
                                latency = latency
                            ))
                            return
                        }

                        VpnLogger.i(TAG, "✅ Async DoH query succeeded in ${latency}ms")

                        callback(DoHResult(
                            success = true,
                            response = responseBody,
                            latency = latency
                        ))
                    }
                }

                override fun onFailure(call: Call, e: IOException) {
                    val latency = (System.currentTimeMillis() - startTime).toInt()
                    val errorMsg = "DoH query failed: ${e.message}"
                    VpnLogger.e(TAG, errorMsg, e)

                    callback(DoHResult(
                        success = false,
                        error = errorMsg,
                        latency = latency
                    ))
                }
            })

        } catch (e: Exception) {
            val latency = (System.currentTimeMillis() - startTime).toInt()
            VpnLogger.e(TAG, "Unexpected error in async DoH query", e)

            callback(DoHResult(
                success = false,
                error = e.message,
                latency = latency
            ))
        }
    }

    /**
     * 关闭客户端，释放资源
     */
    fun shutdown() {
        try {
            httpClient.dispatcher.executorService.shutdown()
            httpClient.connectionPool.evictAll()
            VpnLogger.i(TAG, "DoH client shutdown")
        } catch (e: Exception) {
            VpnLogger.e(TAG, "Error shutting down DoH client", e)
        }
    }

    /**
     * 获取统计信息
     */
    fun getStatistics(): Map<String, Any> {
        return mapOf(
            "serverUrl" to dohServerUrl,
            "protocol" to "DoH (RFC 8484)",
            "idleConnections" to httpClient.connectionPool.idleConnectionCount(),
            "connectionCount" to httpClient.connectionPool.connectionCount()
        )
    }
}

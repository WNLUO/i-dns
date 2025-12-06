package com.idns.vpn

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.*

/**
 * VPN日志管理器
 * 将所有VPN相关日志保存到文件，方便调试
 */
object VpnLogger {
    private const val TAG = "VpnLogger"
    private const val LOG_DIR = "vpn_logs"
    private const val MAX_LOG_FILES = 5  // 最多保留5个日志文件

    private var logFile: File? = null
    private var fileWriter: FileWriter? = null
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val fileNameFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)

    /**
     * 初始化日志系统
     */
    fun init(context: Context) {
        try {
            // 创建日志目录
            val logDir = File(context.filesDir, LOG_DIR)
            if (!logDir.exists()) {
                logDir.mkdirs()
            }

            // 清理旧日志
            cleanOldLogs(logDir)

            // 创建新日志文件
            val fileName = "vpn_log_${fileNameFormat.format(Date())}.txt"
            logFile = File(logDir, fileName)
            fileWriter = FileWriter(logFile, true)

            log("INFO", "VpnLogger", "=== VPN日志系统已启动 ===")
            log("INFO", "VpnLogger", "日志文件: ${logFile?.absolutePath}")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize logger", e)
        }
    }

    /**
     * 记录日志
     */
    fun log(level: String, tag: String, message: String) {
        try {
            val timestamp = dateFormat.format(Date())
            val logLine = "$timestamp [$level] $tag: $message\n"

            // 写入文件
            fileWriter?.apply {
                write(logLine)
                flush()
            }

            // 同时输出到logcat
            when (level) {
                "DEBUG" -> Log.d(tag, message)
                "INFO" -> Log.i(tag, message)
                "WARN" -> Log.w(tag, message)
                "ERROR" -> Log.e(tag, message)
                else -> Log.v(tag, message)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to write log", e)
        }
    }

    /**
     * Debug级别日志
     */
    fun d(tag: String, message: String) {
        log("DEBUG", tag, message)
    }

    /**
     * Info级别日志
     */
    fun i(tag: String, message: String) {
        log("INFO", tag, message)
    }

    /**
     * Warning级别日志
     */
    fun w(tag: String, message: String) {
        log("WARN", tag, message)
    }

    /**
     * Error级别日志
     */
    fun e(tag: String, message: String, throwable: Throwable? = null) {
        var msg = message
        if (throwable != null) {
            msg += "\n${throwable.stackTraceToString()}"
        }
        log("ERROR", tag, msg)
    }

    /**
     * 获取当前日志文件路径
     */
    fun getLogFilePath(): String? {
        return logFile?.absolutePath
    }

    /**
     * 获取所有日志文件
     */
    fun getAllLogFiles(context: Context): List<File> {
        val logDir = File(context.filesDir, LOG_DIR)
        if (!logDir.exists()) return emptyList()

        return logDir.listFiles()
            ?.filter { it.isFile && it.name.startsWith("vpn_log_") }
            ?.sortedByDescending { it.lastModified() }
            ?: emptyList()
    }

    /**
     * 读取日志文件内容
     */
    fun readLogFile(file: File): String {
        return try {
            file.readText()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read log file", e)
            ""
        }
    }

    /**
     * 清理旧日志文件
     */
    private fun cleanOldLogs(logDir: File) {
        try {
            val logFiles = logDir.listFiles()
                ?.filter { it.isFile && it.name.startsWith("vpn_log_") }
                ?.sortedByDescending { it.lastModified() }
                ?: return

            // 删除超出数量限制的旧日志
            if (logFiles.size >= MAX_LOG_FILES) {
                logFiles.drop(MAX_LOG_FILES - 1).forEach { file ->
                    file.delete()
                    Log.d(TAG, "Deleted old log file: ${file.name}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clean old logs", e)
        }
    }

    /**
     * 关闭日志系统
     */
    fun close() {
        try {
            log("INFO", "VpnLogger", "=== VPN日志系统已关闭 ===")
            fileWriter?.close()
            fileWriter = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close logger", e)
        }
    }
}

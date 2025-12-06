package com.idns.vpn

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class DNSVPNModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "DNSVPNModule"
        const val VPN_PERMISSION_REQUEST_CODE = 1001
        const val NOTIFICATION_PERMISSION_REQUEST_CODE = 1002
    }

    private var vpnStartPromise: Promise? = null
    private var notificationPermissionPromise: Promise? = null

    private var hasListeners = false
    private val dnsEventReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.idns.DNS_EVENT" && hasListeners) {
                val params = Arguments.createMap().apply {
                    putString("domain", intent.getStringExtra("domain"))
                    putDouble("timestamp", intent.getLongExtra("timestamp", 0).toDouble())
                    putString("status", intent.getStringExtra("status"))
                    putString("category", intent.getStringExtra("category"))
                    putInt("latency", intent.getIntExtra("latency", 0))
                }

                sendEvent("DNSRequest", params)
            } else if (intent?.action == "com.idns.VPN_STATUS_CHANGED" && hasListeners) {
                val isConnected = intent.getBooleanExtra("isConnected", false)
                sendEvent("VPNStatusChanged", isConnected)
            }
        }
    }

    init {
        val filter = IntentFilter().apply {
            addAction("com.idns.DNS_EVENT")
            addAction("com.idns.VPN_STATUS_CHANGED")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(dnsEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(dnsEventReceiver, filter)
        }
    }

    override fun getName(): String {
        return "DNSVPNModule"
    }

    @ReactMethod
    fun addListener(eventName: String) {
        hasListeners = true
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        hasListeners = false
    }

    @ReactMethod
    fun startVPN(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity

            if (activity == null) {
                promise.reject("VPN_START_ERROR", "Activity not available")
                return
            }

            // Android 13+ (API 33+) requires notification permission for foreground services
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        reactApplicationContext,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    // Request notification permission first
                    vpnStartPromise = promise
                    requestNotificationPermission(activity)
                    return
                }
            }

            // Check VPN permission
            val vpnIntent = VpnService.prepare(activity)
            if (vpnIntent != null) {
                // Need to request VPN permission
                // Result will be handled in MainActivity.onActivityResult
                activity.startActivityForResult(vpnIntent, VPN_PERMISSION_REQUEST_CODE)
                // Return immediately - result will come via VPNPermissionResult event
                val result = Arguments.createMap()
                result.putBoolean("requiresPermission", true)
                promise.resolve(result)
                return
            }

            // Both permissions granted, start VPN service
            startVPNService()
            val result = Arguments.createMap()
            result.putBoolean("requiresPermission", false)
            result.putBoolean("success", true)
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("VPN_START_ERROR", "Failed to start VPN: ${e.message}", e)
        }
    }

    /**
     * Request notification permission for Android 13+
     */
    private fun requestNotificationPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (activity is PermissionAwareActivity) {
                val permissionListener = object : PermissionListener {
                    override fun onRequestPermissionsResult(
                        requestCode: Int,
                        permissions: Array<String>,
                        grantResults: IntArray
                    ): Boolean {
                        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
                            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                                // Permission granted, now check VPN permission
                                val vpnIntent = VpnService.prepare(activity)
                                if (vpnIntent != null) {
                                    activity.startActivityForResult(vpnIntent, VPN_PERMISSION_REQUEST_CODE)
                                } else {
                                    startVPNService()
                                    vpnStartPromise?.resolve(true)
                                    vpnStartPromise = null
                                }
                            } else {
                                vpnStartPromise?.reject(
                                    "NOTIFICATION_PERMISSION_DENIED",
                                    "需要通知权限才能运行VPN服务"
                                )
                                vpnStartPromise = null
                            }
                            return true
                        }
                        return false
                    }
                }

                activity.requestPermissions(
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST_CODE,
                    permissionListener
                )
            } else {
                vpnStartPromise?.reject(
                    "PERMISSION_ERROR",
                    "无法请求权限: Activity 不支持权限请求"
                )
                vpnStartPromise = null
            }
        }
    }

    /**
     * Start VPN service
     */
    private fun startVPNService() {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
        } catch (e: Exception) {
            throw Exception("启动VPN服务失败: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopVPN(promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "STOP"
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_STOP_ERROR", "Failed to stop VPN: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getVPNStatus(promise: Promise) {
        try {
            val isRunning = DNSVpnService.isRunning.get()
            promise.resolve(isRunning)

        } catch (e: Exception) {
            promise.reject("VPN_STATUS_ERROR", "Failed to get VPN status: ${e.message}", e)
        }
    }

    @ReactMethod
    fun checkNotificationPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val hasPermission = ContextCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                promise.resolve(hasPermission)
            } else {
                // Notification permission not required for older Android versions
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("PERMISSION_CHECK_ERROR", "Failed to check notification permission: ${e.message}", e)
        }
    }

    @ReactMethod
    fun checkVPNPermission(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("VPN_PERMISSION_CHECK_ERROR", "Activity not available")
                return
            }

            val vpnIntent = VpnService.prepare(activity)
            promise.resolve(vpnIntent == null)
        } catch (e: Exception) {
            promise.reject("VPN_PERMISSION_CHECK_ERROR", "Failed to check VPN permission: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addDomainToBlacklist(domain: String, promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "ADD_BLACKLIST"
            serviceIntent.putExtra("domain", domain)
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to add domain to blacklist: ${e.message}", e)
        }
    }

    @ReactMethod
    fun removeDomainFromBlacklist(domain: String, promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "REMOVE_BLACKLIST"
            serviceIntent.putExtra("domain", domain)
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to remove domain from blacklist: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addDomainToWhitelist(domain: String, promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "ADD_WHITELIST"
            serviceIntent.putExtra("domain", domain)
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to add domain to whitelist: ${e.message}", e)
        }
    }

    @ReactMethod
    fun removeDomainFromWhitelist(domain: String, promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "REMOVE_WHITELIST"
            serviceIntent.putExtra("domain", domain)
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to remove domain from whitelist: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateDNSServer(dnsServer: String, promise: Promise) {
        try {
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)
            serviceIntent.action = "UPDATE_DNS"
            serviceIntent.putExtra("dnsServer", dnsServer)
            reactApplicationContext.startService(serviceIntent)

            promise.resolve(null)

        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to update DNS server: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getVPNLogFilePath(promise: Promise) {
        try {
            val logPath = VpnLogger.getLogFilePath()
            promise.resolve(logPath)
        } catch (e: Exception) {
            promise.reject("LOG_ERROR", "Failed to get log file path: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getAllVPNLogFiles(promise: Promise) {
        try {
            val logFiles = VpnLogger.getAllLogFiles(reactApplicationContext)
            val result = Arguments.createArray()

            logFiles.forEach { file ->
                val fileInfo = Arguments.createMap()
                fileInfo.putString("path", file.absolutePath)
                fileInfo.putString("name", file.name)
                fileInfo.putDouble("size", file.length().toDouble())
                fileInfo.putDouble("lastModified", file.lastModified().toDouble())
                result.pushMap(fileInfo)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LOG_ERROR", "Failed to get log files: ${e.message}", e)
        }
    }

    @ReactMethod
    fun readVPNLogFile(filePath: String, promise: Promise) {
        try {
            val file = java.io.File(filePath)
            if (!file.exists()) {
                promise.reject("LOG_ERROR", "Log file does not exist: $filePath")
                return
            }

            val content = VpnLogger.readLogFile(file)
            promise.resolve(content)
        } catch (e: Exception) {
            promise.reject("LOG_ERROR", "Failed to read log file: ${e.message}", e)
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun invalidate() {
        try {
            reactApplicationContext.unregisterReceiver(dnsEventReceiver)
        } catch (e: Exception) {
            // Receiver might not be registered
        }
        super.invalidate()
    }
}

package com.idns.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.VpnService
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class DNSVPNModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "DNSVPNModule"
        const val VPN_PERMISSION_REQUEST_CODE = 1001
    }

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
            val intent = VpnService.prepare(activity)

            if (intent != null) {
                // Need to request VPN permission
                activity?.let {
                    it.startActivityForResult(intent, VPN_PERMISSION_REQUEST_CODE)

                    // Wait for permission result
                    // In a real implementation, you would use onActivityResult callback
                    // For now, we'll just resolve the promise
                    promise.resolve(false)
                }
                return
            }

            // Permission already granted, start VPN service
            val serviceIntent = Intent(reactApplicationContext, DNSVpnService::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }

            promise.resolve(true)

        } catch (e: Exception) {
            promise.reject("VPN_START_ERROR", "Failed to start VPN: ${e.message}", e)
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

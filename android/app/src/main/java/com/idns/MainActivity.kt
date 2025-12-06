package com.idns

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.ReactContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.idns.vpn.DNSVPNModule
import com.idns.vpn.DNSVpnService

class MainActivity : ReactActivity() {

  companion object {
    private const val TAG = "MainActivity"
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "iDNS"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Handle VPN permission result
   */
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    Log.d(TAG, "onActivityResult: requestCode=$requestCode, resultCode=$resultCode")

    if (requestCode == DNSVPNModule.VPN_PERMISSION_REQUEST_CODE) {
      if (resultCode == Activity.RESULT_OK) {
        Log.d(TAG, "VPN permission granted, starting VPN service")
        // VPN permission granted, start the service
        try {
          val serviceIntent = Intent(this, DNSVpnService::class.java)
          if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
          } else {
            startService(serviceIntent)
          }

          // Notify React Native that VPN started successfully
          sendVPNStartResult(true, null)
        } catch (e: Exception) {
          Log.e(TAG, "Failed to start VPN service", e)
          sendVPNStartResult(false, e.message)
        }
      } else {
        Log.w(TAG, "VPN permission denied")
        // VPN permission denied
        sendVPNStartResult(false, "VPN权限被拒绝")
      }
    }
  }

  /**
   * Send VPN start result to React Native
   */
  private fun sendVPNStartResult(success: Boolean, error: String?) {
    try {
      val reactContext = reactInstanceManager.currentReactContext
      if (reactContext != null) {
        val params = com.facebook.react.bridge.Arguments.createMap().apply {
          putBoolean("success", success)
          if (error != null) {
            putString("error", error)
          }
        }

        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("VPNPermissionResult", params)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to send VPN start result", e)
    }
  }
}

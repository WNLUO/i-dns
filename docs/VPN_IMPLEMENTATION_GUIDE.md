# VPN 拦截引擎实现指南

本文档详细说明如何在 iOS 和 Android 平台上实现 DNS 拦截功能。

## 目录
- [iOS 实现](#ios-实现)
- [Android 实现](#android-实现)
- [测试方法](#测试方法)

---

## iOS 实现

### 第一步：创建 Network Extension Target

1. 在 Xcode 中打开 `ios/iDNS.xcworkspace`
2. 点击 `File` -> `New` -> `Target`
3. 选择 `Network Extension` -> `Packet Tunnel`
4. 命名为 `DNSVPNExtension`
5. 语言选择 Swift
6. 点击 `Activate` 激活该 scheme

### 第二步：配置 Capabilities

**主应用 (iDNS):**
1. 选择主 target `iDNS`
2. 进入 `Signing & Capabilities`
3. 点击 `+ Capability`
4. 添加 `Network Extensions`
5. 勾选 `Packet Tunnel`

**Extension Target:**
1. 选择 `DNSVPNExtension` target
2. 同样添加 `Network Extensions` capability

### 第三步：实现 Packet Tunnel Provider

在 `DNSVPNExtension` 目录下，编辑 `PacketTunnelProvider.swift`:

\`\`\`swift
import NetworkExtension
import os.log

class PacketTunnelProvider: NEPacketTunnelProvider {

    private var pendingStartCompletion: ((Error?) -> Void)?

    // DNS 服务器地址
    private var dnsServer: String = "8.8.8.8"

    // 黑名单（从共享存储加载）
    private var blacklist: Set<String> = []

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("Starting VPN tunnel", log: .default, type: .info)

        pendingStartCompletion = completionHandler

        // 加载黑名单
        loadBlacklist()

        // 配置 VPN 设置
        let tunnelSettings = createTunnelSettings()

        // 应用设置并启动隧道
        setTunnelNetworkSettings(tunnelSettings) { error in
            if let error = error {
                os_log("Failed to set tunnel settings: %{public}@",
                       log: .default, type: .error, error.localizedDescription)
                completionHandler(error)
                return
            }

            os_log("VPN tunnel started successfully", log: .default, type: .info)

            // 开始处理数据包
            self.startPacketProcessing()

            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log("Stopping VPN tunnel, reason: %{public}d",
               log: .default, type: .info, reason.rawValue)

        completionHandler()
    }

    // MARK: - Tunnel Configuration

    private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.0.0.1")

        // 配置 IPv4
        let ipv4Settings = NEIPv4Settings(addresses: ["10.0.0.2"],
                                          subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        // 配置 DNS
        let dnsSettings = NEDNSSettings(servers: [dnsServer])
        dnsSettings.matchDomains = [""] // 拦截所有 DNS 请求
        settings.dnsSettings = dnsSettings

        // 配置 MTU
        settings.mtu = 1500

        return settings
    }

    // MARK: - Packet Processing

    private func startPacketProcessing() {
        // 从虚拟网络接口读取数据包
        packetFlow.readPackets { packets, protocols in
            // 处理接收到的数据包
            for (index, packet) in packets.enumerated() {
                let protocolNumber = protocols[index]

                if protocolNumber == AF_INET {
                    // IPv4 数据包
                    self.processIPv4Packet(packet)
                } else if protocolNumber == AF_INET6 {
                    // IPv6 数据包
                    self.processIPv6Packet(packet)
                }
            }

            // 继续读取
            self.startPacketProcessing()
        }
    }

    private func processIPv4Packet(_ packet: Data) {
        // 解析 IP 头部
        guard packet.count >= 20 else { return }

        let ipHeaderLength = Int((packet[0] & 0x0F) * 4)
        let protocol = packet[9]

        // 检查是否是 UDP (DNS 通常使用 UDP)
        if protocol == 17 && packet.count >= ipHeaderLength + 8 {
            processDNSPacket(packet, ipHeaderLength: ipHeaderLength)
        } else {
            // 其他协议直接转发
            packetFlow.writePackets([packet], withProtocols: [AF_INET])
        }
    }

    private func processIPv6Packet(_ packet: Data) {
        // IPv6 处理（简化实现）
        packetFlow.writePackets([packet], withProtocols: [AF_INET6])
    }

    // MARK: - DNS Processing

    private func processDNSPacket(_ packet: Data, ipHeaderLength: Int) {
        let udpHeaderOffset = ipHeaderLength

        // 检查是否是 DNS 端口 (53)
        guard packet.count >= udpHeaderOffset + 8 else {
            packetFlow.writePackets([packet], withProtocols: [AF_INET])
            return
        }

        let destPort = UInt16(packet[udpHeaderOffset + 2]) << 8 |
                       UInt16(packet[udpHeaderOffset + 3])

        if destPort != 53 {
            // 不是 DNS 请求，直接转发
            packetFlow.writePackets([packet], withProtocols: [AF_INET])
            return
        }

        // 解析 DNS 查询的域名
        let dnsPayloadOffset = udpHeaderOffset + 8
        if let domain = extractDomainFromDNSQuery(packet, offset: dnsPayloadOffset) {
            os_log("DNS query for domain: %{public}@", log: .default, type: .info, domain)

            // 检查黑名单
            if shouldBlockDomain(domain) {
                os_log("Blocking domain: %{public}@", log: .default, type: .info, domain)

                // 发送 DNS 响应，指向 0.0.0.0
                if let blockedResponse = createBlockedDNSResponse(packet) {
                    packetFlow.writePackets([blockedResponse], withProtocols: [AF_INET])
                }

                // 通知 React Native (可选)
                notifyDNSBlocked(domain: domain)
                return
            }

            // 通知 React Native DNS 请求被允许
            notifyDNSAllowed(domain: domain)
        }

        // 允许的请求，转发到真实 DNS 服务器
        packetFlow.writePackets([packet], withProtocols: [AF_INET])
    }

    // MARK: - Domain Filtering

    private func shouldBlockDomain(_ domain: String) -> Boolean {
        let lowercasedDomain = domain.lowercased()

        // 检查完全匹配
        if blacklist.contains(lowercasedDomain) {
            return true
        }

        // 检查子域名匹配
        for blockedDomain in blacklist {
            if lowercasedDomain.hasSuffix("." + blockedDomain) {
                return true
            }
        }

        return false
    }

    // MARK: - Helper Methods

    private func extractDomainFromDNSQuery(_ packet: Data, offset: Int) -> String? {
        // DNS 查询格式解析
        var currentOffset = offset + 12 // 跳过 DNS 头部
        var domain = ""

        while currentOffset < packet.count {
            let length = Int(packet[currentOffset])

            if length == 0 {
                break
            }

            currentOffset += 1

            if currentOffset + length > packet.count {
                return nil
            }

            let labelData = packet.subdata(in: currentOffset..<currentOffset + length)
            if let label = String(data: labelData, encoding: .utf8) {
                if !domain.isEmpty {
                    domain += "."
                }
                domain += label
            }

            currentOffset += length
        }

        return domain.isEmpty ? nil : domain
    }

    private func createBlockedDNSResponse(_ request: Data) -> Data? {
        // 创建 DNS 响应，返回 0.0.0.0
        // 这是简化实现，实际需要构造完整的 DNS 响应包
        var response = request

        // 修改为响应标志
        response[2] = 0x81
        response[3] = 0x80

        return response
    }

    // MARK: - Blacklist Management

    private func loadBlacklist() {
        // 从共享存储（App Group）加载黑名单
        if let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.yourcompany.idns") {

            let blacklistURL = appGroupURL.appendingPathComponent("blacklist.json")

            if let data = try? Data(contentsOf: blacklistURL),
               let domains = try? JSONDecoder().decode([String].self, from: data) {
                blacklist = Set(domains)
                os_log("Loaded %{public}d domains from blacklist",
                       log: .default, type: .info, blacklist.count)
            }
        }
    }

    // MARK: - React Native Communication

    private func notifyDNSBlocked(domain: String) {
        // 通过 Darwin Notification 或共享文件通知主应用
        // 这里可以使用 CFNotificationCenter
    }

    private func notifyDNSAllowed(domain: String) {
        // 同上
    }
}
\`\`\`

### 第四步：创建 React Native 桥接模块

在 `ios/iDNS` 目录下创建 `DNSVPNModule.swift`:

\`\`\`swift
import Foundation
import NetworkExtension
import React

@objc(DNSVPNModule)
class DNSVPNModule: RCTEventEmitter {

    private var vpnManager: NETunnelProviderManager?
    private var hasListeners = false

    override init() {
        super.init()
        loadVPNManager()
    }

    // MARK: - React Native Methods

    @objc
    func startVPN(_ resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {

        loadVPNManager { [weak self] in
            guard let self = self, let manager = self.vpnManager else {
                reject("VPN_ERROR", "Failed to load VPN manager", nil)
                return
            }

            do {
                try manager.connection.startVPNTunnel()
                resolve(true)
            } catch {
                reject("VPN_ERROR", "Failed to start VPN: \\(error.localizedDescription)", error)
            }
        }
    }

    @objc
    func stopVPN(_ resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {

        guard let manager = vpnManager else {
            reject("VPN_ERROR", "VPN manager not initialized", nil)
            return
        }

        manager.connection.stopVPNTunnel()
        resolve(nil)
    }

    @objc
    func getVPNStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {

        guard let manager = vpnManager else {
            resolve(false)
            return
        }

        let isConnected = manager.connection.status == .connected
        resolve(isConnected)
    }

    @objc
    func addDomainToBlacklist(_ domain: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
        // 保存到共享存储
        saveToBlacklist(domain: domain)
        resolve(nil)
    }

    @objc
    func removeDomainFromBlacklist(_ domain: String,
                                   resolve: @escaping RCTPromiseResolveBlock,
                                   reject: @escaping RCTPromiseRejectBlock) {
        // 从共享存储移除
        removeFromBlacklist(domain: domain)
        resolve(nil)
    }

    // MARK: - Event Emitter

    override func supportedEvents() -> [String]! {
        return ["DNSRequest", "VPNStatusChanged"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - VPN Manager

    private func loadVPNManager(completion: (() -> Void)? = nil) {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error = error {
                print("Failed to load VPN managers: \\(error)")
                completion?()
                return
            }

            if let manager = managers?.first {
                self.vpnManager = manager
                completion?()
            } else {
                self.createVPNManager(completion: completion)
            }
        }
    }

    private func createVPNManager(completion: (() -> Void)?) {
        let manager = NETunnelProviderManager()

        let proto = NETunnelProviderProtocol()
        proto.providerBundleIdentifier = "com.yourcompany.idns.DNSVPNExtension"
        proto.serverAddress = "iDNS VPN"

        manager.protocolConfiguration = proto
        manager.localizedDescription = "iDNS 家庭守护"
        manager.isEnabled = true

        manager.saveToPreferences { error in
            if let error = error {
                print("Failed to save VPN configuration: \\(error)")
            } else {
                self.vpnManager = manager
            }
            completion?()
        }
    }

    // MARK: - Shared Storage

    private func saveToBlacklist(domain: String) {
        guard let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.yourcompany.idns") else {
            return
        }

        let blacklistURL = appGroupURL.appendingPathComponent("blacklist.json")

        var domains: [String] = []
        if let data = try? Data(contentsOf: blacklistURL),
           let existing = try? JSONDecoder().decode([String].self, from: data) {
            domains = existing
        }

        if !domains.contains(domain) {
            domains.append(domain)
            if let data = try? JSONEncoder().encode(domains) {
                try? data.write(to: blacklistURL)
            }
        }
    }

    private func removeFromBlacklist(domain: String) {
        guard let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.yourcompany.idns") else {
            return
        }

        let blacklistURL = appGroupURL.appendingPathComponent("blacklist.json")

        if let data = try? Data(contentsOf: blacklistURL),
           var domains = try? JSONDecoder().decode([String].self, from: data) {
            domains.removeAll { $0 == domain }
            if let data = try? JSONEncoder().encode(domains) {
                try? data.write(to: blacklistURL)
            }
        }
    }
}
\`\`\`

创建桥接头文件 `DNSVPNModule.m`:

\`\`\`objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(DNSVPNModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startVPN:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopVPN:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getVPNStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(addDomainToBlacklist:(NSString *)domain
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeDomainFromBlacklist:(NSString *)domain
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
\`\`\`

### 第五步：配置 App Groups

1. 在主应用和 Extension 都添加 `App Groups` capability
2. 创建一个共享的 App Group: `group.com.yourcompany.idns`
3. 确保两个 target 都勾选了这个 App Group

### 第六步：配置 Info.plist

在主应用的 `Info.plist` 中添加：

\`\`\`xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
\`\`\`

---

## Android 实现

### 第一步：创建 VPN Service

在 `android/app/src/main/java/com/idns/vpn/` 目录下创建 `DNSVPNService.kt`:

\`\`\`kotlin
package com.idns.vpn

import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetAddress
import java.nio.ByteBuffer

class DNSVPNService : VpnService() {

    companion object {
        private const val TAG = "DNSVPNService"
        private const val VPN_MTU = 1500
        private const val VPN_ADDRESS = "10.0.0.2"
        private const val DNS_SERVER = "8.8.8.8"
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var isRunning = false
    private val blacklist = mutableSetOf<String>()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            startVPN()
        }
        return START_STICKY
    }

    private fun startVPN() {
        val builder = Builder()
            .setMtu(VPN_MTU)
            .addAddress(VPN_ADDRESS, 24)
            .addDnsServer(DNS_SERVER)
            .addRoute("0.0.0.0", 0)
            .setSession("iDNS VPN")

        // 创建配置 Intent
        val configIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, configIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        builder.setConfigureIntent(pendingIntent)

        // 建立 VPN 连接
        vpnInterface = builder.establish()

        if (vpnInterface != null) {
            isRunning = true
            Log.i(TAG, "VPN started successfully")

            // 开始处理数据包
            Thread { processPackets() }.start()
        } else {
            Log.e(TAG, "Failed to establish VPN")
        }
    }

    private fun processPackets() {
        val inputStream = FileInputStream(vpnInterface!!.fileDescriptor)
        val outputStream = FileOutputStream(vpnInterface!!.fileDescriptor)
        val buffer = ByteBuffer.allocate(VPN_MTU)

        try {
            while (isRunning) {
                val length = inputStream.read(buffer.array())
                if (length > 0) {
                    buffer.limit(length)

                    // 处理数据包
                    processPacket(buffer, outputStream)

                    buffer.clear()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing packets", e)
        }
    }

    private fun processPacket(packet: ByteBuffer, outputStream: FileOutputStream) {
        // 解析 IP 头部
        val ipVersion = (packet.get(0).toInt() shr 4) and 0x0F

        if (ipVersion == 4) {
            processIPv4Packet(packet, outputStream)
        }
    }

    private fun processIPv4Packet(packet: ByteBuffer, outputStream: FileOutputStream) {
        val protocol = packet.get(9).toInt() and 0xFF

        // UDP (DNS 通常使用 UDP)
        if (protocol == 17) {
            val ipHeaderLength = (packet.get(0).toInt() and 0x0F) * 4

            // 检查目标端口是否是 53 (DNS)
            val destPort = ((packet.getShort(ipHeaderLength + 2).toInt() and 0xFFFF))

            if (destPort == 53) {
                // 提取域名并检查黑名单
                val domain = extractDomainFromDNS(packet, ipHeaderLength + 8)

                if (domain != null && shouldBlockDomain(domain)) {
                    Log.i(TAG, "Blocking domain: $domain")

                    // 发送阻止响应
                    val blockedResponse = createBlockedResponse(packet)
                    outputStream.write(blockedResponse.array(), 0, blockedResponse.limit())
                    return
                }
            }
        }

        // 转发数据包
        outputStream.write(packet.array(), 0, packet.limit())
    }

    private fun extractDomainFromDNS(packet: ByteBuffer, offset: Int): String? {
        // DNS 查询解析
        var currentOffset = offset + 12 // 跳过 DNS 头部
        val domain = StringBuilder()

        try {
            while (currentOffset < packet.limit()) {
                val length = packet.get(currentOffset).toInt() and 0xFF

                if (length == 0) break

                currentOffset++

                if (domain.isNotEmpty()) {
                    domain.append(".")
                }

                for (i in 0 until length) {
                    domain.append(packet.get(currentOffset + i).toInt().toChar())
                }

                currentOffset += length
            }

            return if (domain.isEmpty()) null else domain.toString()
        } catch (e: Exception) {
            return null
        }
    }

    private fun shouldBlockDomain(domain: String): Boolean {
        val lowercased = domain.lowercase()
        return blacklist.any { lowercased == it || lowercased.endsWith(".$it") }
    }

    private fun createBlockedResponse(request: ByteBuffer): ByteBuffer {
        // 创建 DNS 响应（返回 0.0.0.0）
        val response = ByteBuffer.allocate(request.limit())
        response.put(request.array(), 0, request.limit())

        // 修改为响应标志
        response.put(2, 0x81.toByte())
        response.put(3, 0x80.toByte())

        response.flip()
        return response
    }

    override fun onDestroy() {
        isRunning = false
        vpnInterface?.close()
        super.onDestroy()
    }

    // 黑名单管理
    fun addToBlacklist(domain: String) {
        blacklist.add(domain.lowercase())
    }

    fun removeFromBlacklist(domain: String) {
        blacklist.remove(domain.lowercase())
    }
}
\`\`\`

### 第二步：创建 React Native 模块

创建 `DNSVPNModule.kt`:

\`\`\`kotlin
package com.idns

import android.content.Intent
import android.net.VpnService
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.idns.vpn.DNSVPNService

class DNSVPNModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val VPN_REQUEST_CODE = 100
    }

    override fun getName() = "DNSVPNModule"

    @ReactMethod
    fun startVPN(promise: Promise) {
        val intent = VpnService.prepare(reactApplicationContext)

        if (intent != null) {
            // 需要用户授权
            currentActivity?.startActivityForResult(intent, VPN_REQUEST_CODE)
            promise.resolve(false)
        } else {
            // 已授权，直接启动
            startVPNService()
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun stopVPN(promise: Promise) {
        val intent = Intent(reactApplicationContext, DNSVPNService::class.java)
        reactApplicationContext.stopService(intent)
        promise.resolve(null)
    }

    @ReactMethod
    fun getVPNStatus(promise: Promise) {
        // 检查 VPN 是否运行
        // 这里需要实现状态检查逻辑
        promise.resolve(false)
    }

    @ReactMethod
    fun addDomainToBlacklist(domain: String, promise: Promise) {
        // 添加到黑名单
        // 需要通过某种机制通知 VPN Service
        promise.resolve(null)
    }

    private fun startVPNService() {
        val intent = Intent(reactApplicationContext, DNSVPNService::class.java)
        reactApplicationContext.startService(intent)
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
\`\`\`

### 第三步：注册模块

在 `MainApplication.kt` 中注册模块。

### 第四步：配置 AndroidManifest.xml

\`\`\`xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BIND_VPN_SERVICE" />

<service
    android:name=".vpn.DNSVPNService"
    android:permission="android.permission.BIND_VPN_SERVICE">
    <intent-filter>
        <action android:name="android.net.VpnService" />
    </intent-filter>
</service>
\`\`\`

---

## 测试方法

### 1. 测试 VPN 连接

\`\`\`typescript
import vpnService from './services/vpnService';

// 启动 VPN
const started = await vpnService.start();
console.log('VPN started:', started);

// 检查状态
const status = await vpnService.getStatus();
console.log('VPN status:', status);

// 停止 VPN
await vpnService.stop();
\`\`\`

### 2. 测试域名拦截

\`\`\`typescript
// 添加域名到黑名单
await vpnService.addToBlacklist('doubleclick.net');

// 监听 DNS 请求
vpnService.onDNSRequest((event) => {
  console.log('DNS Request:', event);
  // event: { domain, status, category, latency }
});
\`\`\`

### 3. 验证拦截

1. 启动 VPN
2. 访问被拦截的域名（如 doubleclick.net）
3. 检查日志中是否显示拦截记录

---

## 注意事项

1. **iOS 需要付费开发者账号** - Network Extension 需要特定的 entitlements
2. **权限申请** - 首次启动时需要用户授权 VPN 权限
3. **电池消耗** - VPN 会增加电池消耗，需要优化
4. **性能优化** - 数据包处理需要高效，避免影响网络速度
5. **错误处理** - 需要完善的错误处理和恢复机制

---

## 下一步

1. 实现完整的 DNS 解析逻辑
2. 优化数据包处理性能
3. 添加更多过滤规则
4. 实现统计和日志记录
5. 添加网络异常处理

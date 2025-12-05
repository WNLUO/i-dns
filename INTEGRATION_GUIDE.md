# DNS重构集成指南

## 🚀 快速开始

### 步骤1：将DNSCore添加到Xcode项目

由于你的项目使用了Xcode 16的文件系统同步功能，添加文件非常简单：

#### 方法A：移动到现有目录（推荐）

```bash
# 将DNSCore文件移动到DNSPacketTunnelProvider目录
mv ios/DNSCore/* ios/DNSPacketTunnelProvider/

# Xcode会自动检测并添加这些文件
```

#### 方法B：保持独立目录

```bash
# 在Xcode中：
# 1. 右键点击项目根目录
# 2. Add Files to "iDNS"...
# 3. 选择 ios/DNSCore 文件夹
# 4. 确保勾选 "DNSPacketTunnelProvider" target
# 5. 点击 Add
```

---

### 步骤2：创建简化的PacketTunnelProvider

创建新文件 `ios/DNSPacketTunnelProvider/PacketTunnelProviderRefactored.swift`：

```swift
//
//  PacketTunnelProviderRefactored.swift
//  DNSPacketTunnelProvider
//
//  Refactored version using DNSCore modules
//

import NetworkExtension
import os.log

class PacketTunnelProviderRefactored: NEPacketTunnelProvider {

    // MARK: - Properties
    private var dnsEngine: DNSEngine!
    private let logger = OSLog(subsystem: "com.idns.vpn", category: "PacketTunnel")

    // App Group for shared data
    private let appGroupIdentifier = "group.com.idns.wnlluo"
    private var sharedDefaults: UserDefaults?

    // MARK: - Lifecycle

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("Starting DNS VPN tunnel", log: logger, type: .info)

        // Initialize shared storage
        sharedDefaults = UserDefaults(suiteName: appGroupIdentifier)

        // Initialize DNS Engine
        initializeDNSEngine()

        // Configure VPN settings
        let tunnelSettings = createTunnelSettings()

        setTunnelNetworkSettings(tunnelSettings) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                os_log("Failed to set tunnel settings: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                completionHandler(error)
                return
            }

            // Load filter rules
            self.loadFilterRules()

            // Start packet processing
            self.startPacketFlow()

            os_log("DNS VPN tunnel started successfully", log: self.logger, type: .info)
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log("Stopping DNS VPN tunnel: %{public}@", log: logger, type: .info, "\(reason)")

        dnsEngine?.shutdown()
        completionHandler()
    }

    // MARK: - DNS Engine Initialization

    private func initializeDNSEngine() {
        // Use auto-tuned configuration
        let config = DNSConfig.autoTuned(appGroupIdentifier: appGroupIdentifier)

        // Initialize engine
        dnsEngine = DNSEngine(config: config)

        // Set packet output handler
        dnsEngine.packetOutputHandler = { [weak self] response, protocolNumber in
            self?.sendResponsePacket(response, protocolNumber: protocolNumber)
        }

        os_log("DNS Engine initialized: %{public}@", log: logger, type: .info, config.description())
    }

    // MARK: - VPN Configuration

    private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.0.0.1")

        // DNS settings - intercept all DNS traffic
        let dnsSettings = NEDNSSettings(servers: ["8.8.8.8"])
        dnsSettings.matchDomains = [""]  // Intercept all domains
        settings.dnsSettings = dnsSettings

        // IPv4 settings
        let ipv4Settings = NEIPv4Settings(addresses: ["10.0.0.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [
            NEIPv4Route(destinationAddress: "8.8.8.8", subnetMask: "255.255.255.255"),
            NEIPv4Route(destinationAddress: "223.5.5.5", subnetMask: "255.255.255.255")
        ]
        ipv4Settings.excludedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        // MTU
        settings.mtu = 1500

        return settings
    }

    // MARK: - Packet Processing

    private func startPacketFlow() {
        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self else { return }

            for (index, packet) in packets.enumerated() {
                let protocolNumber = protocols[index].uint32Value
                self.processPacket(packet, protocolNumber: protocolNumber)
            }

            // Continue reading
            self.startPacketFlow()
        }
    }

    private func processPacket(_ packet: Data, protocolNumber: UInt32) {
        // Extract UDP payload if this is a DNS query
        guard let udpPayload = extractUDPPayload(from: packet) else {
            return
        }

        // Process DNS query through engine
        dnsEngine.processPacket(udpPayload, protocolNumber: protocolNumber)
    }

    private func extractUDPPayload(from packet: Data) -> Data? {
        // Check minimum size (IPv4 header + UDP header)
        guard packet.count >= 28 else { return nil }

        // Parse IPv4 header
        let ipHeaderLength = Int((packet[0] & 0x0F) * 4)
        guard packet.count >= ipHeaderLength + 8 else { return nil }

        // Check if it's UDP (protocol 17)
        let ipProtocol = packet[9]
        guard ipProtocol == 17 else { return nil }

        // Check if destination port is 53 (DNS)
        let destPortOffset = ipHeaderLength + 2
        guard packet.count >= destPortOffset + 2 else { return nil }
        let destPort = (UInt16(packet[destPortOffset]) << 8) | UInt16(packet[destPortOffset + 1])
        guard destPort == 53 else { return nil }

        // Extract UDP payload (skip IP header + UDP header)
        let udpPayloadOffset = ipHeaderLength + 8
        guard packet.count > udpPayloadOffset else { return nil }

        return packet.subdata(in: udpPayloadOffset..<packet.count)
    }

    private func sendResponsePacket(_ dnsResponse: Data, protocolNumber: UInt32) {
        // In a real implementation, you would need to:
        // 1. Reconstruct IP header (swap src/dest)
        // 2. Reconstruct UDP header (swap ports)
        // 3. Append DNS response
        // 4. Calculate checksums

        // For now, this is a placeholder
        // The full implementation is in the original PacketTunnelProvider.swift
        os_log("Sending DNS response (%d bytes)", log: logger, type: .debug, dnsResponse.count)

        // TODO: Implement full packet reconstruction
        // packetFlow.writePackets([fullPacket], withProtocols: [NSNumber(value: protocolNumber)])
    }

    // MARK: - Filter Rules Management

    private func loadFilterRules() {
        guard let defaults = sharedDefaults else { return }

        // Load blacklist
        if let blacklistData = defaults.data(forKey: "blacklist"),
           let blacklistDict = try? JSONDecoder().decode([String: String].self, from: blacklistData) {
            dnsEngine.updateBlacklist(blacklistDict)
            os_log("Loaded %d blacklist entries", log: logger, type: .info, blacklistDict.count)
        }

        // Load whitelist
        if let whitelistData = defaults.data(forKey: "whitelist"),
           let whitelistArray = try? JSONDecoder().decode([String].self, from: whitelistData) {
            dnsEngine.updateWhitelist(whitelistArray)
            os_log("Loaded %d whitelist entries", log: logger, type: .info, whitelistArray.count)
        }

        // Load child protection setting
        let childProtectionEnabled = defaults.bool(forKey: "childProtectionMode")
        dnsEngine.setChildProtectionEnabled(childProtectionEnabled)
        os_log("Child protection: %{public}@", log: logger, type: .info, childProtectionEnabled ? "enabled" : "disabled")
    }

    // MARK: - Handle Messages from Main App

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        guard let message = try? JSONDecoder().decode(VPNMessage.self, from: messageData) else {
            completionHandler?(nil)
            return
        }

        switch message.type {
        case "updateBlacklist":
            loadFilterRules()
        case "updateWhitelist":
            loadFilterRules()
        case "updateDNS":
            // Update DNS servers
            if let serverURL = message.dnsServer {
                let server = DNSServer(url: serverURL, type: .doh, priority: 1)
                dnsEngine.updateDNSServers([server])
            }
        case "getStatistics":
            let stats = dnsEngine.getStatistics()
            if let data = try? JSONSerialization.data(withJSONObject: stats) {
                completionHandler?(data)
                return
            }
        default:
            break
        }

        completionHandler?(nil)
    }
}

// MARK: - VPN Message Structure

struct VPNMessage: Codable {
    let type: String
    let domain: String?
    let dnsServer: String?
}
```

---

### 步骤3：集成到现有PacketTunnelProvider

如果你想逐步迁移，可以在现有的 `PacketTunnelProvider.swift` 中添加：

```swift
// 在 PacketTunnelProvider.swift 顶部添加

import Foundation

// MARK: - Refactored DNS Engine (可选)

#if USE_REFACTORED_ENGINE

private var dnsEngine: DNSEngine!

private func initializeRefactoredEngine() {
    let config = DNSConfig.autoTuned(appGroupIdentifier: appGroupIdentifier)
    dnsEngine = DNSEngine(config: config)

    dnsEngine.packetOutputHandler = { [weak self] response, protocolNumber in
        self?.sendDNSResponsePacket(response, to: /* original packet info */)
    }
}

private func processPacketWithRefactoredEngine(_ packet: Data) {
    guard let udpPayload = extractUDPPayload(from: packet) else { return }
    dnsEngine.processPacket(udpPayload, protocolNumber: AF_INET)
}

#endif
```

然后在 `project.pbxproj` 或 Build Settings 中添加：
```
Swift Compiler - Custom Flags
Other Swift Flags: -D USE_REFACTORED_ENGINE
```

---

### 步骤4：测试

#### 4.1 编译测试

```bash
# 在终端中
cd ios
xcodebuild -scheme iDNS -configuration Debug build
```

#### 4.2 运行测试

```bash
# 在模拟器或真机上运行
# 启动VPN
# 监控日志

# 查看日志
log stream --predicate 'subsystem == "com.idns.dns"' --level debug
```

#### 4.3 性能测试

使用新引擎的统计功能：

```swift
// 运行一段时间后获取统计
let stats = dnsEngine.getStatistics()

print("""
缓存统计:
- 总命中: \(stats["cache"]["totalHits"])
- 命中率: \(stats["cache"]["hitRate"])
- 热缓存大小: \(stats["cache"]["hotCacheSize"])
- 冷缓存大小: \(stats["cache"]["coldCacheSize"])

过滤统计:
- 总查询: \(stats["filter"]["totalQueries"])
- 拦截查询: \(stats["filter"]["blockedQueries"])
- 拦截率: \(stats["filter"]["blockRate"])

转发器统计:
- 成功: \(stats["forwarder"]["successCount"])
- 失败: \(stats["forwarder"]["failureCount"])
""")
```

---

## 🔧 常见问题

### Q1: 编译错误 "Cannot find type 'DNSEngine' in scope"

**A**: 确保DNSCore文件已添加到 DNSPacketTunnelProvider target。

在Xcode中：
1. 选择任一DNSCore文件
2. 查看右侧 File Inspector
3. 确保 "Target Membership" 中勾选了 "DNSPacketTunnelProvider"

### Q2: 运行时crash "Fatal error: Unexpectedly found nil"

**A**: 检查App Group配置：

```swift
// 确保这个ID与你的Entitlements文件匹配
let appGroupIdentifier = "group.com.idns.wnlluo"

// 验证UserDefaults可以访问
guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
    fatalError("Failed to access app group: \(appGroupIdentifier)")
}
```

### Q3: DNS查询没有响应

**A**: 检查packetOutputHandler是否正确设置：

```swift
// 确保在初始化后立即设置
dnsEngine = DNSEngine(config: config)
dnsEngine.packetOutputHandler = { response, protocolNumber in
    // 这里必须发送响应数据包
    print("Sending response: \(response.count) bytes")
}
```

### Q4: 缓存不工作

**A**: 检查TTL设置：

```swift
// 查看缓存配置
let config = DNSConfigManager.shared.getConfig()
print("""
Cache config:
- Min TTL: \(config.minCacheTTL)
- Max TTL: \(config.maxCacheTTL)
- Hot cache size: \(config.maxHotCacheSize)
- Cold cache size: \(config.maxColdCacheSize)
""")
```

---

## 📊 性能对比

运行以下代码来对比性能：

```swift
func benchmarkCachePerformance() {
    // 旧方案
    var oldCache: [String: Data] = [:]
    let oldStart = Date()
    for i in 0..<1000 {
        oldCache["domain\(i)_1"] = Data()
    }
    for i in 0..<1000 {
        _ = oldCache["domain\(i)_1"]
    }
    let oldTime = Date().timeIntervalSince(oldStart)

    // 新方案
    let newCache = DNSCache()
    let newStart = Date()
    for i in 0..<1000 {
        newCache.set(domain: "domain\(i)", queryType: .A,
                    response: Data(), addresses: [], ttl: 300)
    }
    for i in 0..<1000 {
        _ = newCache.get(domain: "domain\(i)", queryType: .A)
    }
    let newTime = Date().timeIntervalSince(newStart)

    print("""
    Performance comparison:
    Old cache: \(oldTime * 1000)ms
    New cache: \(newTime * 1000)ms
    Speedup: \(oldTime / newTime)x
    """)
}

func benchmarkFilterPerformance() {
    let domains = (0..<1000).map { "test\($0).example.com" }

    // 旧方案（假设线性扫描）
    var blacklist = Set(domains)
    let oldStart = Date()
    for domain in domains {
        _ = blacklist.contains(domain)
    }
    let oldTime = Date().timeIntervalSince(oldStart)

    // 新方案（Trie）
    let filter = DNSFilter()
    for domain in domains {
        filter.addToBlacklist(domain: domain, category: "test")
    }
    let newStart = Date()
    for domain in domains {
        _ = filter.filter(domain: domain)
    }
    let newTime = Date().timeIntervalSince(newStart)

    print("""
    Filter performance:
    Old method: \(oldTime * 1000)ms
    New method (Trie): \(newTime * 1000)ms
    Speedup: \(oldTime / newTime)x
    """)
}
```

---

## 🎯 迁移策略

### 策略A：完全替换（推荐）

1. 备份原 `PacketTunnelProvider.swift`
2. 创建新的 `PacketTunnelProviderRefactored.swift`
3. 更新 `Info.plist` 中的 Principal Class
4. 测试验证
5. 删除旧文件

### 策略B：渐进式迁移

1. 保留原 `PacketTunnelProvider.swift`
2. 添加编译标志 `-D USE_REFACTORED_ENGINE`
3. 在原文件中集成DNSEngine
4. A/B测试两种实现
5. 逐步完全切换

### 策略C：并行运行（最安全）

1. 同时运行两个引擎
2. 对比结果
3. 如果不一致，使用原引擎的结果
4. 记录差异用于调试
5. 确认新引擎稳定后切换

---

## ✅ 验证清单

在部署到生产环境前，确保：

- [ ] 所有DNS查询都能正确解析
- [ ] 黑名单过滤正常工作
- [ ] 白名单优先级正确
- [ ] 缓存命中率符合预期（>60%）
- [ ] 没有内存泄漏
- [ ] 没有crash或异常
- [ ] 日志记录正常
- [ ] 统计数据准确
- [ ] 故障转移正常工作
- [ ] 性能符合或超过原实现

---

## 🚀 部署建议

1. **Alpha测试**（1-2天）
   - 内部测试人员
   - 监控所有指标
   - 快速迭代修复

2. **Beta测试**（1周）
   - 扩大到100-1000用户
   - 收集反馈
   - 性能调优

3. **灰度发布**（1-2周）
   - 10% → 50% → 100%
   - 监控关键指标
   - 准备回滚方案

4. **全量发布**
   - 完全切换到新引擎
   - 删除旧代码
   - 持续监控

---

## 📝 需要帮助？

如果在集成过程中遇到任何问题：

1. 查看 `REFACTORING_SUMMARY.md` 了解架构细节
2. 查看各模块源代码的注释
3. 运行性能基准测试找出瓶颈
4. 使用日志级别 `.debug` 获取详细日志

祝你集成顺利！🎉

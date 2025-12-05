# DNS切换调试指南

## 问题诊断

如果切换DNS后仍在使用之前的DNS，请按以下步骤检查：

### 1. 检查日志输出

在Xcode中查看Console输出，搜索以下关键字：

```
🔄 DNS Configuration Changed
Provider ID: xxx
Protocol: xxx  
DNS Server: xxx
✅ DNS server updated successfully
```

### 2. VPN状态

DNS切换只在VPN**已连接**状态下生效：
- 如果VPN未连接，切换DNS只会更新配置，不会立即生效
- 需要重新连接VPN才能应用新DNS配置

### 3. Swift端日志

在Xcode Console查看PacketTunnelProvider的日志：

```
========================================
🔄 Updating DNS Server
Old DNS: xxx
New DNS: xxx
New Type: doh/dot/udp
✅ DNS update complete, will take effect on next query
========================================
```

### 4. DNS服务器格式

不同协议的DNS服务器格式：

| 协议 | 格式示例 | 检测规则 |
|------|---------|---------|
| DoH | `https://dns.alidns.com/dns-query` | 以`https://`开头 |
| DoT | `dns.alidns.com` | 包含`.`但不是纯IP |
| UDP | `223.5.5.5` | 纯IP地址 |

### 5. 当前实现状态

- ✅ DoH: 完全支持
- ⚠️ DoT: 暂时使用UDP模式（TLS加密待实现）
- ✅ UDP: 完全支持

DoT服务器（如`dns.alidns.com`）当前会通过UDP 53端口查询，而不是TLS 853端口。完整的DoT TLS实现将在后续版本添加。

## 测试步骤

### 快速测试
1. 启动VPN连接
2. 切换到不同的DNS服务商
3. 访问一个新的域名（确保不在缓存中）
4. 检查Xcode Console日志

### 完整测试
1. **启动VPN** → 确认VPN已连接
2. **切换DNS** → 设置 > 切换到其他DNS服务商 > 选择新DNS
3. **查看日志** → Xcode Console应显示DNS更新日志
4. **清除缓存** → 切换DNS后会自动清除DNS缓存
5. **测试查询** → 打开Safari访问新网站
6. **验证延迟** → 在设置中查看当前DNS的延迟

## 常见问题

### Q: 切换后还是用的旧DNS？
A: 检查VPN是否已连接。如果VPN断开后切换，需要重新连接VPN。

### Q: 为什么看不到DoT的TLS加密？
A: 当前DoT暂时使用UDP模式，完整TLS实现即将推出。

### Q: 切换DNS需要重启VPN吗？
A: 不需要！DNS可以热更新，切换后立即生效（下一次查询）。

### Q: 如何确认使用的是哪个DNS？
A: 查看Xcode Console的DNS查询日志，每次查询都会显示使用的DNS类型。

## 调试命令

### 查看当前VPN状态
```swift
let status = await vpnService.getStatus()
print("VPN Status: \(status)")
```

### 手动触发DNS更新
在React Native代码中添加：
```javascript
console.log('Current DNS:', settings.selectedDnsProvider);
console.log('VPN Connected:', isConnected);
```

### 清除DNS缓存
切换DNS时会自动清除，无需手动操作。

## 日志示例

### 成功切换DNS
```
========================================
🔄 DNS Configuration Changed
Provider ID: alidns
Protocol: auto
DNS Server: https://dns.alidns.com/dns-query
📤 Sending DNS update to VPN extension...
========================================
🔄 Updating DNS Server
Old DNS: https://i-dns.wnluo.com/dns-query
Old Type: doh
🧹 Clearing pending states for DNS switch...
✓ Cleared: 0 inflight, 0 pending callbacks, 15 cached
✓ DNS server updated to DoH
🔍 Re-resolving DoH server hostname...
New DNS: https://dns.alidns.com/dns-query
New Type: doh
✅ DNS update complete, will take effect on next query
========================================
✅ DNS server updated successfully
========================================
```

### VPN未连接时切换
```
🔄 DNS Configuration Changed
Provider ID: alidns
⚠️ VPN not connected, DNS will update on next VPN start
```

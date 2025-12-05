# DNS多服务商功能 - 更新说明

## ✅ 已修复的问题

### 1. UI优化
- ✅ 移除了DNS服务商卡片的区域标识（🇨🇳）
- ✅ 当前使用的DNS不再显示延迟信息
- ✅ 只有未选中的DNS服务商显示延迟和健康状态

### 2. DNS切换逻辑修复
- ✅ Swift端增加DoT协议检测
- ✅ 根据DNS URL格式自动识别协议类型
- ✅ 添加DoT查询转发方法

## 🔧 DNS切换工作原理

### 切换流程
1. **用户操作**: 在设置中选择新的DNS服务商
2. **AppContext处理**:
   - 保存新配置到存储
   - 检查VPN连接状态
3. **VPN已连接**:
   - 根据协议选择DNS服务器URL
   - 发送updateDNSServer消息到Swift
4. **Swift端更新**:
   - 清除DNS缓存
   - 检测DNS类型（DoH/DoT/UDP）
   - 更新全局DNS配置
   - 下次查询生效

### DNS URL格式检测

```swift
if dns.hasPrefix("https://") {
    // DoH: https://dns.alidns.com/dns-query
    dnsServerType = "doh"
} else if dns.contains(".") && !is_pure_ip {
    // DoT: dns.alidns.com
    dnsServerType = "dot"
} else {
    // UDP: 223.5.5.5
    dnsServerType = "udp"
}
```

## ⚠️ 重要提示

### VPN连接要求
**DNS切换只在VPN已连接时立即生效**

- VPN连接中 → 热更新DNS，立即生效
- VPN断开时 → 仅保存配置，下次连接时生效

### DoT当前状态
DoT（DNS over TLS）当前使用**简化UDP模式**：
- ✅ 功能正常：可以正常解析DNS
- ⚠️ 未加密：暂时通过UDP 53端口，而非TLS 853端口
- 🚧 待完善：完整的TLS加密支持将在后续版本实现

推荐暂时使用DoH协议获得最佳安全性。

## 📊 协议对比

| 协议 | 端口 | 加密 | 速度 | 当前状态 | 推荐度 |
|------|------|------|------|---------|--------|
| DoH | 443 | ✅ HTTPS | 中等 | ✅ 完整支持 | ⭐⭐⭐⭐⭐ |
| DoT | 853 | ⚠️ TLS | 快 | ⚠️ 简化模式 | ⭐⭐⭐ |
| UDP | 53 | ❌ 无 | 最快 | ✅ 完整支持 | ⭐⭐⭐⭐ |

## 🐛 故障排除

### 问题：切换DNS后没有生效

**检查清单：**
1. ✅ VPN是否已连接？
2. ✅ 查看Xcode Console日志
3. ✅ 访问新网站（避免DNS缓存）
4. ✅ 检查DNS服务商健康状态

### 问题：延迟显示异常

**可能原因：**
- 健康检查间隔较长（默认5分钟）
- DNS服务商网络波动
- 设备网络环境变化

**解决方案：**
- 手动刷新健康检查（展开DNS列表，点击刷新图标）
- 调整健康检查间隔（高级设置）

### 问题：某些DNS显示超时

**正常情况：**
- Cloudflare和Google DNS在国内可能受限
- 国际DNS服务商延迟较高

**建议：**
- 优先选择国内DNS服务商
- 启用自动故障转移

## 📝 测试建议

### 基本测试
```bash
1. 启动VPN
2. 切换到"阿里DNS"
3. 打开Safari访问 www.example.com
4. 检查Xcode日志确认DNS类型
```

### 高级测试
```bash
1. 切换不同协议（DoH/UDP）
2. 测试故障转移（选择超时的DNS）
3. 测试健康检查（等待5分钟查看更新）
4. 测试智能选择（启用后自动选最优）
```

## 🚀 后续计划

### v1.1 (即将推出)
- [ ] DoT完整TLS加密支持
- [ ] 更多DNS服务商
- [ ] DNS查询统计图表
- [ ] 自定义DNS服务器

### v1.2 (规划中)
- [ ] DNS查询历史
- [ ] 按应用选择DNS
- [ ] DNS性能报告
- [ ] 导出DNS配置

## 📚 相关文档

- `DNS_MULTI_PROVIDER_IMPLEMENTATION.md` - 完整实施文档
- `DNS_SWITCHING_DEBUG.md` - 调试指南
- `QUICK_START.md` - 快速开始

---

更新时间: 2025-12-05
版本: v1.0

# DNS多服务商功能 - 快速开始

## ✅ 已完成的功能

### 1. 多DNS服务商支持
- 国内: I-DNS, 腾讯DNS, 阿里DNS, 百度DNS, 114DNS, 360DNS
- 国际: Cloudflare, Google DNS

### 2. 多协议支持
- DoH (DNS over HTTPS)
- DoT (DNS over TLS) 
- UDP (传统DNS)

### 3. 核心功能
- ✅ DNS健康检查（实时延迟监控）
- ✅ 自动故障转移
- ✅ 智能DNS选择
- ✅ 可折叠的UI设计

## 📱 使用方法

### 切换DNS服务商
1. 进入"设置"页面
2. 点击"切换到其他DNS服务商"
3. 选择想要的DNS
4. 自动生效（VPN连接中会热更新）

### 高级设置
1. 展开DNS服务商列表
2. 点击"高级设置"
3. 可配置:
   - 协议选择 (DoH/DoT/UDP)
   - 自动故障转移
   - 备用DNS列表
   - 健康检查间隔
   - 智能优选

## 🏥 健康状态说明

- 🟢 健康: 延迟 < 100ms
- 🟡 较慢: 延迟 100-500ms
- 🔴 超时: 延迟 > 500ms 或无响应
- ⚪ 未检测: 尚未进行健康检查

## 🔧 默认配置

```
主DNS: I-DNS (DoH)
故障转移: 启用
健康检查: 每5分钟
智能选择: 关闭
```

## ⚠️ 重要提示

1. **国际DNS在国内可能受限** (Cloudflare, Google)
2. **DoH协议最安全** (推荐)
3. **健康检查会产生少量流量**
4. **智能选择会覆盖手动选择**

## 📝 文件清单

### 新增文件
- `src/services/dnsHealthCheck.ts` - 健康检查服务
- `src/components/DNSProviderCard.tsx` - DNS卡片组件
- `src/components/DNSProviderSelector.tsx` - DNS选择器
- `src/components/DNSAdvancedSettings.tsx` - 高级设置页面

### 修改文件
- `src/types/index.ts` - 新增类型定义
- `src/constants/index.ts` - DNS服务商配置
- `src/contexts/AppContext.tsx` - 集成健康检查
- `src/services/storage.ts` - 更新默认设置
- `ios/DNSCore/DNSForwarder.swift` - 新增DoT支持
- `ios/DNSCore/DNSConfig.swift` - 支持DoT类型

## 🧪 测试建议

运行应用后测试:
1. 切换不同DNS服务商
2. 查看健康状态更新
3. VPN连接状态下切换DNS
4. 进入高级设置配置选项
5. 测试故障转移（选择一个超时的DNS）

---

详细文档请查看: `DNS_MULTI_PROVIDER_IMPLEMENTATION.md`

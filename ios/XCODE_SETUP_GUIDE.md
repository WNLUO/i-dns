# iOS VPN Extension Xcode 配置指南

本指南将帮助您在 Xcode 中完成 Network Extension Target 的配置。

## 前提条件

- ✅ 已安装 Xcode（最新版本）
- ✅ 有付费的 Apple 开发者账号（Network Extension 需要）
- ✅ 所有源代码文件已创建

## 配置步骤

### 步骤 1: 打开 Xcode 项目

```bash
cd /Users/wnluo/Desktop/code/app/i-dns/ios
open iDNS.xcworkspace
```

### 步骤 2: 创建 Network Extension Target

1. 在 Xcode 中，点击项目导航器中的 `iDNS` 项目
2. 点击左下角的 `+` 按钮添加新 Target
3. 选择 **Network Extension**
4. 在模板选择中，选择 **Packet Tunnel Provider**
5. 配置如下：
   - **Product Name**: `DNSPacketTunnelProvider`
   - **Organization Identifier**: `org.reactjs.native.example`
   - **Bundle Identifier**: `org.reactjs.native.example.iDNS.DNSPacketTunnelProvider`
   - **Language**: Swift
6. 点击 **Finish**
7. 当提示"Activate scheme?"时，点击 **Activate**

### 步骤 3: 删除自动生成的文件，使用我们创建的文件

Xcode 会自动创建 `PacketTunnelProvider.swift`，我们需要删除它并使用我们已创建的文件：

1. 在项目导航器中，找到 `DNSPacketTunnelProvider` 文件夹
2. 删除 Xcode 自动生成的 `PacketTunnelProvider.swift`（移到废纸篓）
3. 右键点击 `DNSPacketTunnelProvider` 文件夹 → **Add Files to "iDNS"...**
4. 导航到 `ios/DNSPacketTunnelProvider/`
5. 选择我们创建的以下文件：
   - `PacketTunnelProvider.swift`
   - `Info.plist`
   - `DNSPacketTunnelProvider.entitlements`
6. 确保勾选 **Target Membership** 为 `DNSPacketTunnelProvider`
7. 点击 **Add**

### 步骤 4: 添加 React Native Bridge 文件到主应用

1. 在项目导航器中，右键点击 `iDNS` 文件夹
2. 创建新的 Group 命名为 `Modules`
3. 在 `Modules` 下创建 Group 命名为 `DNSVPN`
4. 右键点击 `DNSVPN` → **Add Files to "iDNS"...**
5. 导航到 `ios/iDNS/Modules/DNSVPN/`
6. 选择以下文件：
   - `DNSVPNModule.h`
   - `DNSVPNModule.m`
   - `DNSVPNModule.swift`
7. 确保勾选 **Target Membership** 为 `iDNS`（主应用）
8. 点击 **Add**

### 步骤 5: 配置 Swift Bridging Header

1. 选择项目 `iDNS`
2. 选择 Target `iDNS`（主应用）
3. 进入 **Build Settings** 标签
4. 搜索 `Objective-C Bridging Header`
5. 在 `iDNS` target 下，设置值为：
   ```
   iDNS/iDNS-Bridging-Header.h
   ```

### 步骤 6: 配置 Entitlements

#### 主应用 (iDNS Target):

1. 选择 Target `iDNS`
2. 进入 **Signing & Capabilities** 标签
3. 点击 **+ Capability**
4. 添加 **App Groups**
   - 点击 `+` 添加 App Group
   - 输入: `group.org.reactjs.native.example.iDNS`
5. 点击 **+ Capability**
6. 添加 **Network Extensions**
   - 勾选 **Packet Tunnel**
7. 在 **Code Signing Entitlements** 中，设置为:
   ```
   iDNS/iDNS.entitlements
   ```

#### Network Extension (DNSPacketTunnelProvider Target):

1. 选择 Target `DNSPacketTunnelProvider`
2. 进入 **Signing & Capabilities** 标签
3. 点击 **+ Capability**
4. 添加 **App Groups**
   - 点击 `+` 添加 App Group
   - 输入: `group.org.reactjs.native.example.iDNS`（与主应用相同）
5. 点击 **+ Capability**
6. 添加 **Network Extensions**
   - 勾选 **Packet Tunnel**
7. 在 **Code Signing Entitlements** 中，设置为:
   ```
   DNSPacketTunnelProvider/DNSPacketTunnelProvider.entitlements
   ```

### 步骤 7: 配置签名

#### 主应用:

1. 选择 Target `iDNS`
2. 进入 **Signing & Capabilities**
3. **Team**: 选择你的 Apple 开发者账号
4. **Bundle Identifier**: `org.reactjs.native.example.iDNS`
5. 确保 **Automatically manage signing** 已勾选

#### Network Extension:

1. 选择 Target `DNSPacketTunnelProvider`
2. 进入 **Signing & Capabilities**
3. **Team**: 选择相同的 Apple 开发者账号
4. **Bundle Identifier**: `org.reactjs.native.example.iDNS.DNSPacketTunnelProvider`
5. 确保 **Automatically manage signing** 已勾选

### 步骤 8: 配置 Build Settings

#### Network Extension Target:

1. 选择 Target `DNSPacketTunnelProvider`
2. 进入 **Build Settings**
3. 搜索并设置以下项：
   - **iOS Deployment Target**: 14.0（或更高）
   - **Swift Language Version**: Swift 5

### 步骤 9: 确保 Info.plist 正确配置

#### Network Extension Info.plist:

1. 选择 `DNSPacketTunnelProvider/Info.plist`
2. 确认包含以下键值：
   - `NSExtension` → `NSExtensionPointIdentifier`: `com.apple.networkextension.packet-tunnel`
   - `NSExtension` → `NSExtensionPrincipalClass`: `$(PRODUCT_MODULE_NAME).PacketTunnelProvider`

### 步骤 10: 清理并重新构建

1. 选择菜单 **Product** → **Clean Build Folder** (Shift + Cmd + K)
2. 选择 scheme `iDNS`
3. 选择目标设备（真机或模拟器）
4. 点击 **Build** (Cmd + B)

## 验证配置

构建成功后，检查以下内容：

1. ✅ 项目导航器中应该有两个 Target:
   - `iDNS` (主应用)
   - `DNSPacketTunnelProvider` (Network Extension)

2. ✅ 两个 Target 都应该有正确的 Entitlements 文件

3. ✅ 两个 Target 都应该使用相同的 Team 和 App Group

4. ✅ 没有编译错误

## 常见问题

### Q1: 编译错误 "No such module 'React'"

**解决方案**: 确保 Bridging Header 路径正确，并且只在主应用 Target 中设置。

### Q2: VPN 权限被拒绝

**解决方案**:
- 确保使用付费的 Apple 开发者账号
- 确保 Network Extension capability 已正确添加
- 检查 Entitlements 文件配置

### Q3: App Groups 无法创建

**解决方案**:
- 登录 Apple Developer Portal
- 在 Identifiers 中手动创建 App Group
- 刷新 Xcode 的 provisioning profiles

### Q4: 构建失败，提示签名错误

**解决方案**:
- 确保两个 Target 使用相同的 Team
- 尝试手动选择 Provisioning Profile
- 清理 Derived Data 后重新构建

## 下一步

配置完成后：

1. 在真机上测试（模拟器不支持 VPN）
2. 授予 VPN 权限
3. 测试 DNS 拦截功能

## 注意事项

⚠️ **重要**:
- Network Extension 必须在真机上测试，模拟器不支持
- 需要用户授权才能启动 VPN
- 首次运行会弹出系统权限对话框
- 确保两个 Target 的 Bundle Identifier 关系正确（Extension 是主应用的子标识符）

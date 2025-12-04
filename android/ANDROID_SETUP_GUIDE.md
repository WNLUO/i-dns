# Android VPN Service 配置和测试指南

本指南将帮助您配置和测试 Android VPN Service。

## 已完成的配置

✅ 以下文件已自动创建和配置：

### 源代码文件
- `app/src/main/java/com/idns/vpn/DNSVpnService.kt` - VPN Service 实现
- `app/src/main/java/com/idns/vpn/DNSVPNModule.kt` - React Native 模块
- `app/src/main/java/com/idns/vpn/DNSVPNPackage.kt` - React Native Package

### 配置文件
- `app/src/main/AndroidManifest.xml` - 已添加权限和服务声明
- `app/src/main/java/com/idns/MainApplication.kt` - 已注册 VPN Package

## 权限说明

应用已配置以下权限：

1. **INTERNET** - 网络访问
2. **BIND_VPN_SERVICE** - VPN 服务绑定（必需）
3. **FOREGROUND_SERVICE** - 前台服务（Android 9+）
4. **POST_NOTIFICATIONS** - 通知权限（Android 13+）

## 构建和运行

### 方式一：使用 React Native CLI（推荐）

```bash
cd /Users/wnluo/Desktop/code/app/i-dns

# 清理构建缓存
cd android
./gradlew clean
cd ..

# 运行 Android 应用
npx react-native run-android
```

### 方式二：使用 Android Studio

1. 打开 Android Studio
2. 选择 **Open an Existing Project**
3. 导航到 `/Users/wnluo/Desktop/code/app/i-dns/android`
4. 等待 Gradle 同步完成
5. 连接 Android 设备或启动模拟器
6. 点击运行按钮（绿色三角形）

## 测试 VPN 功能

### 1. 授予 VPN 权限

首次启动 VPN 时，Android 会弹出权限对话框：

```
应用想要设置 VPN 连接
```

用户需要点击 **确定** 授权。

### 2. 测试流程

1. **启动应用**
   - 打开 iDNS 应用
   - 点击主页的连接按钮

2. **授权 VPN**
   - 第一次会弹出系统权限对话框
   - 点击 **确定**
   - 应用会自动启动 VPN 服务

3. **验证 VPN 运行**
   - 检查通知栏是否显示 "iDNS 家庭守护" 通知
   - 通知内容应显示 "DNS 拦截服务正在运行"
   - 状态栏应显示 VPN 钥匙图标 🔑

4. **测试 DNS 拦截**
   - 打开浏览器或任何应用
   - 访问包含广告或追踪器的网站
   - 返回 iDNS 应用查看日志标签页
   - 应该能看到被拦截的 DNS 请求

5. **测试统计功能**
   - 查看统计标签页
   - 应该能看到实时更新的：
     - 总请求数
     - 拦截率
     - 24小时趋势图
     - 分类统计

6. **测试黑白名单**
   - 通过设置添加自定义域名到黑名单
   - 访问该域名，应该被拦截
   - 添加到白名单，应该可以访问

## 调试和日志

### 查看应用日志

```bash
# 查看所有 iDNS 相关日志
adb logcat | grep "iDNS\|DNSVpn"

# 查看 VPN Service 日志
adb logcat | grep "DNSVpnService"

# 查看 React Native 日志
adb logcat | grep "ReactNativeJS"
```

### 常见日志输出

```
D/DNSVpnService: VPN Service starting...
D/DNSVpnService: VPN started successfully
D/DNSVpnService: DNS query for: ads.google.com
D/DNSVpnService: Blocking domain: ads.google.com
D/DNSVpnService: Added to blacklist: example.com
```

## 常见问题

### Q1: VPN 无法启动

**可能原因**:
- 用户拒绝了 VPN 权限
- 其他 VPN 应用正在运行

**解决方案**:
```bash
# 检查是否有其他 VPN 连接
adb shell dumpsys vpn

# 重启应用并重新授权
adb shell am force-stop com.idns
adb shell am start -n com.idns/.MainActivity
```

### Q2: 通知不显示

**可能原因**:
- 通知权限未授予（Android 13+）
- 通知渠道未正确创建

**解决方案**:
- 进入系统设置 → 应用 → iDNS → 通知
- 确保通知权限已开启

### Q3: DNS 请求未被记录

**可能原因**:
- VPN 未正确配置
- 数据包解析失败

**解决方案**:
```bash
# 查看 VPN 状态
adb shell dumpsys vpn

# 查看详细日志
adb logcat -s DNSVpnService:V
```

### Q4: 应用崩溃

**解决方案**:
```bash
# 查看崩溃日志
adb logcat | grep "AndroidRuntime"

# 清除应用数据并重新安装
adb shell pm clear com.idns
npx react-native run-android
```

### Q5: 构建失败

**可能原因**:
- Kotlin 版本不兼容
- 依赖冲突

**解决方案**:
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies
cd ..
npx react-native run-android
```

## VPN Service 特性

### 已实现的功能

✅ **DNS 拦截**
- 实时拦截所有 DNS 请求
- 支持黑名单和白名单
- 通配符匹配（例如：*.ads.*）

✅ **域名分类**
- 自动识别广告、追踪器、恶意内容
- 基于关键词的智能分类

✅ **事件通知**
- DNS 请求事件发送到 React Native
- VPN 状态变化通知
- 实时日志记录

✅ **持久化存储**
- 黑白名单保存到 SharedPreferences
- 应用重启后自动加载规则

✅ **前台服务**
- 符合 Android 要求的前台服务
- 持久化通知
- 防止被系统杀死

### 性能优化

- 使用 ByteBuffer 减少内存分配
- 高效的数据包解析算法
- 异步处理避免阻塞主线程

## 测试场景

### 基础测试

1. ✅ VPN 启动和停止
2. ✅ 权限授予流程
3. ✅ 通知显示
4. ✅ VPN 状态持久化

### 功能测试

1. ✅ 拦截广告域名
2. ✅ 白名单优先级
3. ✅ 通配符匹配
4. ✅ 自定义黑白名单

### 集成测试

1. ✅ React Native 桥接
2. ✅ 事件发送
3. ✅ 日志记录
4. ✅ 统计计算

### 压力测试

1. ⏳ 大量并发 DNS 请求
2. ⏳ 长时间运行稳定性
3. ⏳ 内存泄漏检测
4. ⏳ 电池消耗测试

## 下一步

1. 在真实设备上测试
2. 访问各种网站验证拦截功能
3. 检查日志和统计数据
4. 优化性能和电池消耗
5. 添加更多过滤规则

## 注意事项

⚠️ **重要**:

1. **真机测试**:
   - VPN 功能在模拟器上可能有限制
   - 建议使用真实 Android 设备测试

2. **用户权限**:
   - 必须用户手动授权 VPN 权限
   - 无法通过代码自动授权

3. **系统限制**:
   - 同一时间只能运行一个 VPN
   - 其他 VPN 应用会冲突

4. **性能影响**:
   - VPN 会增加电池消耗
   - 需要优化数据包处理逻辑

5. **安全考虑**:
   - 确保 VPN 数据不被泄露
   - 正确处理用户隐私数据

## 参考资料

- [Android VPN Service 官方文档](https://developer.android.com/reference/android/net/VpnService)
- [React Native 原生模块指南](https://reactnative.dev/docs/native-modules-android)
- [Android 前台服务指南](https://developer.android.com/guide/components/foreground-services)

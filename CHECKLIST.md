# 🚀 iDNS 上架前检查清单

## 📝 必须完成的任务

### 1. ICP备案（阻塞项，无此项无法上架）⏰ 需要15-30天
- [ ] 访问 https://beian.miit.gov.cn/ 申请备案
- [ ] 准备材料：营业执照、身份证、域名证书、应用说明
- [ ] 获得备案号后，修改 `src/components/SettingsView.tsx` 第231行
  ```typescript
  备案号：京ICP备XXXXXXXX号-1  // 替换为真实备案号
  ```

### 2. 填写真实联系方式
需要在以下3个文件中替换占位符：

- [ ] `src/components/PrivacyPolicyView.tsx` (第147-150行)
- [ ] `src/components/UserAgreementView.tsx` (第207-210行)
- [ ] `src/components/ChildProtectionRulesView.tsx` (第241-244行)

替换内容：
```
邮箱：[您的联系邮箱] → support@yourdomain.com
地址：[您的公司地址] → 北京市朝阳区XXX路XXX号
```

### 3. 实现法律文档页面跳转
在 `src/components/SettingsView.tsx` 中添加导航逻辑：

```typescript
// 第201-206行：用户协议
<TouchableOpacity onPress={() => {
  // TODO: 导航到 UserAgreementView
}}>

// 第210-215行：隐私政策
<TouchableOpacity onPress={() => {
  // TODO: 导航到 PrivacyPolicyView
}}>

// 第219-224行：儿童保护规则
<TouchableOpacity onPress={() => {
  // TODO: 导航到 ChildProtectionRulesView
}}>
```

---

## ⚠️ 强烈建议完成的任务

### 4. 添加演示数据说明（避免虚假宣传投诉）

在 `src/components/HomeView.tsx` 顶部添加说明：

```typescript
{/* 演示说明横幅 */}
<View style={styles.demoBanner}>
  <Icon name="info" size={16} color="#06b6d4" />
  <Text style={styles.demoText}>
    本应用为网络安全教育工具，数据为演示示例
  </Text>
</View>
```

在 `src/components/StatsView.tsx` 添加说明：

```typescript
<Text style={styles.demoNote}>
  * 数据为演示示例，帮助您了解DNS过滤工作原理
</Text>
```

### 5. 创建首次启动免责声明

创建 `src/components/FirstLaunchModal.tsx`：

```typescript
export const FirstLaunchModal = ({ onAccept }) => {
  return (
    <Modal>
      <Text>重要说明</Text>
      <Text>
        1. 本应用为家庭网络安全教育工具
        2. 界面展示数据为演示示例
        3. 实际网络防护需配合路由器DNS设置
        4. 我们不保证过滤效果的准确性
      </Text>
      <Button onPress={onAccept}>我已了解</Button>
    </Modal>
  );
};
```

### 6. 准备App Store审核材料

创建 `APP_STORE_SUBMISSION.md`：

```markdown
# 审核说明

## 应用分类
教育 - 家庭教育

## 应用描述
iDNS家庭守护是一款网络安全教育工具，帮助家长了解DNS过滤技术，
为孩子营造安全的上网环境。

**重要说明：本应用为教育演示工具，展示数据为示例。**

## 关键词
家庭守护,儿童保护,网络安全,家长控制,DNS教育

## 审核备注
本应用是教育演示工具，不实际拦截网络流量，不是VPN应用。
ICP备案号：[填入您的备案号]
```

### 7. 更新应用截图
- [ ] 在截图上添加"演示数据"水印
- [ ] 准备5-8张截图
- [ ] 突出"家庭守护"和"儿童保护"功能

---

## 🔧 可选优化任务

### 8. 添加DNS配置教程（提升用户价值）

创建 `src/components/TutorialView.tsx`，包含：
- 常见路由器DNS配置方法
- iOS设备DNS设置教程
- Android设备DNS设置教程
- 推荐的家庭友好DNS服务器列表

### 9. 添加教育内容

创建 `src/components/EducationView.tsx`，包含：
- DNS工作原理图解
- 为什么需要DNS过滤
- 家长控制最佳实践
- 儿童上网安全建议

### 10. 数据持久化

虽然是演示数据，但可以保存用户的设置偏好：
- DNS服务器选择
- 儿童保护模式开关
- 通知设置

---

## ⚡ 快速行动方案

如果您希望**尽快上架**，请按以下优先级执行：

### 第1周：必须完成
1. ✅ 申请ICP备案（已完成申请，等待审批）
2. ✅ 填写联系方式（30分钟）
3. ✅ 实现页面跳转（1小时）

### 第2周：强烈建议
4. ✅ 添加演示数据说明（2小时）
5. ✅ 创建首次启动声明（2小时）
6. ✅ 准备审核材料（3小时）

### 第3-4周：等待备案
- 等待ICP备案审批
- 准备应用截图和宣传材料
- 优化UI细节

### 备案通过后：
- 填入备案号
- 提交App Store审核

---

## 📊 当前进度

- [x] 应用定位调整（家庭守护）
- [x] 文案合规化（已清理敏感词汇）
- [x] 法律文档创建（隐私政策、用户协议、儿童保护）
- [x] iOS配置优化
- [x] Android配置优化
- [ ] ICP备案（进行中）
- [ ] 联系方式填写（待完成）
- [ ] 页面跳转实现（待完成）
- [ ] 演示说明添加（待完成）
- [ ] 审核材料准备（待完成）

**完成度：60%**

---

## 🎯 预计时间线

- **当前 → 第1周**：完成必须任务（除ICP备案）
- **第2周**：完成强烈建议任务
- **第3-4周**：等待ICP备案审批
- **第5周**：填入备案号，提交审核
- **第6周**：审核通过，上架

**总计：约6周**（主要时间花在ICP备案上）

---

## ❓ 常见问题

### Q1: 必须有ICP备案才能上架吗？
**A:** 是的，2023年9月起，苹果强制要求中国区应用必须有ICP备案号。

### Q2: ICP备案需要多久？
**A:** 通常15-30个工作日，建议立即开始申请。

### Q3: 这个应用会被认为是VPN吗？
**A:** 不会。代码中没有VPN功能，只要在说明中明确这是教育工具，风险很低。

### Q4: 必须添加演示数据说明吗？
**A:** 虽然不是法律强制要求，但强烈建议添加，避免用户投诉虚假宣传。

### Q5: 可以跳过某些步骤吗？
**A:**
- **不可跳过**：ICP备案、联系方式、页面跳转
- **强烈建议不跳过**：演示说明、首次声明
- **可以跳过**：教程、教育内容（可后续更新）

---

## 📞 需要帮助？

如果在实施过程中遇到问题：

1. **ICP备案问题**：咨询云服务商（阿里云、腾讯云）客服
2. **代码实现问题**：查看 `COMPLIANCE_DEEP_ANALYSIS.md` 详细方案
3. **审核被拒问题**：根据拒绝原因调整说明文档

---

## ✅ 提交前最终检查

在点击"提交审核"前，确认：

- [ ] ICP备案号已填入应用
- [ ] 三个法律文档的联系方式已填写
- [ ] 法律文档可以正常访问
- [ ] 应用描述强调"教育工具"
- [ ] 应用分类选择"教育"
- [ ] 截图添加"演示数据"说明
- [ ] 审核备注说明应用性质
- [ ] 测试应用无崩溃
- [ ] 所有功能可以正常演示

全部打勾后，可以提交审核！

---

**祝您顺利上架！** 🎉

# Apple 审核回复指南 (Guideline 5.4 - VPN Apps)

## 1. 问题分析

**现状：**
*   **审核被拒原因**：Guideline 5.4 - Legal - VPN Apps。你的 App 被识别为 VPN 应用，但你使用的是**个人开发者账号**（Individual Account）。
*   **Apple 规定**：所有提供 VPN 服务的应用，必须由**公司或组织账号**（Company/Organization Account）提交。这是为了确保法律责任主体的明确性，因为 VPN 涉及网络流量代理，敏感度较高。
*   **代码实锤**：你的项目 `ios/DNSPacketTunnelProvider/PacketTunnelProvider.swift` 中使用了 `NEPacketTunnelProvider`。在 Apple 看来，只要使用了 `PacketTunnelProvider` 扩展，无论你的业务逻辑是做 "全量 VPN" 还是 "DNS 代理"，在审核上均被归类为 VPN App。

## 2. 解决方案

目前你有两条路可选，强烈建议选择**方案 A**，这是通过审核的正规路径。

### 方案 A：升级或转移到公司账号（推荐）

这是 Apple 官方要求的唯一正解。

**步骤：**
1.  **注册或升级账号**：
    *   如果你有注册好的公司（营业执照），你可以将当前的个人开发者账号**升级**为公司账号（无需转移 App，直接变更账号性质）。
    *   或者，注册一个新的公司开发者账号。
2.  **邓白氏编码 (D-U-N-S Number)**：注册公司账号需要邓白氏编码，请提前申请。
3.  **转移 App (如果是新账号)**：如果注册了全新的公司账号，需要将该 App 从个人账号转移（Transfer App）到新公司账号下。

**回复 Apple 的策略：**
告知审核人员你已了解规则，并正在进行账号升级/转移流程。

### 方案 B：技术重构（仅适用于纯 DNS 功能，风险较高）
**注意**：如果你的 App 必须保留“黑白名单过滤”、“自定义拦截”等复杂逻辑（目前你在 `PacketTunnelProvider` 里写的那些），这个方案**不适用**，因为只有 Packet Tunnel 或 DNS Proxy Extension 能做到这些，而这两者通常都需要公司账号。

如果你的 App **仅仅**是为了让用户使用 DoH/DoT (加密 DNS)，而不需要本地复杂的拦截逻辑（由服务端拦截）：
*   你可以尝试移除 `PacketTunnelProvider`。
*   改用 `NEDNSSettingsManager`（属于 System Configuration，非 Network Extension 隧道）。
*   这种方式不使用 VPN 隧道，不显示 VPN 图标，通常个人账号可以发布（如主要功能是“配置系统 DNS”）。
*   **代价**：需要重写核心代码，且丢失本地自定义过滤能力。

## 3. 回复模板

根据你的决定，选择下面的回复模板。请根据实际情况修改。

### 情况一：你决定升级/转移账号（最稳妥）

如果你的 App 目前处于“被拒”状态，你可以回复说明你的计划，请求他们暂时保留应用记录，或者直接撤销审核等待账号搞定。

**中文回复建议：**

> 尊敬的 Apple 审核团队：
>
> 感谢您的审核反馈。我们已充分理解 Guideline 5.4 的要求。
>
> 本应用使用了 NEPacketTunnelProvider 以实现核心的安全/DNS 功能，因此确实属于 VPN 类应用。
>
> 我们正在着手将即该应用转移至我们公司的企业开发者账号（或：正在将当前账号升级为组织账号）。我们会尽快完成邓白氏编码的认证和账号迁移工作，并在完成后重新提交审核。
>
> 感谢您的耐心与支持。

**英文回复建议 (Recommended):**

> Dear Apple Review Team,
>
> Thank you for your feedback regarding Guideline 5.4.
>
> We understand that apps using NEPacketTunnelProvider are classified as VPN apps and must be submitted by an organization.
>
> We are currently in the process of transferring this app to our organization's Developer Program account (or: upgrading our current account to an Organization account). We will resubmit the app once the transfer/upgrade is complete and verified.
>
> Thank you for your patience and guidance.

### 情况二：你认为这不是 VPN（仅仅是 DNS），想尝试解释 (成功率极低)

**警告**：只要代码里有 `NEPacketTunnelProvider`，Apple 99% 甚至 100% 会驳回此申诉。除非你确实没有做 VPN 流量代理，且能说服审核人员这只是个“Local Only”的工具，但在目前的审核环境下，个人账号几乎不可能获批 Packet Tunnel 权限。

**如果你非要尝试（不推荐）：**

> Dear Apple Review Team,
>
> We verify that our app uses the Packet Tunnel Provider solely for the purpose of local DNS resolution (handling DNS over HTTPS/TLS) and local filtering to enhance user privacy. We do not tunnel user traffic to remote VPN servers; all non-DNS traffic remains direct.
>
> Given this restricted usage, we respectfully ask if an exception can be made or if we might maintain the current implementation under the individual account.
>
> Best regards.

---

## 4. 总结行动项

1.  **不要**试图通过修改 UI 或隐藏功能来绕过扫描，Info.plist 和 Entitlements 里的 `com.apple.developer.networking.networkextension` 权限是明牌。
2.  **立即**准备公司资质（营业执照）。
3.  **回复 Apple**（使用情况一的模板），表明态度，避免应用被标记为“恶意违规”。

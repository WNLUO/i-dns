/**
 * DNS 过滤规则服务
 * 管理域名黑名单、白名单和分类规则
 */

// 域名分类
export type DomainCategory = 'tracker' | 'ad' | 'content' | 'unknown';

// 过滤规则接口
export interface FilterRule {
  domain: string;
  category: DomainCategory;
  pattern?: string; // 支持通配符匹配
  isWildcard: boolean;
}

/**
 * 默认的广告和追踪域名黑名单
 * 这些是常见的广告和追踪器域名
 */
const DEFAULT_BLACKLIST: FilterRule[] = [
  // 广告域名
  { domain: 'doubleclick.net', category: 'ad', isWildcard: false },
  { domain: 'googleadservices.com', category: 'ad', isWildcard: false },
  { domain: 'googlesyndication.com', category: 'ad', isWildcard: false },
  { domain: 'google-analytics.com', category: 'tracker', isWildcard: false },
  { domain: 'adservice.google.com', category: 'ad', isWildcard: false },
  { domain: 'ads.google.com', category: 'ad', isWildcard: false },
  { domain: 'pagead2.googlesyndication.com', category: 'ad', isWildcard: false },

  // Facebook 追踪
  { domain: 'graph.facebook.com', category: 'tracker', isWildcard: false },
  { domain: 'connect.facebook.net', category: 'tracker', isWildcard: false },
  { domain: 'pixel.facebook.com', category: 'tracker', isWildcard: false },

  // 其他追踪器
  { domain: 'analytics.twitter.com', category: 'tracker', isWildcard: false },
  { domain: 'static.doubleclick.net', category: 'ad', isWildcard: false },
  { domain: 'ad.doubleclick.net', category: 'ad', isWildcard: false },
  { domain: 'crashlytics.com', category: 'tracker', isWildcard: false },

  // 广告网络
  { domain: 'ads.yahoo.com', category: 'ad', isWildcard: false },
  { domain: 'advertising.com', category: 'ad', isWildcard: false },
  { domain: 'admob.com', category: 'ad', isWildcard: false },

  // 常见追踪器通配符
  { domain: '*.ads.*', category: 'ad', pattern: '*.ads.*', isWildcard: true },
  { domain: '*.analytics.*', category: 'tracker', pattern: '*.analytics.*', isWildcard: true },
  { domain: '*.tracking.*', category: 'tracker', pattern: '*.tracking.*', isWildcard: true },
];

/**
 * 儿童保护模式额外的黑名单
 */
const CHILD_PROTECTION_BLACKLIST: FilterRule[] = [
  { domain: 'pornhub.com', category: 'content', isWildcard: false },
  { domain: 'xvideos.com', category: 'content', isWildcard: false },
  { domain: 'xnxx.com', category: 'content', isWildcard: false },
  // 可以添加更多儿童不宜网站
];

/**
 * 过滤规则管理类
 */
class FilterRulesService {
  private customBlacklist: Set<string> = new Set();
  private customWhitelist: Set<string> = new Set();
  private childProtectionEnabled: boolean = false;

  /**
   * 检查域名是否应该被拦截
   */
  shouldBlockDomain(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase().trim();

    // 白名单优先级最高
    if (this.isInWhitelist(normalizedDomain)) {
      return false;
    }

    // 检查自定义黑名单
    if (this.customBlacklist.has(normalizedDomain)) {
      return true;
    }

    // 检查默认黑名单
    if (this.isInDefaultBlacklist(normalizedDomain)) {
      return true;
    }

    // 如果启用了儿童保护模式，检查儿童保护黑名单
    if (this.childProtectionEnabled) {
      if (this.isInChildProtectionBlacklist(normalizedDomain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取域名分类
   */
  getDomainCategory(domain: string): DomainCategory {
    const normalizedDomain = domain.toLowerCase().trim();

    // 检查默认黑名单
    for (const rule of DEFAULT_BLACKLIST) {
      if (this.matchRule(normalizedDomain, rule)) {
        return rule.category;
      }
    }

    // 检查儿童保护黑名单
    if (this.childProtectionEnabled) {
      for (const rule of CHILD_PROTECTION_BLACKLIST) {
        if (this.matchRule(normalizedDomain, rule)) {
          return rule.category;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 匹配规则（支持通配符）
   */
  private matchRule(domain: string, rule: FilterRule): boolean {
    if (!rule.isWildcard) {
      return domain === rule.domain || domain.endsWith('.' + rule.domain);
    }

    // 通配符匹配
    if (rule.pattern) {
      const regex = this.wildcardToRegex(rule.pattern);
      return regex.test(domain);
    }

    return false;
  }

  /**
   * 将通配符模式转换为正则表达式
   */
  private wildcardToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp('^' + regexPattern + '$', 'i');
  }

  /**
   * 检查是否在默认黑名单中
   */
  private isInDefaultBlacklist(domain: string): boolean {
    return DEFAULT_BLACKLIST.some(rule => this.matchRule(domain, rule));
  }

  /**
   * 检查是否在儿童保护黑名单中
   */
  private isInChildProtectionBlacklist(domain: string): boolean {
    return CHILD_PROTECTION_BLACKLIST.some(rule =>
      this.matchRule(domain, rule),
    );
  }

  /**
   * 检查是否在白名单中
   */
  private isInWhitelist(domain: string): boolean {
    // 精确匹配或子域名匹配
    for (const whitelistedDomain of this.customWhitelist) {
      if (
        domain === whitelistedDomain ||
        domain.endsWith('.' + whitelistedDomain)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 添加到自定义黑名单
   */
  addToBlacklist(domain: string): void {
    this.customBlacklist.add(domain.toLowerCase().trim());
  }

  /**
   * 从自定义黑名单移除
   */
  removeFromBlacklist(domain: string): void {
    this.customBlacklist.delete(domain.toLowerCase().trim());
  }

  /**
   * 添加到白名单
   */
  addToWhitelist(domain: string): void {
    this.customWhitelist.add(domain.toLowerCase().trim());
  }

  /**
   * 从白名单移除
   */
  removeFromWhitelist(domain: string): void {
    this.customWhitelist.delete(domain.toLowerCase().trim());
  }

  /**
   * 设置儿童保护模式
   */
  setChildProtectionMode(enabled: boolean): void {
    this.childProtectionEnabled = enabled;
  }

  /**
   * 获取儿童保护模式状态
   */
  isChildProtectionEnabled(): boolean {
    return this.childProtectionEnabled;
  }

  /**
   * 加载自定义规则
   */
  loadCustomRules(blacklist: string[], whitelist: string[]): void {
    this.customBlacklist = new Set(
      blacklist.map(d => d.toLowerCase().trim()),
    );
    this.customWhitelist = new Set(
      whitelist.map(d => d.toLowerCase().trim()),
    );
  }

  /**
   * 获取所有自定义黑名单
   */
  getCustomBlacklist(): string[] {
    return Array.from(this.customBlacklist);
  }

  /**
   * 获取所有自定义白名单
   */
  getCustomWhitelist(): string[] {
    return Array.from(this.customWhitelist);
  }

  /**
   * 清空自定义黑名单
   */
  clearBlacklist(): void {
    this.customBlacklist.clear();
  }

  /**
   * 清空白名单
   */
  clearWhitelist(): void {
    this.customWhitelist.clear();
  }

  /**
   * 获取默认黑名单（仅用于显示）
   */
  getDefaultBlacklist(): FilterRule[] {
    return [...DEFAULT_BLACKLIST];
  }

  /**
   * 获取儿童保护黑名单（仅用于显示）
   */
  getChildProtectionBlacklist(): FilterRule[] {
    return [...CHILD_PROTECTION_BLACKLIST];
  }

  /**
   * 统计信息
   */
  getStats(): {
    customBlacklistCount: number;
    customWhitelistCount: number;
    defaultBlacklistCount: number;
    childProtectionBlacklistCount: number;
    totalRules: number;
  } {
    return {
      customBlacklistCount: this.customBlacklist.size,
      customWhitelistCount: this.customWhitelist.size,
      defaultBlacklistCount: DEFAULT_BLACKLIST.length,
      childProtectionBlacklistCount: CHILD_PROTECTION_BLACKLIST.length,
      totalRules:
        this.customBlacklist.size +
        this.customWhitelist.size +
        DEFAULT_BLACKLIST.length +
        (this.childProtectionEnabled ? CHILD_PROTECTION_BLACKLIST.length : 0),
    };
  }
}

// 导出单例
export const filterRulesService = new FilterRulesService();
export default filterRulesService;

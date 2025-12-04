import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// VPN 原生模块接口
interface VPNNativeModule {
  startVPN: () => Promise<boolean>;
  stopVPN: () => Promise<void>;
  getVPNStatus: () => Promise<boolean>;
  addDomainToBlacklist: (domain: string) => Promise<void>;
  removeDomainFromBlacklist: (domain: string) => Promise<void>;
  addDomainToWhitelist: (domain: string) => Promise<void>;
  removeDomainFromWhitelist: (domain: string) => Promise<void>;
  updateDNSServer: (dnsServer: string) => Promise<void>;
}

// VPN 事件类型
export interface VPNEvent {
  type: 'dns_request' | 'dns_blocked' | 'dns_allowed' | 'vpn_status_changed';
  data: any;
}

// DNS 请求事件
export interface DNSRequestEvent {
  domain: string;
  timestamp: string;
  status: 'blocked' | 'allowed';
  category: string;  // IP address, "已拦截", or "解析失败"
  latency: number;
}

// 获取原生模块
const { DNSVPNModule } = NativeModules;

// 检查模块是否可用
const isModuleAvailable = (): boolean => {
  return DNSVPNModule !== null && DNSVPNModule !== undefined;
};

// 事件发射器
let eventEmitter: NativeEventEmitter | null = null;
if (isModuleAvailable()) {
  eventEmitter = new NativeEventEmitter(DNSVPNModule);
}

/**
 * VPN 服务类
 * 管理 VPN 连接和 DNS 过滤
 */
class VPNService {
  private listeners: Map<string, any> = new Map();

  /**
   * 检查 VPN 模块是否可用
   */
  isAvailable(): boolean {
    return isModuleAvailable();
  }

  /**
   * 启动 VPN 连接
   */
  async start(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return false;
    }

    try {
      const result = await DNSVPNModule.startVPN();
      return result;
    } catch (error) {
      console.error('Failed to start VPN:', error);
      throw error;
    }
  }

  /**
   * 停止 VPN 连接
   */
  async stop(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.stopVPN();
    } catch (error) {
      console.error('Failed to stop VPN:', error);
      throw error;
    }
  }

  /**
   * 获取 VPN 状态
   */
  async getStatus(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const status = await DNSVPNModule.getVPNStatus();
      return status;
    } catch (error) {
      console.error('Failed to get VPN status:', error);
      return false;
    }
  }

  /**
   * 添加域名到黑名单
   */
  async addToBlacklist(domain: string): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.addDomainToBlacklist(domain);
    } catch (error) {
      console.error('Failed to add domain to blacklist:', error);
      throw error;
    }
  }

  /**
   * 从黑名单移除域名
   */
  async removeFromBlacklist(domain: string): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.removeDomainFromBlacklist(domain);
    } catch (error) {
      console.error('Failed to remove domain from blacklist:', error);
      throw error;
    }
  }

  /**
   * 添加域名到白名单
   */
  async addToWhitelist(domain: string): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.addDomainToWhitelist(domain);
    } catch (error) {
      console.error('Failed to add domain to whitelist:', error);
      throw error;
    }
  }

  /**
   * 从白名单移除域名
   */
  async removeFromWhitelist(domain: string): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.removeDomainFromWhitelist(domain);
    } catch (error) {
      console.error('Failed to remove domain from whitelist:', error);
      throw error;
    }
  }

  /**
   * 更新 DNS 服务器
   */
  async updateDNSServer(dnsServer: string): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('VPN module not available');
      return;
    }

    try {
      await DNSVPNModule.updateDNSServer(dnsServer);
    } catch (error) {
      console.error('Failed to update DNS server:', error);
      throw error;
    }
  }

  /**
   * 监听 DNS 请求事件
   */
  onDNSRequest(callback: (event: DNSRequestEvent) => void): () => void {
    if (!eventEmitter) {
      return () => {};
    }

    const subscription = eventEmitter.addListener('DNSRequest', callback);
    const listenerId = Date.now().toString();
    this.listeners.set(listenerId, subscription);

    // 返回取消监听的函数
    return () => {
      subscription.remove();
      this.listeners.delete(listenerId);
    };
  }

  /**
   * 监听 VPN 状态变化
   */
  onVPNStatusChanged(callback: (isConnected: boolean) => void): () => void {
    if (!eventEmitter) {
      return () => {};
    }

    const subscription = eventEmitter.addListener(
      'VPNStatusChanged',
      callback,
    );
    const listenerId = Date.now().toString();
    this.listeners.set(listenerId, subscription);

    // 返回取消监听的函数
    return () => {
      subscription.remove();
      this.listeners.delete(listenerId);
    };
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.listeners.forEach(subscription => {
      subscription.remove();
    });
    this.listeners.clear();
  }
}

// 导出单例
export const vpnService = new VPNService();
export default vpnService;

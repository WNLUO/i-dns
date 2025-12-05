import { DNS_SERVER_MAP } from '../constants';
import { DnsHealthCheck, DnsProtocol, DnsServerConfig } from '../types';

class DNSHealthCheckService {
  private healthData: Map<string, DnsHealthCheck> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 检查单个DNS服务商的健康状态
   */
  async checkProvider(
    providerId: string,
    protocol?: DnsProtocol
  ): Promise<DnsHealthCheck> {
    const config = DNS_SERVER_MAP[providerId];
    if (!config) {
      return {
        providerId,
        latency: -1,
        status: 'unknown',
        lastCheck: new Date().toISOString(),
        protocol: 'udp'
      };
    }

    // 自动选择协议：优先DoH > DoT > UDP
    const selectedProtocol = protocol ||
      (config.doh ? 'doh' : config.dot ? 'dot' : 'udp');

    const startTime = Date.now();

    try {
      // 执行DNS查询测试
      await this.performDNSQuery(config, selectedProtocol);

      const latency = Date.now() - startTime;
      const status = latency < 100 ? 'healthy' :
                     latency < 500 ? 'slow' : 'timeout';

      const health: DnsHealthCheck = {
        providerId,
        latency,
        status,
        lastCheck: new Date().toISOString(),
        protocol: selectedProtocol
      };

      this.healthData.set(providerId, health);
      return health;
    } catch (error) {
      const health: DnsHealthCheck = {
        providerId,
        latency: -1,
        status: 'timeout',
        lastCheck: new Date().toISOString(),
        protocol: selectedProtocol
      };

      this.healthData.set(providerId, health);
      return health;
    }
  }

  /**
   * 执行实际的DNS查询测试
   */
  private async performDNSQuery(
    config: DnsServerConfig,
    protocol: DnsProtocol
  ): Promise<void> {
    const testDomain = 'www.example.com';

    // 根据协议选择服务器地址
    let serverUrl: string | undefined;
    switch (protocol) {
      case 'doh':
        serverUrl = config.doh;
        break;
      case 'dot':
        serverUrl = config.dot;
        break;
      case 'udp':
        serverUrl = config.udp;
        break;
    }

    if (!serverUrl) {
      throw new Error(`Protocol ${protocol} not supported for this provider`);
    }

    // DoH查询测试
    if (protocol === 'doh') {
      // 创建简单的DNS查询包（A记录查询）
      const dnsQuery = this.createDNSQueryPacket(testDomain);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/dns-message',
          'Accept': 'application/dns-message'
        },
        body: dnsQuery,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.arrayBuffer();
      if (data.byteLength === 0) {
        throw new Error('Empty response');
      }
    } else if (protocol === 'udp' || protocol === 'dot') {
      // UDP和DoT需要通过Native模块测试
      // 这里先模拟延迟，实际应该调用VPN服务进行DNS查询
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });
    }
  }

  /**
   * 创建DNS查询包（简化版，仅用于测试）
   */
  private createDNSQueryPacket(domain: string): Uint8Array {
    // DNS查询包格式（简化）
    const labels = domain.split('.');
    let totalLength = 12; // 头部12字节
    labels.forEach(label => {
      totalLength += label.length + 1; // 长度字节 + 标签内容
    });
    totalLength += 5; // 结束标志(1) + QTYPE(2) + QCLASS(2)

    const packet = new Uint8Array(totalLength);
    let offset = 0;

    // DNS Header
    packet[offset++] = 0x00; // ID (high byte)
    packet[offset++] = 0x01; // ID (low byte)
    packet[offset++] = 0x01; // Flags (high byte) - Standard query
    packet[offset++] = 0x00; // Flags (low byte)
    packet[offset++] = 0x00; // QDCOUNT (high)
    packet[offset++] = 0x01; // QDCOUNT (low) - 1 question
    packet[offset++] = 0x00; // ANCOUNT (high)
    packet[offset++] = 0x00; // ANCOUNT (low)
    packet[offset++] = 0x00; // NSCOUNT (high)
    packet[offset++] = 0x00; // NSCOUNT (low)
    packet[offset++] = 0x00; // ARCOUNT (high)
    packet[offset++] = 0x00; // ARCOUNT (low)

    // Question section
    labels.forEach(label => {
      packet[offset++] = label.length;
      for (let i = 0; i < label.length; i++) {
        packet[offset++] = label.charCodeAt(i);
      }
    });
    packet[offset++] = 0x00; // 结束标志

    // QTYPE: A (1)
    packet[offset++] = 0x00;
    packet[offset++] = 0x01;

    // QCLASS: IN (1)
    packet[offset++] = 0x00;
    packet[offset++] = 0x01;

    return packet;
  }

  /**
   * 检查所有DNS服务商的健康状态
   */
  async checkAllProviders(): Promise<Map<string, DnsHealthCheck>> {
    const providerIds = Object.keys(DNS_SERVER_MAP);
    const promises = providerIds.map(providerId => this.checkProvider(providerId));

    await Promise.allSettled(promises); // 使用allSettled避免单个失败影响整体
    return this.healthData;
  }

  /**
   * 获取指定服务商的健康数据
   */
  getHealthData(providerId: string): DnsHealthCheck | undefined {
    return this.healthData.get(providerId);
  }

  /**
   * 获取所有健康数据
   */
  getAllHealthData(): Map<string, DnsHealthCheck> {
    return this.healthData;
  }

  /**
   * 启动周期性健康检查
   */
  startPeriodicCheck(intervalSeconds: number): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkAllProviders().catch(error => {
        console.error('Periodic health check failed:', error);
      });
    }, intervalSeconds * 1000);

    // 立即执行一次
    this.checkAllProviders().catch(error => {
      console.error('Initial health check failed:', error);
    });
  }

  /**
   * 停止周期性健康检查
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 获取最优DNS服务商（延迟最低且状态为healthy）
   */
  getBestProvider(): string | null {
    let bestProviderId: string | null = null;
    let bestLatency = Infinity;

    this.healthData.forEach((health, providerId) => {
      if (health.status === 'healthy' && health.latency > 0 && health.latency < bestLatency) {
        bestLatency = health.latency;
        bestProviderId = providerId;
      }
    });

    return bestProviderId;
  }

  /**
   * 清除健康数据
   */
  clearHealthData(): void {
    this.healthData.clear();
  }
}

export default new DNSHealthCheckService();

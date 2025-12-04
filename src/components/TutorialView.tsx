import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { responsive } from '../utils/responsive';

interface TutorialSection {
  id: string;
  icon: string;
  title: string;
  content: TutorialItem[];
}

interface TutorialItem {
  step?: string;
  title: string;
  description: string;
  note?: string;
}

const TUTORIAL_DATA: TutorialSection[] = [
  {
    id: 'intro',
    icon: 'book-open',
    title: 'DNS 工作原理',
    content: [
      {
        title: '什么是 DNS？',
        description:
          'DNS (Domain Name System) 是互联网的"电话簿"，将人类可读的域名（如 example.com）转换为计算机可识别的 IP 地址。',
      },
      {
        title: 'DNS 过滤原理',
        description:
          '通过配置特定的 DNS 服务器，可以在域名解析阶段拦截不良网站、广告和追踪器，从而保护家庭网络安全。',
      },
      {
        title: '为什么需要 DNS 过滤？',
        description:
          '• 保护儿童远离不适宜内容\n• 拦截广告和追踪器，保护隐私\n• 防止访问恶意网站和钓鱼网站\n• 提升浏览体验，节省流量',
      },
    ],
  },
  {
    id: 'router',
    icon: 'wifi',
    title: '路由器 DNS 配置',
    content: [
      {
        step: '1',
        title: '登录路由器管理界面',
        description: '在浏览器中输入路由器IP地址（通常是 192.168.1.1 或 192.168.0.1），使用管理员账号密码登录。',
      },
      {
        step: '2',
        title: '找到 DNS 设置',
        description: '在"网络设置"、"WAN设置"或"DHCP设置"中找到 DNS 服务器配置选项。',
      },
      {
        step: '3',
        title: '配置 DNS 服务器',
        description: '输入家庭友好的 DNS 服务器地址：',
        note: '首选DNS：94.140.14.14 (AdGuard家庭保护)\n备用DNS：1.1.1.3 (Cloudflare家庭版)',
      },
      {
        step: '4',
        title: '保存并重启',
        description: '保存设置后，重启路由器使配置生效。所有连接到该路由器的设备都将使用新的 DNS 设置。',
      },
    ],
  },
  {
    id: 'ios',
    icon: 'smartphone',
    title: 'iOS 设备配置',
    content: [
      {
        step: '1',
        title: '打开设置',
        description: '在 iPhone 或 iPad 上打开"设置"应用。',
      },
      {
        step: '2',
        title: '选择 Wi-Fi',
        description: '点击"Wi-Fi"，找到当前连接的网络，点击右侧的"ℹ️"图标。',
      },
      {
        step: '3',
        title: '配置 DNS',
        description: '向下滚动找到"配置 DNS"，点击进入，选择"手动"。',
      },
      {
        step: '4',
        title: '添加服务器',
        description: '删除现有服务器，添加：',
        note: '94.140.14.14\n1.1.1.3',
      },
      {
        step: '5',
        title: '保存设置',
        description: '点击右上角"存储"保存配置，设置立即生效。',
      },
    ],
  },
  {
    id: 'android',
    icon: 'smartphone',
    title: 'Android 设备配置',
    content: [
      {
        step: '1',
        title: '打开设置',
        description: '打开 Android 手机的"设置"应用。',
      },
      {
        step: '2',
        title: '网络和互联网',
        description: '点击"网络和互联网"或"Wi-Fi"选项。',
      },
      {
        step: '3',
        title: '选择网络',
        description: '长按当前连接的 Wi-Fi 网络，选择"修改网络"。',
      },
      {
        step: '4',
        title: '高级选项',
        description: '展开"高级选项"，找到"IP 设置"，改为"静态"。',
      },
      {
        step: '5',
        title: '配置 DNS',
        description: '在 DNS 1 和 DNS 2 字段中分别输入：',
        note: 'DNS 1: 94.140.14.14\nDNS 2: 1.1.1.3',
      },
      {
        step: '6',
        title: '保存设置',
        description: '点击"保存"，设置立即生效。',
      },
    ],
  },
  {
    id: 'servers',
    icon: 'server',
    title: '推荐 DNS 服务器',
    content: [
      {
        title: 'AdGuard DNS 家庭保护',
        description: 'DNS: 94.140.14.14\n功能: 拦截广告、追踪器和成人内容',
        note: '适合有儿童的家庭使用',
      },
      {
        title: 'Cloudflare 家庭版',
        description: 'DNS: 1.1.1.3\n功能: 拦截恶意软件和成人内容',
        note: '速度快，隐私保护好',
      },
      {
        title: 'Google DNS',
        description: 'DNS: 8.8.8.8\n功能: 基础DNS解析，无过滤',
        note: '适合需要基础DNS服务的场景',
      },
      {
        title: 'NextDNS',
        description: '网址: nextdns.io\n功能: 高度可定制的DNS过滤',
        note: '可自定义拦截规则，适合高级用户',
      },
    ],
  },
  {
    id: 'tips',
    icon: 'alert-circle',
    title: '注意事项',
    content: [
      {
        title: 'DNS 过滤的局限性',
        description: '• DNS 过滤只能在域名解析阶段生效\n• 无法拦截已经建立的连接\n• 某些应用可能使用内置 DNS\n• 需要配合其他家长控制工具',
      },
      {
        title: '配置后的验证',
        description: '• 访问测试网站确认过滤生效\n• 检查网络速度是否正常\n• 确认家庭成员设备都已配置\n• 定期检查配置是否还在',
      },
      {
        title: '遇到问题时',
        description: '• 检查 DNS 地址是否输入正确\n• 尝试重启路由器和设备\n• 清除设备 DNS 缓存\n• 联系 DNS 服务提供商支持',
      },
      {
        title: '最佳实践',
        description: '• 在路由器统一配置（覆盖所有设备）\n• 定期更新 DNS 服务器列表\n• 与孩子沟通网络安全知识\n• 配合使用家长控制功能',
      },
    ],
  },
];

export const TutorialView: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>('intro');

  const toggleSection = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Icon name="book" size={32} color="#3b82f6" />
        </View>
        <Text style={styles.title}>使用教程</Text>
        <Text style={styles.subtitle}>
          了解 DNS 过滤原理，配置家庭网络防护
        </Text>
      </View>

      {TUTORIAL_DATA.map(section => (
        <View key={section.id} style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection(section.id)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIcon}>
                <Icon name={section.icon as any} size={20} color="#3b82f6" />
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Icon
              name={expandedId === section.id ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#64748b"
            />
          </TouchableOpacity>

          {expandedId === section.id && (
            <View style={styles.sectionContent}>
              {section.content.map((item, index) => (
                <View key={index} style={styles.item}>
                  {item.step && (
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepText}>{item.step}</Text>
                    </View>
                  )}
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDescription}>
                      {item.description}
                    </Text>
                    {item.note && (
                      <View style={styles.noteContainer}>
                        <Icon name="info" size={14} color="#06b6d4" />
                        <Text style={styles.noteText}>{item.note}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 提示：配置 DNS 不会影响网络速度，反而可能因拦截广告而提升浏览体验
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    alignItems: 'center',
    padding: responsive(24),
    paddingTop: responsive(16),
  },
  iconContainer: {
    width: responsive(64),
    height: responsive(64),
    borderRadius: responsive(32),
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsive(16),
  },
  title: {
    fontSize: responsive(24),
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: responsive(8),
  },
  subtitle: {
    fontSize: responsive(14),
    color: '#94a3b8',
    textAlign: 'center',
  },
  section: {
    marginBottom: responsive(12),
    marginHorizontal: responsive(16),
    backgroundColor: '#1e293b',
    borderRadius: responsive(16),
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: responsive(16),
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionIcon: {
    width: responsive(36),
    height: responsive(36),
    borderRadius: responsive(8),
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: responsive(12),
  },
  sectionTitle: {
    fontSize: responsive(16),
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  sectionContent: {
    padding: responsive(16),
    paddingTop: 0,
  },
  item: {
    flexDirection: 'row',
    marginBottom: responsive(20),
  },
  stepBadge: {
    width: responsive(28),
    height: responsive(28),
    borderRadius: responsive(14),
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: responsive(12),
    marginTop: responsive(2),
  },
  stepText: {
    fontSize: responsive(14),
    fontWeight: '700',
    color: '#ffffff',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: responsive(15),
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: responsive(6),
  },
  itemDescription: {
    fontSize: responsive(14),
    color: '#cbd5e1',
    lineHeight: responsive(20),
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: responsive(8),
    padding: responsive(10),
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: responsive(8),
    borderLeftWidth: 3,
    borderLeftColor: '#06b6d4',
  },
  noteText: {
    flex: 1,
    fontSize: responsive(13),
    color: '#06b6d4',
    marginLeft: responsive(8),
    lineHeight: responsive(18),
  },
  footer: {
    margin: responsive(16),
    marginTop: responsive(8),
    padding: responsive(16),
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: responsive(12),
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  footerText: {
    fontSize: responsive(13),
    color: '#3b82f6',
    lineHeight: responsive(18),
    textAlign: 'center',
  },
});

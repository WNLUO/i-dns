import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { scaleWidth, scaleFont, scaleSpacing } from '../utils/responsive';
import { useThemeColors } from '../styles/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    title: 'iDNS 简介',
    content: [
      {
        title: '什么是 iDNS？',
        description:
          'iDNS 家庭守护是一款专为家庭设计的网络安全应用，使用先进的 DNS-over-HTTPS 技术，帮助您保护家人的网络安全。',
      },
      {
        title: 'iDNS 如何工作？',
        description:
          '应用通过自有的加密 DNS 服务器（i-dns.wnluo.com）处理您的网络请求，在域名解析阶段自动拦截不良内容、广告和恶意网站。',
      },
      {
        title: 'iDNS 的优势',
        description:
          '• 一键开启，自动保护全设备\n• 保护儿童远离不适宜内容\n• 拦截广告和追踪器，保护隐私\n• 实时统计，了解守护效果\n• 本地存储，数据更安全',
      },
    ],
  },
  {
    id: 'start',
    icon: 'play-circle',
    title: '快速开始',
    content: [
      {
        step: '1',
        title: '首次使用',
        description: '首次打开应用时，请仔细阅读《用户协议》和《隐私政策》，点击"同意并继续"。',
      },
      {
        step: '2',
        title: '启动守护',
        description: '在首页点击中央的盾牌按钮，即可一键开启网络守护。应用将自动配置 DNS 设置。',
        note: '首次启动需要授予 VPN 配置权限，这是 iOS 系统要求，iDNS 不会建立真正的 VPN 连接。',
      },
      {
        step: '3',
        title: '查看效果',
        description: '开启守护后，应用会实时显示延迟、已过滤和安全访问的请求数量，让您了解守护效果。',
      },
      {
        step: '4',
        title: '正常使用',
        description: '守护开启后，您可以正常使用设备上网。应用会在后台默默守护，无需任何额外操作。',
      },
    ],
  },
  {
    id: 'features',
    icon: 'grid',
    title: '功能介绍',
    content: [
      {
        title: '首页',
        description: '• 一键开关守护功能\n• 实时查看连接状态和延迟\n• 查看今日已过滤、安全访问统计\n• 显示总请求数和拦截率',
      },
      {
        title: '统计页面',
        description: '• 查看总请求数和拦截率\n• 过去24小时请求趋势图表\n• 守护效率评分\n• 详细的守护数据统计',
      },
      {
        title: '日志页面',
        description: '• 实时查看所有 DNS 查询记录\n• 查看已过滤和安全通过的域名\n• 搜索特定域名记录\n• 按状态筛选日志',
      },
      {
        title: '设置页面',
        description: '• 查看当前 DNS 服务商信息\n• 设置日志保留时间\n• 清除历史日志\n• 查看法律文档和使用教程',
      },
    ],
  },
  {
    id: 'logs',
    icon: 'file-text',
    title: '日志管理',
    content: [
      {
        title: '查看日志',
        description: '在日志页面可以查看所有 DNS 查询记录，包括域名、IP地址、时间和延迟信息。',
      },
      {
        title: '搜索功能',
        description: '使用顶部搜索框可以快速查找特定域名的访问记录，方便排查问题。',
      },
      {
        title: '筛选日志',
        description: '通过"全部"、"已过滤"、"安全通过"按钮可以快速筛选不同类型的日志记录。',
      },
      {
        title: '日志保留',
        description: '在设置中可以选择日志保留时间（1天、3天、7天或30天），过期日志会自动清理。',
        note: '日志数据仅保存在您的设备本地，不会上传到服务器。',
      },
    ],
  },
  {
    id: 'dns',
    icon: 'server',
    title: 'DNS 服务说明',
    content: [
      {
        title: 'I-DNS 服务器',
        description: 'iDNS 使用自有的 DNS-over-HTTPS 服务器（i-dns.wnluo.com），为您提供安全、快速的 DNS 解析服务。',
        note: '服务器部署在国内，访问速度快，延迟低。',
      },
      {
        title: 'HTTPS 加密',
        description: '所有 DNS 查询都通过加密的 HTTPS 协议传输，确保您的查询不会被第三方截获或篡改。',
      },
      {
        title: '智能过滤',
        description: '服务器内置智能过滤规则，可以自动拦截广告、追踪器、恶意网站和不适宜内容。',
      },
      {
        title: '隐私保护',
        description: 'DNS 查询实时处理，不做永久保存。统计数据仅在您的设备本地存储，充分保护您的隐私。',
        note: '我们不会收集、分析或出售您的 DNS 查询记录。',
      },
    ],
  },
  {
    id: 'faq',
    icon: 'help-circle',
    title: '常见问题',
    content: [
      {
        title: '为什么需要 VPN 权限？',
        description: 'iOS 系统要求使用网络扩展（Network Extension）功能时必须请求 VPN 配置权限。iDNS 只是借用这个接口来配置 DNS，不会建立真正的 VPN 连接，也不会路由您的网络流量。',
      },
      {
        title: '会影响网速吗？',
        description: 'iDNS 只处理 DNS 查询，不会影响您的正常网络速度。由于服务器部署在国内，DNS 解析速度反而可能更快。拦截广告后，还能节省流量，提升浏览速度。',
      },
      {
        title: '可以完全拦截所有不良内容吗？',
        description: 'DNS 过滤是在域名解析阶段进行的，可以有效拦截大部分不良网站。但无法做到 100% 完美，建议配合家长监督和其他家长控制工具一起使用。',
      },
      {
        title: '为什么有些网站打不开？',
        description: '如果某个正常网站被误拦截，可能是该域名在过滤列表中。您可以在日志中查看被拦截的域名，并通过邮箱联系我们报告误判。',
      },
      {
        title: '数据安全吗？',
        description: '所有 DNS 查询都通过 HTTPS 加密传输，查询记录不做永久保存。统计数据仅在您的设备本地存储，我们无法访问您的浏览记录。',
      },
    ],
  },
];

interface TutorialViewProps {
  onClose?: () => void;
}

export const TutorialView: React.FC<TutorialViewProps> = ({ onClose }) => {
  const [expandedId, setExpandedId] = useState<string | null>('intro');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const toggleSection = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header with Close Button */}
      {onClose && (
        <View style={[styles.topHeader, {
          paddingTop: Math.max(insets.top, 20),
          backgroundColor: colors.background.primary,
          borderBottomColor: colors.border.subtle,
          borderBottomWidth: 1,
        }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="x" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.info + '10' }]}>
            <Icon name="book" size={32} color={colors.info} />
          </View>
          <Text style={[styles.title, { color: colors.text.primary }]}>使用教程</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            了解 iDNS 功能，开启家庭网络守护
          </Text>
        </View>

        {TUTORIAL_DATA.map(section => (
          <View key={section.id} style={[styles.section, { backgroundColor: colors.background.elevated }]}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.id)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.info + '10' }]}>
                  <Icon name={section.icon as any} size={20} color={colors.info} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{section.title}</Text>
              </View>
              <Icon
                name={expandedId === section.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.text.tertiary}
              />
            </TouchableOpacity>

            {expandedId === section.id && (
              <View style={styles.sectionContent}>
                {section.content.map((item, index) => (
                  <View key={index} style={styles.item}>
                    {item.step && (
                      <View style={[styles.stepBadge, { backgroundColor: colors.info }]}>
                        <Text style={styles.stepText}>{item.step}</Text>
                      </View>
                    )}
                    <View style={styles.itemContent}>
                      <Text style={[styles.itemTitle, { color: colors.text.primary }]}>{item.title}</Text>
                      <Text style={[styles.itemDescription, { color: colors.text.secondary }]}>
                        {item.description}
                      </Text>
                      {item.note && (
                        <View style={[styles.noteContainer, { backgroundColor: colors.info + '10', borderLeftColor: colors.info }]}>
                          <Icon name="info" size={14} color={colors.info} />
                          <Text style={[styles.noteText, { color: colors.info }]}>{item.note}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={[styles.footer, { backgroundColor: colors.info + '10', borderColor: colors.info + '40' }]}>
          <Text style={[styles.footerText, { color: colors.info }]}>
            💡 如有疑问或建议，欢迎通过邮箱 admin@wnluo.com 联系我们
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    paddingHorizontal: scaleSpacing(20),
    paddingBottom: scaleSpacing(12),
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    paddingTop: scaleSpacing(16),
  },
  header: {
    alignItems: 'center',
    padding: scaleSpacing(24),
    paddingTop: scaleSpacing(0),
  },
  iconContainer: {
    width: scaleWidth(64),
    height: scaleWidth(64),
    borderRadius: scaleWidth(32),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: scaleSpacing(16),
  },
  title: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    marginBottom: scaleSpacing(8),
  },
  subtitle: {
    fontSize: scaleFont(14),
    textAlign: 'center',
  },
  section: {
    marginBottom: scaleSpacing(12),
    marginHorizontal: scaleSpacing(16),
    borderRadius: scaleSpacing(16),
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: scaleSpacing(16),
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionIcon: {
    width: scaleWidth(36),
    height: scaleWidth(36),
    borderRadius: scaleSpacing(8),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scaleSpacing(12),
  },
  sectionTitle: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    flex: 1,
  },
  sectionContent: {
    padding: scaleSpacing(16),
    paddingTop: 0,
  },
  item: {
    flexDirection: 'row',
    marginBottom: scaleSpacing(20),
  },
  stepBadge: {
    width: scaleWidth(28),
    height: scaleWidth(28),
    borderRadius: scaleWidth(14),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scaleSpacing(12),
    marginTop: scaleSpacing(2),
  },
  stepText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    color: '#ffffff',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    marginBottom: scaleSpacing(6),
  },
  itemDescription: {
    fontSize: scaleFont(14),
    lineHeight: scaleFont(20),
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: scaleSpacing(8),
    padding: scaleSpacing(10),
    borderRadius: scaleSpacing(8),
    borderLeftWidth: 3,
  },
  noteText: {
    flex: 1,
    fontSize: scaleFont(13),
    marginLeft: scaleSpacing(8),
    lineHeight: scaleFont(18),
  },
  footer: {
    margin: scaleSpacing(16),
    marginTop: scaleSpacing(8),
    padding: scaleSpacing(16),
    borderRadius: scaleSpacing(12),
    borderWidth: 1,
  },
  footerText: {
    fontSize: scaleFont(13),
    lineHeight: scaleFont(18),
    textAlign: 'center',
  },
});

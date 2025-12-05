import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getPagePadding } from '../utils/responsive';

interface PrivacyPolicyViewProps {
  onClose?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="x" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>隐私政策</Text>
        <Text style={styles.updateDate}>更新日期：2025年12月</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: Math.max(insets.bottom, 20) + 20 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>引言</Text>
          <Text style={styles.paragraph}>
            欢迎使用iDNS家庭守护应用（以下简称"本应用"）。我们非常重视您的隐私保护和个人信息安全。本隐私政策将向您说明我们如何收集、使用、储存和保护您的信息。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>一、我们收集的信息</Text>
          <Text style={styles.paragraph}>
            1.1 设备信息{'\n'}
            为了提供DNS服务，我们会收集您的设备型号、操作系统版本等基本信息。
          </Text>
          <Text style={styles.paragraph}>
            1.2 网络信息{'\n'}
            我们会处理DNS查询请求以提供过滤服务，但不会永久存储您访问的具体网站信息。
          </Text>
          <Text style={styles.paragraph}>
            1.3 使用统计{'\n'}
            我们会统计已过滤和安全访问的请求数量，用于向您展示守护效果。这些统计数据仅在本地存储。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>二、儿童个人信息保护</Text>
          <Text style={styles.paragraph}>
            2.1 我们高度重视儿童个人信息保护。本应用提供儿童保护模式，帮助家长过滤不适宜内容。
          </Text>
          <Text style={styles.paragraph}>
            2.2 我们不会主动收集14周岁以下儿童的个人信息。如果您是儿童的监护人，请在监督下使用本应用。
          </Text>
          <Text style={styles.paragraph}>
            2.3 详细的儿童个人信息保护规则请参阅《儿童个人信息保护规则》。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>三、信息的使用</Text>
          <Text style={styles.paragraph}>
            3.1 提供DNS过滤服务{'\n'}
            我们使用收集的信息来提供DNS查询和内容过滤服务。
          </Text>
          <Text style={styles.paragraph}>
            3.2 改进服务{'\n'}
            我们会分析匿名化的统计数据来改进服务质量。
          </Text>
          <Text style={styles.paragraph}>
            3.3 安全保障{'\n'}
            我们使用信息来检测和防止欺诈、滥用等违法行为。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>四、信息的存储与保护</Text>
          <Text style={styles.paragraph}>
            4.1 本地存储{'\n'}
            您的使用偏好和统计数据主要存储在您的设备本地。
          </Text>
          <Text style={styles.paragraph}>
            4.2 数据安全{'\n'}
            我们采取加密传输、访问控制等技术措施保护您的信息安全。
          </Text>
          <Text style={styles.paragraph}>
            4.3 境内存储{'\n'}
            根据中国法律要求，您的个人信息存储在中国境内的服务器。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>五、信息共享与披露</Text>
          <Text style={styles.paragraph}>
            5.1 我们不会向第三方出售您的个人信息。
          </Text>
          <Text style={styles.paragraph}>
            5.2 DNS查询处理{'\n'}
            本应用使用自有的DNS-over-HTTPS服务器（i-dns.wnluo.com）处理DNS查询。所有DNS查询均通过加密的HTTPS协议传输，确保您的DNS查询不会被第三方截获。我们不会与其他第三方DNS服务提供商共享您的DNS查询信息。
          </Text>
          <Text style={styles.paragraph}>
            5.3 法律要求{'\n'}
            在法律法规要求或政府机关依法要求的情况下，我们会披露必要的信息。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>六、您的权利</Text>
          <Text style={styles.paragraph}>
            6.1 访问和更正{'\n'}
            您可以在应用设置中查看和修改您的信息。
          </Text>
          <Text style={styles.paragraph}>
            6.2 删除{'\n'}
            您可以卸载应用以删除本地存储的所有数据。
          </Text>
          <Text style={styles.paragraph}>
            6.3 撤回同意{'\n'}
            您可以随时在设置中关闭相关功能。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>七、政策更新</Text>
          <Text style={styles.paragraph}>
            我们可能会不时更新本隐私政策。更新后的政策将在应用内发布，并在您继续使用时生效。重大变更我们会通过应用内通知等方式告知您。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>八、联系我们</Text>
          <Text style={styles.paragraph}>
            如您对本隐私政策有任何疑问、意见或建议，请通过以下方式联系我们：{'\n'}
            {'\n'}
            邮箱：admin@wnluo.com{'\n'}
            地址：贵州省贵阳市贵州师范大学
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: getPagePadding(),
    paddingBottom: responsive.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: responsive.fontSize['4xl'],
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  updateDate: {
    fontSize: responsive.fontSize.sm,
    color: '#64748b',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: getPagePadding(),
    paddingTop: responsive.spacing.xl,
  },
  section: {
    marginBottom: responsive.spacing.xl,
  },
  sectionTitle: {
    fontSize: responsive.fontSize.lg,
    fontWeight: '600',
    color: '#06b6d4',
    marginBottom: responsive.spacing.md,
  },
  paragraph: {
    fontSize: responsive.fontSize.base,
    color: '#94a3b8',
    lineHeight: 24,
    marginBottom: responsive.spacing.sm,
  },
});

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getPagePadding } from '../utils/responsive';

interface ChildProtectionRulesViewProps {
  onClose?: () => void;
}

export const ChildProtectionRulesView: React.FC<ChildProtectionRulesViewProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="x" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>儿童个人信息保护规则</Text>
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
            iDNS家庭守护（以下简称"我们"）深知儿童个人信息和隐私安全的重要性。根据《中华人民共和国未成年人保护法》《中华人民共和国网络安全法》《儿童个人信息网络保护规定》等法律法规，我们制定本《儿童个人信息保护规则》（以下简称"本规则"）。
          </Text>
          <Text style={styles.paragraph}>
            本规则适用于14周岁以下的儿童用户。如果您是儿童用户的监护人，请您仔细阅读和选择是否同意本规则。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>一、监护人特别说明</Text>
          <Text style={styles.paragraph}>
            1.1 若您的被监护人使用我们的服务，我们将依法保护被监护人的个人信息。
          </Text>
          <Text style={styles.paragraph}>
            1.2 我们建议儿童在监护人的陪同和指导下使用本应用。
          </Text>
          <Text style={styles.paragraph}>
            1.3 如果您是儿童的监护人，请您确认您已仔细阅读、充分理解并同意本规则的全部内容，特别是免除或限制责任的条款。
          </Text>
          <Text style={styles.paragraph}>
            1.4 请您配合我们进行儿童个人信息保护相关的身份核验。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>二、我们收集的儿童个人信息</Text>
          <Text style={styles.paragraph}>
            2.1 基本原则{'\n'}
            我们遵循正当必要、知情同意、目的明确、安全保障、依法利用的原则收集儿童个人信息。
          </Text>
          <Text style={styles.paragraph}>
            2.2 收集的信息类型{'\n'}
            • 设备信息：设备型号、操作系统版本（用于适配应用）{'\n'}
            • 网络信息：DNS查询记录（仅用于提供过滤服务，不永久保存）{'\n'}
            • 使用统计：已过滤和安全访问次数（仅本地统计）
          </Text>
          <Text style={styles.paragraph}>
            2.3 我们不会收集{'\n'}
            • 姓名、身份证号等身份信息{'\n'}
            • 精确位置信息{'\n'}
            • 照片、视频等多媒体信息{'\n'}
            • 通讯录、通话记录等敏感信息
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>三、儿童个人信息的使用</Text>
          <Text style={styles.paragraph}>
            3.1 使用目的{'\n'}
            • 提供DNS过滤服务{'\n'}
            • 展示使用统计（仅本地）{'\n'}
            • 改进儿童保护功能的准确性
          </Text>
          <Text style={styles.paragraph}>
            3.2 我们不会{'\n'}
            • 将儿童个人信息用于商业广告{'\n'}
            • 出售或交易儿童个人信息{'\n'}
            • 将信息用于本规则未载明的用途
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>四、儿童个人信息的存储</Text>
          <Text style={styles.paragraph}>
            4.1 存储地点{'\n'}
            儿童的使用数据主要存储在设备本地，符合数据安全和隐私保护的要求。
          </Text>
          <Text style={styles.paragraph}>
            4.2 存储期限{'\n'}
            • 本地统计数据：保留至用户主动清除或卸载应用{'\n'}
            • DNS查询记录：实时处理，不永久保存
          </Text>
          <Text style={styles.paragraph}>
            4.3 超出存储期限后，我们将删除或匿名化处理儿童个人信息。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>五、儿童个人信息的安全保障</Text>
          <Text style={styles.paragraph}>
            5.1 技术措施{'\n'}
            • 使用加密技术保护数据传输{'\n'}
            • 采用访问控制机制{'\n'}
            • 实施安全审计
          </Text>
          <Text style={styles.paragraph}>
            5.2 管理措施{'\n'}
            • 建立儿童个人信息保护专门制度{'\n'}
            • 对员工进行儿童个人信息保护培训{'\n'}
            • 定期开展安全评估
          </Text>
          <Text style={styles.paragraph}>
            5.3 安全事件应对{'\n'}
            一旦发生儿童个人信息泄露等安全事件，我们将立即启动应急预案，并按照法律要求向监护人和有关部门报告。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>六、监护人的权利</Text>
          <Text style={styles.paragraph}>
            6.1 访问权{'\n'}
            监护人有权要求我们提供我们收集的儿童个人信息的副本。
          </Text>
          <Text style={styles.paragraph}>
            6.2 更正权{'\n'}
            监护人有权要求我们更正不准确的儿童个人信息。
          </Text>
          <Text style={styles.paragraph}>
            6.3 删除权{'\n'}
            监护人有权要求我们删除收集的儿童个人信息，我们将在15个工作日内完成。
          </Text>
          <Text style={styles.paragraph}>
            6.4 拒绝权{'\n'}
            监护人有权拒绝我们继续收集、使用或转移儿童个人信息。
          </Text>
          <Text style={styles.paragraph}>
            6.5 行使权利方式{'\n'}
            您可以通过本规则第九条载明的联系方式与我们联系，行使上述权利。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>七、DNS服务说明</Text>
          <Text style={styles.paragraph}>
            7.1 我们的DNS服务{'\n'}
            本应用使用自有的DNS-over-HTTPS服务器（i-dns.wnluo.com）处理DNS查询。所有DNS查询均通过加密的HTTPS协议传输，确保儿童个人信息安全。
          </Text>
          <Text style={styles.paragraph}>
            7.2 数据安全保障{'\n'}
            我们采取严格的技术和管理措施保护儿童的DNS查询信息，不会将儿童的DNS查询记录用于商业目的或与第三方分享。
          </Text>
          <Text style={styles.paragraph}>
            7.3 数据处理原则{'\n'}
            DNS查询实时处理后不做永久保存，仅在设备本地保留必要的统计信息，确保儿童隐私得到最大程度保护。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>八、本规则的更新</Text>
          <Text style={styles.paragraph}>
            8.1 我们可能会适时对本规则进行修订。
          </Text>
          <Text style={styles.paragraph}>
            8.2 未经监护人明示同意，我们不会削减监护人和儿童依据本规则所应享有的权利。
          </Text>
          <Text style={styles.paragraph}>
            8.3 对于重大变更，我们会以应用内通知等方式向监护人告知。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>九、联系我们</Text>
          <Text style={styles.paragraph}>
            如果您对本规则或儿童个人信息处理有任何疑问、意见或建议，或需要行使相关权利，请通过以下方式联系我们：{'\n'}
            {'\n'}
            邮箱：admin@wnluo.com{'\n'}
            地址：贵州省贵阳市贵州师范大学{'\n'}
            {'\n'}
            我们将在收到您的反馈后15个工作日内回复。
          </Text>
        </View>

        <View style={styles.highlightSection}>
          <Icon name="heart" size={32} color="#06b6d4" style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={styles.highlightText}>
            守护儿童，从保护隐私开始。{'\n'}
            感谢您对iDNS家庭守护的信任！
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
  highlightSection: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 16,
    padding: 24,
    marginBottom: responsive.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  highlightText: {
    fontSize: responsive.fontSize.base,
    color: '#06b6d4',
    textAlign: 'center',
    lineHeight: 24,
  },
});

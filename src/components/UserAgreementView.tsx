
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive } from '../utils/responsive';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useThemeColors } from '../styles/theme';

interface UserAgreementViewProps {
  onClose?: () => void;
}

export const UserAgreementView: React.FC<UserAgreementViewProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { pagePadding } = useResponsiveLayout();

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, {
        paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
        paddingHorizontal: pagePadding,
        borderBottomColor: colors.border.subtle,
        backgroundColor: colors.background.primary
      }]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="x" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.title, { color: colors.text.primary }]}>用户协议</Text>
        <Text style={[styles.updateDate, { color: colors.text.tertiary }]}>更新日期：2025年12月</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 20, paddingHorizontal: pagePadding }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>欢迎使用iDNS家庭守护</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            感谢您选择iDNS家庭守护应用（以下简称"本应用"或"我们"）。在使用本应用之前，请您仔细阅读并理解本用户协议（以下简称"本协议"）。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            使用本应用即表示您同意接受本协议的所有条款和条件。如果您不同意本协议的任何内容，请勿使用本应用。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>一、服务说明</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            1.1 服务内容{'\n'}
            本应用是一款家庭网络守护工具，通过DNS技术帮助您过滤不适宜内容、拦截广告和恶意网站，为您的家庭提供更安全的上网环境。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            1.2 服务范围{'\n'}
            • DNS查询和解析服务{'\n'}
            • 广告和跟踪器过滤{'\n'}
            • 儿童保护模式{'\n'}
            • 网络访问统计{'\n'}
            • 自定义过滤规则
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            1.3 服务限制{'\n'}
            本应用不是VPN服务，不提供翻墙或访问被限制网站的功能。我们严格遵守中国法律法规。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>二、用户义务</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            2.1 合法使用{'\n'}
            您应当遵守中华人民共和国相关法律法规，不得利用本应用从事违法违规活动。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            2.2 真实信息{'\n'}
            如需提供信息，您应当提供真实、准确、完整的信息。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            2.3 账号安全{'\n'}
            您应当妥善保管自己的设备和应用设置，防止他人未经授权使用。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            2.4 禁止行为{'\n'}
            您不得：{'\n'}
            • 利用本应用从事任何违法活动{'\n'}
            • 破坏或试图破坏本应用的安全性{'\n'}
            • 逆向工程、反编译本应用{'\n'}
            • 利用本应用损害他人合法权益
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>三、儿童保护</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            3.1 监护人责任{'\n'}
            如果您是未成年人的监护人，在为未成年人使用本应用时，您应当正确引导并监督其使用行为。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            3.2 儿童保护模式{'\n'}
            本应用提供儿童保护模式，可以帮助过滤不适宜内容。但这不能完全替代监护人的监督责任。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            3.3 年龄限制{'\n'}
            建议14周岁以下儿童在监护人指导下使用本应用。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>四、隐私保护</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            我们重视您的隐私保护。关于我们如何收集、使用、存储和保护您的个人信息，请详细阅读《隐私政策》和《儿童个人信息保护规则》。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>五、知识产权</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            5.1 权利归属{'\n'}
            本应用的所有知识产权（包括但不限于著作权、商标权）归我们所有。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            5.2 授权使用{'\n'}
            我们授予您非独占、不可转让的使用许可，仅供个人或家庭非商业使用。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>六、免责声明</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            6.1 服务可用性{'\n'}
            我们会尽力保证服务的稳定性，但不保证服务不会中断或出现错误。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            6.2 DNS服务{'\n'}
            本应用使用自有的DNS-over-HTTPS服务器（i-dns.wnluo.com）提供DNS解析服务。我们会尽力保证服务的稳定性和可用性，但不对因网络故障、服务器维护等原因导致的服务中断承担责任。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            6.3 过滤效果{'\n'}
            虽然我们努力提供准确的内容过滤，但不能保证100%过滤所有不适宜内容。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            6.4 数据损失{'\n'}
            我们不对因不可抗力、网络故障等原因导致的数据损失承担责任。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>七、服务变更与终止</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            7.1 我们有权随时修改、暂停或终止部分或全部服务，恕不另行通知。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            7.2 如您违反本协议，我们有权终止向您提供服务。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            7.3 您可以随时卸载应用以停止使用服务。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>八、法律适用与争议解决</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            8.1 本协议的订立、执行和解释及争议的解决均应适用中华人民共和国法律。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            8.2 如就本协议内容或其执行发生争议，双方应尽力友好协商解决；协商不成时，任何一方均可向我方所在地有管辖权的人民法院提起诉讼。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>九、其他条款</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            9.1 本协议构成您与我们之间关于使用本应用的完整协议。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            9.2 我们有权根据需要不时修改本协议。修改后的协议将在应用内发布。
          </Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            9.3 如本协议的任何条款被认定为无效，该无效不影响其他条款的效力。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.info }]}>十、联系我们</Text>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            如您对本协议有任何疑问，请通过以下方式联系我们：{'\n'}
            {'\n'}
            邮箱：admin@wnluo.com{'\n'}
            地址：贵州省贵阳市贵州师范大学
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.paragraph, { color: colors.text.secondary }]}>
            再次感谢您使用iDNS家庭守护！
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
  header: {
    // paddingHorizontal dynamic
    paddingBottom: responsive.spacing.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: responsive.fontSize['4xl'],
    fontWeight: '700',
    marginBottom: 4,
  },
  updateDate: {
    fontSize: responsive.fontSize.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    // paddingHorizontal dynamic
    paddingTop: responsive.spacing.xl,
  },
  section: {
    marginBottom: responsive.spacing.xl,
  },
  sectionTitle: {
    fontSize: responsive.fontSize.lg,
    fontWeight: '600',
    marginBottom: responsive.spacing.md,
  },
  paragraph: {
    fontSize: responsive.fontSize.base,
    lineHeight: 24,
    marginBottom: responsive.spacing.sm,
  },
});

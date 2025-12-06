import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { responsive, scaleWidth, scaleHeight, scaleFont, scaleSpacing } from '../utils/responsive';
import { useThemeColors } from '../styles/theme';

const { height } = Dimensions.get('window');

interface FirstLaunchModalProps {
  visible: boolean;
  onAccept: () => void;
  onViewAgreement: () => void;
  onViewPrivacy: () => void;
}

export const FirstLaunchModal: React.FC<FirstLaunchModalProps> = ({
  visible,
  onAccept,
  onViewAgreement,
  onViewPrivacy,
}) => {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => { }}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background.elevated }]}>
          <View style={[styles.header, { backgroundColor: colors.background.tertiary }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.info + '10' }]}>
              <Icon name="shield" size={scaleWidth(40)} color={colors.info} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>欢迎使用 iDNS 家庭守护</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>网络安全教育工具</Text>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="info" size={20} color={colors.info} />
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>重要说明</Text>
              </View>

              <View style={styles.point}>
                <View style={[styles.bullet, { backgroundColor: colors.info }]} />
                <Text style={[styles.pointText, { color: colors.text.secondary }]}>
                  本应用为<Text style={[styles.highlight, { color: colors.info }]}>家庭网络安全教育工具</Text>，
                  帮助家长了解 DNS 过滤技术原理
                </Text>
              </View>

              <View style={styles.point}>
                <View style={[styles.bullet, { backgroundColor: colors.info }]} />
                <Text style={[styles.pointText, { color: colors.text.secondary }]}>
                  界面展示的数据为<Text style={[styles.highlight, { color: colors.info }]}>演示示例</Text>，
                  用于教学和演示目的
                </Text>
              </View>

              <View style={styles.point}>
                <View style={[styles.bullet, { backgroundColor: colors.info }]} />
                <Text style={[styles.pointText, { color: colors.text.secondary }]}>
                  实际网络防护需配合<Text style={[styles.highlight, { color: colors.info }]}>路由器DNS设置</Text>或使用专业工具
                </Text>
              </View>

              <View style={styles.point}>
                <View style={[styles.bullet, { backgroundColor: colors.info }]} />
                <Text style={[styles.pointText, { color: colors.text.secondary }]}>
                  我们<Text style={[styles.highlight, { color: colors.info }]}>不保证</Text>过滤效果的准确性和完整性
                </Text>
              </View>

              <View style={styles.point}>
                <View style={[styles.bullet, { backgroundColor: colors.info }]} />
                <Text style={[styles.pointText, { color: colors.text.secondary }]}>
                  本应用专注于<Text style={[styles.highlight, { color: colors.info }]}>儿童保护</Text>和家庭网络安全教育
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="file-text" size={20} color="#8b5cf6" />
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>使用前须知</Text>
              </View>

              <Text style={[styles.agreementText, { color: colors.text.secondary }]}>
                继续使用即表示您已阅读并同意：
              </Text>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onViewAgreement}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.info }]}>《用户协议》</Text>
                <Icon name="external-link" size={14} color={colors.info} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onViewPrivacy}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.info }]}>《隐私政策》</Text>
                <Icon name="external-link" size={14} color={colors.info} />
              </TouchableOpacity>

              <Text style={[styles.childProtectionNote, { color: colors.status.error }]}>
                <Icon name="heart" size={14} color={colors.status.error} />{' '}
                我们特别重视儿童个人信息保护
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: colors.background.tertiary }]}>
            <TouchableOpacity
              style={[styles.acceptButton, { backgroundColor: colors.info }]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptButtonText}>我已了解并同意</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.95)', // Keep overlay dark
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSpacing(20),
  },
  modalContainer: {
    width: '100%',
    maxWidth: scaleWidth(400),
    maxHeight: height * 0.85,
    borderRadius: scaleSpacing(20),
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    alignItems: 'center',
    paddingTop: scaleSpacing(32),
    paddingBottom: scaleSpacing(24),
    paddingHorizontal: scaleSpacing(24),
  },
  iconContainer: {
    width: scaleWidth(80),
    height: scaleWidth(80),
    borderRadius: scaleWidth(40),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: scaleSpacing(16),
  },
  title: {
    fontSize: scaleFont(22),
    fontWeight: '700',
    marginBottom: scaleSpacing(8),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: scaleFont(14),
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: scaleSpacing(24),
  },
  section: {
    paddingVertical: scaleSpacing(20),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaleSpacing(16),
  },
  sectionTitle: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    marginLeft: scaleSpacing(8),
  },
  point: {
    flexDirection: 'row',
    marginBottom: scaleSpacing(12),
    paddingLeft: scaleSpacing(4),
  },
  bullet: {
    width: scaleWidth(6),
    height: scaleWidth(6),
    borderRadius: scaleWidth(3),
    marginTop: scaleSpacing(6),
    marginRight: scaleSpacing(12),
  },
  pointText: {
    flex: 1,
    fontSize: scaleFont(14),
    lineHeight: scaleFont(20),
  },
  highlight: {
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: scaleSpacing(-24),
  },
  agreementText: {
    fontSize: scaleFont(14),
    marginBottom: scaleSpacing(12),
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSpacing(8),
    marginBottom: scaleSpacing(8),
  },
  linkText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginRight: scaleSpacing(6),
  },
  childProtectionNote: {
    fontSize: scaleFont(13),
    marginTop: scaleSpacing(12),
    paddingLeft: scaleSpacing(4),
  },
  footer: {
    padding: scaleSpacing(24),
    paddingTop: scaleSpacing(16),
  },
  acceptButton: {
    borderRadius: scaleSpacing(12),
    paddingVertical: scaleSpacing(16),
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  acceptButtonText: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: '#ffffff',
  },
});

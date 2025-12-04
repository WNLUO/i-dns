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
import { responsive } from '../utils/responsive';

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
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon name="shield" size={responsive(40)} color="#3b82f6" />
            </View>
            <Text style={styles.title}>欢迎使用 iDNS 家庭守护</Text>
            <Text style={styles.subtitle}>网络安全教育工具</Text>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="info" size={20} color="#06b6d4" />
                <Text style={styles.sectionTitle}>重要说明</Text>
              </View>

              <View style={styles.point}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>
                  本应用为<Text style={styles.highlight}>家庭网络安全教育工具</Text>，
                  帮助家长了解 DNS 过滤技术原理
                </Text>
              </View>

              <View style={styles.point}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>
                  界面展示的数据为<Text style={styles.highlight}>演示示例</Text>，
                  用于教学和演示目的
                </Text>
              </View>

              <View style={styles.point}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>
                  实际网络防护需配合<Text style={styles.highlight}>路由器DNS设置</Text>或使用专业工具
                </Text>
              </View>

              <View style={styles.point}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>
                  我们<Text style={styles.highlight}>不保证</Text>过滤效果的准确性和完整性
                </Text>
              </View>

              <View style={styles.point}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>
                  本应用专注于<Text style={styles.highlight}>儿童保护</Text>和家庭网络安全教育
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="file-text" size={20} color="#8b5cf6" />
                <Text style={styles.sectionTitle}>使用前须知</Text>
              </View>

              <Text style={styles.agreementText}>
                继续使用即表示您已阅读并同意：
              </Text>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onViewAgreement}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>《用户协议》</Text>
                <Icon name="external-link" size={14} color="#3b82f6" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onViewPrivacy}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>《隐私政策》</Text>
                <Icon name="external-link" size={14} color="#3b82f6" />
              </TouchableOpacity>

              <Text style={styles.childProtectionNote}>
                <Icon name="heart" size={14} color="#f43f5e" />{' '}
                我们特别重视儿童个人信息保护
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.acceptButton}
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
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: responsive(20),
  },
  modalContainer: {
    width: '100%',
    maxWidth: responsive(400),
    maxHeight: height * 0.85,
    backgroundColor: '#1e293b',
    borderRadius: responsive(20),
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    alignItems: 'center',
    paddingTop: responsive(32),
    paddingBottom: responsive(24),
    paddingHorizontal: responsive(24),
    backgroundColor: '#0f172a',
  },
  iconContainer: {
    width: responsive(80),
    height: responsive(80),
    borderRadius: responsive(40),
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsive(16),
  },
  title: {
    fontSize: responsive(22),
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: responsive(8),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: responsive(14),
    color: '#94a3b8',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: responsive(24),
  },
  section: {
    paddingVertical: responsive(20),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: responsive(16),
  },
  sectionTitle: {
    fontSize: responsive(16),
    fontWeight: '600',
    color: '#f1f5f9',
    marginLeft: responsive(8),
  },
  point: {
    flexDirection: 'row',
    marginBottom: responsive(12),
    paddingLeft: responsive(4),
  },
  bullet: {
    width: responsive(6),
    height: responsive(6),
    borderRadius: responsive(3),
    backgroundColor: '#3b82f6',
    marginTop: responsive(6),
    marginRight: responsive(12),
  },
  pointText: {
    flex: 1,
    fontSize: responsive(14),
    lineHeight: responsive(20),
    color: '#cbd5e1',
  },
  highlight: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginHorizontal: responsive(-24),
  },
  agreementText: {
    fontSize: responsive(14),
    color: '#cbd5e1',
    marginBottom: responsive(12),
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: responsive(8),
    marginBottom: responsive(8),
  },
  linkText: {
    fontSize: responsive(14),
    color: '#3b82f6',
    fontWeight: '600',
    marginRight: responsive(6),
  },
  childProtectionNote: {
    fontSize: responsive(13),
    color: '#f43f5e',
    marginTop: responsive(12),
    paddingLeft: responsive(4),
  },
  footer: {
    padding: responsive(24),
    paddingTop: responsive(16),
    backgroundColor: '#0f172a',
  },
  acceptButton: {
    backgroundColor: '#3b82f6',
    borderRadius: responsive(12),
    paddingVertical: responsive(16),
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  acceptButtonText: {
    fontSize: responsive(16),
    fontWeight: '600',
    color: '#ffffff',
  },
});

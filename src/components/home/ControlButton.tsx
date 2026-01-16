import React from 'react';
import {View, Text, TouchableOpacity, Animated} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import {styles} from './styles';

interface ControlButtonProps {
  isConnected: boolean;
  colors: any;
  buttonSize: number;
  scaleAnim: Animated.Value;
  pulseAnim: Animated.Value;
  onPress: () => void;
}

export const ControlButton: React.FC<ControlButtonProps> = ({
  isConnected,
  colors,
  buttonSize,
  scaleAnim,
  pulseAnim,
  onPress,
}) => (
  <View style={styles.controlSection}>
    <View style={[styles.buttonWrapper, {width: buttonSize * 1.4, height: buttonSize * 1.4}]}>
      {isConnected && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: colors.info,
              transform: [{scale: pulseAnim}],
              opacity: pulseAnim.interpolate({
                inputRange: [1, 1.1],
                outputRange: [0.3, 0],
              }),
            },
          ]}
        />
      )}

      <Animated.View style={{transform: [{scale: scaleAnim}]}}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[styles.mainButtonContainer, {shadowColor: colors.info}]}>
          <LinearGradient
            colors={
              isConnected
                ? [colors.info, colors.icon.active]
                : [colors.background.tertiary, colors.background.secondary]
            }
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={[styles.mainButton, {width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2}]}
          >
            <Icon
              name={isConnected ? 'shield' : 'shield-off'}
              size={buttonSize * 0.45}
              color={isConnected ? colors.text.inverse : colors.text.disabled}
            />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>

    <Text style={[styles.buttonHint, {color: colors.text.secondary}]}>
      {isConnected ? '点击关闭守护' : '点击开启守护'}
    </Text>
  </View>
);

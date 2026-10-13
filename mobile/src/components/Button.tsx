import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients, radius, type } from '../theme';

type Variant = 'primary' | 'gold' | 'ghost';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: Props) {
  const textColor = variant === 'gold' ? colors.goldText : '#fff';

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={[type.button, { color: textColor }]}>{title}</Text>
        </>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant !== 'ghost' && styles.shadow,
        variant === 'primary' && { backgroundColor: colors.rose2 },
        variant === 'gold' && { shadowColor: colors.gold2, backgroundColor: colors.gold2 },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      {variant === 'ghost' ? (
        <View style={[styles.fill, styles.ghost]}>{content}</View>
      ) : (
        <LinearGradient
          colors={variant === 'gold' ? gradients.gold : gradients.rose}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fill}>
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 54, borderRadius: radius.lg, width: '100%' },
  shadow: {
    shadowColor: colors.rose2,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  fill: { flex: 1, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';
import { colors, gradients } from '../theme';

// Gold "VIP" crown pill — naam ke saath
export default function VipBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md';
  return (
    <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pill, md && styles.pillMd]}>
      <Icon name="crown" size={md ? 13 : 11} color={colors.goldText} strokeWidth={2.4} />
      <Text style={[styles.text, md && { fontSize: 11 }]}>VIP</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 18, paddingHorizontal: 6, borderRadius: 9 },
  pillMd: { height: 22, paddingHorizontal: 8, borderRadius: 11 },
  text: { color: colors.goldText, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
});

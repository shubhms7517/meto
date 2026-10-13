import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';
import { colors, gradients } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = { rate: number; onPress: () => void; style?: StyleProp<ViewStyle> };

// Design option C: dark button, border pe ghoomti rose-gold roshni, icon se pulse ring
export default function CallButton({ rate, onPress, style }: Props) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [reduced, spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  // Ghoomne wala square button ke diagonal se bada hona chahiye
  const sweep = Math.ceil(Math.hypot(size.w, size.h)) + 20;

  return (
    <Pressable
      onPress={onPress}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={({ pressed }) => [styles.wrap, { transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}>
      {sweep > 20 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweep,
            { width: sweep, height: sweep, left: (size.w - sweep) / 2, top: (size.h - sweep) / 2, transform: [{ rotate }] },
          ]}>
          {/* Aadha transparent, aadha rose→gold→rose: ghoomne pe border pe roshni chalti dikhti hai */}
          <LinearGradient
            colors={['transparent', 'transparent', colors.rose1, colors.gold1, colors.rose2, 'transparent']}
            locations={[0, 0.45, 0.62, 0.72, 0.85, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      <LinearGradient colors={['#2a1220', '#1a0a12']} style={styles.inner}>
        <View style={styles.icWrap}>
          {!reduced && <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />}
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ic}>
            <Icon name="videoFill" size={18} color="#fff" />
          </LinearGradient>
        </View>
        <View>
          <Text style={styles.title}>Video Call</Text>
          <Text style={styles.rate}>{rate} gems / min</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 58,
    borderRadius: 20,
    padding: 1.6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,95,143,0.25)',
    elevation: 10,
    shadowColor: colors.rose1,
  },
  sweep: { position: 'absolute' },
  inner: { flex: 1, borderRadius: 18.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  icWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  ic: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.rose1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 19 },
  rate: { color: colors.gold1, fontSize: 11, fontWeight: '500' },
});

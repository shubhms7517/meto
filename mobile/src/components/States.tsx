import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../theme';
import { tap } from '../lib/haptics';

/* Har page pe ek jaisa: loading (skeleton), error + Retry, khaali list, pull-to-refresh */

// Spinner ki jagah halki lines — page ka aakar pehle dikhe (dheere chamakti hain)
export function SkeletonList({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);
  return (
    <Animated.View style={[st.skelWrap, { opacity: pulse }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={st.skelRow}>
          {avatar && <View style={st.skelAv} />}
          <View style={st.flex}>
            <View style={[st.skelLine, { width: `${60 - (i % 3) * 10}%` }]} />
            <View style={[st.skelLine, st.skelLine2]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

type StateProps = { icon: string; title: string; text?: string; action?: { label: string; onPress: () => void }; ghost?: boolean };

function StateBox({ icon, title, text, action, ghost }: StateProps) {
  return (
    <View style={st.state}>
      <View style={st.stateIc}>
        <Text style={st.stateEmoji}>{icon}</Text>
      </View>
      <Text style={st.stateTitle}>{title}</Text>
      {!!text && <Text style={st.stateText}>{text}</Text>}
      {action && (
        <Pressable
          onPress={() => {
            tap();
            action.onPress();
          }}
          style={({ pressed }) => [st.stateBtnWrap, pressed && st.pressed]}>
          {ghost ? (
            <View style={[st.stateBtn, st.ghost]}>
              <Text style={st.stateBtnText}>{action.label}</Text>
            </View>
          ) : (
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.stateBtn}>
              <Text style={st.stateBtnText}>{action.label}</Text>
            </LinearGradient>
          )}
        </Pressable>
      )}
    </View>
  );
}

// Net band / server down — atka spinner nahi, saaf message + Retry
export const ErrorState = ({ onRetry, text }: { onRetry: () => void; text?: string }) => (
  <StateBox icon="📡" title="Can’t load right now" text={text ?? 'Check your internet and try again.'} action={{ label: 'Retry', onPress: onRetry }} />
);

// Khaali list — apna icon, kaam ki salah, button (optional)
export const EmptyState = (p: Omit<StateProps, 'ghost'>) => <StateBox {...p} ghost />;

// Pull-to-refresh — app ke rang me
export const refreshControl = (refreshing: boolean, onRefresh: () => void) => (
  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.rose1} colors={[colors.rose1]} progressBackgroundColor="#241c20" />
);

const st = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  skelWrap: { paddingTop: 6 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, paddingVertical: 11 },
  skelAv: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  skelLine: { height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  skelLine2: { width: '35%', height: 9, marginTop: 8 },
  state: { alignItems: 'center', marginTop: 60, marginHorizontal: 30 },
  stateIc: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.08)', borderWidth: 1, borderColor: 'rgba(255,95,143,0.3)' },
  stateEmoji: { fontSize: 36 },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  stateBtnWrap: { marginTop: 16 },
  stateBtn: { height: 42, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.07)' },
  stateBtnText: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
});

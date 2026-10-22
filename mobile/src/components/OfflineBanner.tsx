import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { checkNow, isOnline, onNetChange } from '../lib/netStatus';

// Server na mile to upar patti: app chalti rehti hai, bas saaf batati hai + Retry.
export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(!isOnline());
  const [checking, setChecking] = useState(false);
  const y = useRef(new Animated.Value(offline ? 0 : -120)).current;

  useEffect(() => onNetChange(on => setOffline(!on)), []);
  useEffect(() => {
    Animated.timing(y, { toValue: offline ? 0 : -120, duration: 220, useNativeDriver: true }).start();
  }, [offline, y]);

  const retry = async () => {
    setChecking(true);
    await checkNow();
    setChecking(false);
  };

  return (
    <Animated.View pointerEvents={offline ? 'box-none' : 'none'} style={[st.wrap, { paddingTop: insets.top + 6, transform: [{ translateY: y }] }]}>
      <View style={st.bar}>
        <Text style={st.icon}>📡</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Can’t reach Meto right now</Text>
          <Text style={st.sub}>Check your internet · we’ll reconnect by ourselves</Text>
        </View>
        <Pressable onPress={retry} disabled={checking} hitSlop={8} style={st.btn}>
          {checking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.btnText}>Retry</Text>}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 100, elevation: 100 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#3a1f25', borderWidth: 1, borderColor: 'rgba(255,95,122,0.45)' },
  icon: { fontSize: 18 },
  title: { color: colors.text, fontSize: 13, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  btn: { minWidth: 62, height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose1 },
  btnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
});

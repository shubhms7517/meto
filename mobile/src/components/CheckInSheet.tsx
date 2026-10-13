import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Coin from './Coin';
import { colors, gradients } from '../theme';
import { claimCheckIn, getCheckIn, type CheckIn } from '../services/rewards';
import { useWallet } from '../context/WalletContext';

const GOLD = ['#fff4d6', '#f3d488', '#d9ae55'];

function Glow({ size }: { size: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="cg" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#f6dc9b" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#f6dc9b" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#cg)" />
    </Svg>
  );
}

// Gold button pe chalti chamak
function Shine() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(1200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-80, 420] });
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, { transform: [{ translateX: tx }, { skewX: '-20deg' }] }]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// Daily check-in (design A · Gold path)
export default function CheckInSheet({ onClose, onClaimed }: { onClose: () => void; onClaimed?: (st: CheckIn) => void }) {
  const insets = useSafeAreaInsets();
  const { setBalance } = useWallet();
  const [st, setSt] = useState<CheckIn | null>(null);
  const [claiming, setClaiming] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getCheckIn()
      .then(setSt)
      .catch(e => {
        Alert.alert('Check-in', (e as Error).message);
        onClose();
      });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = async () => {
    if (!st || st.claimedToday || claiming) return;
    setClaiming(true);
    try {
      const r = await claimCheckIn();
      setBalance(r.balance);
      setSt(r);
      onClaimed?.(r);
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 90, useNativeDriver: true }).start();
    } catch (e) {
      Alert.alert('Check-in', (e as Error).message);
    } finally {
      setClaiming(false);
    }
  };

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  const bob = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const tilt = pulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-4deg'] });

  const today = st ? st.rewards[st.day - 1] : 0;
  // Kitne din ho gaye (line kahan tak bhari)
  const doneUpTo = st ? (st.claimedToday ? st.day : st.day - 1) : 0;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topGlow} pointerEvents="none">
          <Glow size={360} />
        </View>
        <View style={styles.handle} />
        <Pressable onPress={onClose} style={styles.x} hitSlop={8}>
          <Text style={styles.xText}>✕</Text>
        </Pressable>

        {!st ? (
          <ActivityIndicator color={colors.gold1} style={{ marginVertical: 120 }} />
        ) : (
          <>
            <Text style={styles.kick}>DAILY REWARD</Text>
            <Text style={styles.title}>Day {st.day} of 7</Text>
            <Text style={styles.sub}>{st.claimedToday ? 'See you tomorrow for more gems' : 'Come back every day — the 7th day is the biggest'}</Text>

            <View style={styles.hero}>
              <Animated.View style={[styles.heroGlow, { transform: [{ scale: glowScale }] }]}>
                <Glow size={160} />
              </Animated.View>
              <Animated.Text style={[styles.box, { transform: [{ translateY: bob }, { rotate: tilt }] }]}>{st.claimedToday ? '✨' : '🎁'}</Animated.Text>
              <Animated.View style={[styles.amt, { transform: [{ scale: pop }] }]}>
                <Coin size={22} />
                <Text style={styles.amtText}>
                  {st.claimedToday ? `+${today} claimed` : `+${today} gems`}
                </Text>
              </Animated.View>
            </View>

            <View style={styles.path}>
              <View style={styles.line}>
                <LinearGradient
                  colors={gradients.rose.concat(colors.gold1)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.lineFill, { width: `${Math.min(100, (Math.max(0, doneUpTo - 1) / 6) * 100)}%` }]}
                />
              </View>
              {st.rewards.map((r, i) => {
                const d = i + 1;
                const done = d <= doneUpTo && !(st.claimedToday && d === st.day);
                const isToday = d === st.day;
                const last = d === 7;
                return (
                  <View key={d} style={styles.node}>
                    {isToday ? (
                      <LinearGradient colors={GOLD} style={[styles.dot, styles.dotToday]}>
                        <Text style={[styles.dotText, { color: colors.goldText }]}>{st.claimedToday ? '✓' : r}</Text>
                      </LinearGradient>
                    ) : done ? (
                      <LinearGradient colors={gradients.rose} style={styles.dot}>
                        <Text style={[styles.dotText, { color: '#fff' }]}>✓</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.dot, styles.dotOff, last && styles.dotLast]}>
                        <Text style={[styles.dotText, last && { fontSize: 17 }]}>{last ? '🎁' : d}</Text>
                      </View>
                    )}
                    <Text style={[styles.nodeLbl, isToday && { color: colors.gold1 }]}>{isToday ? 'Today' : `Day ${d}`}</Text>
                    <Text style={[styles.nodeAmt, done && { color: colors.muted }]}>{r}</Text>
                  </View>
                );
              })}
            </View>

            <Pressable onPress={claim} disabled={st.claimedToday || claiming} style={{ marginTop: 20 }}>
              {st.claimedToday ? (
                <View style={[styles.btn, styles.btnDone]}>
                  <Text style={styles.btnDoneText}>Come back tomorrow</Text>
                </View>
              ) : (
                <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {claiming ? <ActivityIndicator color={colors.goldText} /> : <Text style={styles.btnText}>Claim {today} gems</Text>}
                  <Shine />
                </LinearGradient>
              )}
            </Pressable>
            <Text style={styles.note}>
              🔥 {st.streak > 0 ? `${st.streak} day streak` : 'Start your streak today'} ·{' '}
              <Text style={{ color: colors.gold1, fontWeight: '700' }}>Day 7 = biggest reward</Text>
            </Text>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 10, overflow: 'hidden', backgroundColor: '#1d0914', borderTopWidth: 1, borderColor: 'rgba(246,220,155,0.35)' },
  topGlow: { position: 'absolute', top: -200, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  x: { position: 'absolute', right: 14, top: 14, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  xText: { color: colors.muted, fontSize: 13 },
  kick: { color: colors.gold1, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textAlign: 'center' },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  sub: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 3 },
  hero: { height: 160, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  heroGlow: { position: 'absolute' },
  box: { fontSize: 78, lineHeight: 96 },
  amt: { position: 'absolute', bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 13, paddingVertical: 5, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.5)' },
  amtText: { color: colors.gold1, fontSize: 15.5, fontWeight: '800' },
  path: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginHorizontal: 2 },
  line: { position: 'absolute', left: 19, right: 19, top: 17, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  lineFill: { height: 3, borderRadius: 2 },
  node: { width: 40, alignItems: 'center' },
  dot: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dotOff: { backgroundColor: '#241a1e', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)' },
  dotLast: { backgroundColor: '#2a1f14', borderColor: 'rgba(246,220,155,0.5)' },
  dotToday: { shadowColor: '#f6dc9b', shadowOpacity: 0.9, shadowRadius: 12, elevation: 8 },
  dotText: { color: colors.muted, fontSize: 12.5, fontWeight: '800' },
  nodeLbl: { color: colors.fine, fontSize: 10, marginTop: 6 },
  nodeAmt: { color: colors.gold1, fontSize: 11.5, fontWeight: '700' },
  btn: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btnText: { color: colors.goldText, fontSize: 15.5, fontWeight: '800' },
  btnDone: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnDoneText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 50 },
  note: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10 },
});

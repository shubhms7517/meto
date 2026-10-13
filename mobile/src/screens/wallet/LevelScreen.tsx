import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Icon from '../../components/Icon';
import Coin from '../../components/Coin';
import LevelBadge from '../../components/LevelBadge';
import { colors, gradients } from '../../theme';
import { getLevel, type LevelInfo } from '../../services/rewards';
import { fmt } from '../../services/wallet';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Level'>;

const tierName = (l: number) => (l >= 14 ? 'ROYAL' : l >= 10 ? 'GOLD' : l >= 5 ? 'SILVER' : l >= 1 ? 'ROSE' : 'NEW');
const short = (n: number) => (n >= 10000000 ? `${n / 10000000} Cr` : n >= 100000 ? `${n / 100000} L` : n >= 1000 ? `${n / 1000}K` : String(n));

function Blob({ size, color, opacity }: { size: number; color: string; opacity: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`b${color.slice(1)}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#b${color.slice(1)})`} />
    </Svg>
  );
}

// Badge ke peeche ghoomti rose-gold roshni + dhadakta halo + timtimate taare
function Aura({ children }: { children: React.ReactNode }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, pulse]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] });
  const twinkle = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });
  return (
    <View style={styles.aura}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
        <Blob size={170} color="#f6dc9b" opacity={0.35} />
      </Animated.View>
      <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]}>
        <View style={{ position: 'absolute', left: 0, top: 10 }}>
          <Blob size={90} color="#ff5f8f" opacity={0.75} />
        </View>
        <View style={{ position: 'absolute', right: 0, bottom: 10 }}>
          <Blob size={90} color="#f6dc9b" opacity={0.75} />
        </View>
      </Animated.View>
      {children}
      <Animated.Text style={[styles.star, { left: 14, top: 28, opacity: twinkle }]}>✦</Animated.Text>
      <Animated.Text style={[styles.star, { right: 12, top: 46, opacity: pulse }]}>✦</Animated.Text>
      <Animated.Text style={[styles.star, { left: 32, bottom: 18, fontSize: 9, opacity: pulse }]}>✦</Animated.Text>
    </View>
  );
}

// My level: upar chamakta hero (badge, progress, Level up now), neeche levels ka raasta
export default function LevelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<LevelInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      getLevel().then(setInfo).catch(() => {});
    }, []),
  );

  const pct = info?.nextXp ? Math.min(1, (info.xp - info.levelXp) / (info.nextXp - info.levelXp)) : 1;
  // Raaste ki line kahan tak bhari (current level ke node tak)
  const pathFill = info ? Math.max(0, Math.min(1, (info.level - 0.5) / info.tiers.length)) : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.45, 0.8]} style={styles.topGlow} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>My level</Text>
      </View>

      {!info ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['rgba(255,95,143,0.24)', 'rgba(40,10,25,0.92)', '#1d0a14']} locations={[0, 0.55, 1]} style={styles.hero}>
            <Aura>
              <LevelBadge level={info.level} size={120} />
            </Aura>
            <Text style={styles.tier}>{tierName(info.level)} TIER</Text>
            <Text style={styles.lvl}>Level {info.level}</Text>
            <Text style={styles.need}>
              {info.nextXp ? (
                <>
                  Recharge <Text style={styles.needB}>{fmt(info.nextXp - info.xp)} gems</Text> more to reach Lv.{info.level + 1}
                </>
              ) : (
                'You reached the highest level 👑'
              )}
            </Text>

            <View style={styles.prog}>
              <View style={styles.track}>
                <LinearGradient colors={[colors.rose1, colors.gold1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.max(4, pct * 100)}%` }]}>
                  <View style={styles.knob} />
                </LinearGradient>
              </View>
              <View style={styles.ends}>
                <Text style={styles.end}>
                  Lv.{info.level} · {short(info.levelXp)}
                </Text>
                <Text style={[styles.end, { color: colors.gold1 }]}>{fmt(info.xp)}</Text>
                <Text style={styles.end}>{info.nextXp ? `Lv.${info.level + 1} · ${short(info.nextXp)}` : ''}</Text>
              </View>
            </View>

            {!!info.nextReward && (
              <View style={styles.reward}>
                <Text style={styles.rewardLbl}>Next reward </Text>
                <Coin size={15} />
                <Text style={styles.rewardNum}> +{fmt(info.nextReward)}</Text>
              </View>
            )}
            {!!info.nextXp && (
              <Pressable onPress={() => navigation.navigate('Wallet')} style={{ alignSelf: 'stretch' }}>
                <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  <Text style={styles.btnText}>⚡ Level up now</Text>
                </LinearGradient>
              </Pressable>
            )}
          </LinearGradient>

          <View style={styles.secRow}>
            <Text style={styles.sec}>Your journey</Text>
            <Text style={styles.secR}>Recharge → Reward</Text>
          </View>

          <View style={styles.path}>
            <View style={styles.line}>
              <LinearGradient colors={[colors.rose1, colors.gold1]} style={{ height: `${pathFill * 100}%`, borderRadius: 2 }} />
            </View>
            {info.tiers.map(t => {
              const cur = t.level === info.level;
              const done = t.level < info.level;
              return (
                <View key={t.level} style={styles.step}>
                  <View style={styles.node}>
                    <LevelBadge level={t.level} size={48} />
                  </View>
                  <View style={[styles.card, cur && styles.cardCur, done && { opacity: 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cTitle}>
                        Level {t.level}
                        {cur && <Text style={styles.you}>  · YOU</Text>}
                      </Text>
                      <Text style={styles.cSub}>{fmt(t.xp)} gems recharged</Text>
                    </View>
                    {t.reward ? (
                      <View style={styles.cRew}>
                        <Coin size={13} />
                        <Text style={styles.cRewText}> +{fmt(t.reward)}</Text>
                        {done && <Text style={styles.tick}> ✓</Text>}
                      </View>
                    ) : (
                      <Text style={styles.cSub}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.foot}>Level is based on total gems you recharge. Rewards are added to your wallet automatically.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 460 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },

  hero: { marginHorizontal: 16, marginTop: 4, borderRadius: 26, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 16, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,95,143,0.4)' },
  aura: { width: 170, height: 170, alignItems: 'center', justifyContent: 'center' },
  spinner: { position: 'absolute', left: 6, top: 6, right: 6, bottom: 6 },
  star: { position: 'absolute', color: colors.gold1, fontSize: 13 },
  tier: { color: colors.gold1, fontSize: 12.5, fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  lvl: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
  need: { color: colors.muted, fontSize: 12.5, marginTop: 4, textAlign: 'center' },
  needB: { color: colors.gold1, fontWeight: '800' },
  prog: { alignSelf: 'stretch', marginTop: 16 },
  track: { height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  fill: { height: 12, borderRadius: 6, justifyContent: 'center' },
  knob: { position: 'absolute', right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff4d6', shadowColor: '#f6dc9b', shadowOpacity: 1, shadowRadius: 8, elevation: 6 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  end: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  reward: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(246,220,155,0.12)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.35)' },
  rewardLbl: { color: colors.gold1, fontSize: 12, fontWeight: '700' },
  rewardNum: { color: colors.gold1, fontSize: 12.5, fontWeight: '800' },
  btn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  secRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  sec: { color: colors.muted, fontSize: 13.5, fontWeight: '600' },
  secR: { color: colors.fine, fontSize: 12 },
  path: { marginHorizontal: 16 },
  line: { position: 'absolute', left: 23, top: 24, bottom: 24, width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  node: { width: 48, alignItems: 'center' },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#262023', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cardCur: { borderColor: 'rgba(255,95,143,0.7)', backgroundColor: 'rgba(255,95,143,0.14)' },
  cTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  you: { color: colors.rose1, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  cSub: { color: colors.fine, fontSize: 11, marginTop: 1 },
  cRew: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(246,220,155,0.1)' },
  cRewText: { color: colors.gold1, fontSize: 12, fontWeight: '800' },
  tick: { color: colors.rose1, fontSize: 12, fontWeight: '800' },
  foot: { color: colors.fine, fontSize: 11.5, textAlign: 'center', marginTop: 14, paddingHorizontal: 30, lineHeight: 17 },
});

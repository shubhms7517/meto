import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import { buyVip, getVip, vipDate, type VipInfo } from '../../services/rewards';
import { fmt, IS_TEST_PAYMENTS } from '../../services/wallet';
import Coin from '../../components/Coin';
import { useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';
import { PurchaseCancelled } from '../../services/billing';

type Props = NativeStackScreenProps<RootStackParamList, 'Vip'>;

// Vato jaise fayde
const PERKS = [
  { icon: '💎', title: 'Gems bonus', sub: 'Get bonus gems right after activating' },
  { icon: '📹', title: 'Video discount', sub: '10% off video calls (900 / min)' },
  { icon: '⚡', title: 'Match discount', sub: '10% off Match Now calls' },
  { icon: '👑', title: 'Exclusive VIP status', sub: 'Gold crown on your profile and cards' },
];

function Glow({ size, opacity }: { size: number; opacity: number }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="vg" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#f6dc9b" stopOpacity={opacity} />
          <Stop offset="1" stopColor="#f6dc9b" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#vg)" />
    </Svg>
  );
}

export default function VipScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { refresh } = useWallet();
  const [info, setInfo] = useState<VipInfo | null>(null);
  const [sel, setSel] = useState('vip_1m');
  const [paying, setPaying] = useState(false);
  const [welcome, setWelcome] = useState<{ until: string; bonus: number } | null>(null);

  const load = useCallback(() => getVip().then(setInfo).catch(e => Alert.alert('VIP', (e as Error).message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const plan = info?.plans.find(p => p.id === sel) ?? null;

  const join = async () => {
    if (!plan || paying) return;
    setPaying(true);
    try {
      const r = await buyVip(plan.id);
      setInfo(r);
      refresh(); // naya call rate / VIP sab jagah
      if (r.vipUntil) setWelcome({ until: r.vipUntil, bonus: plan.bonusGems });
    } catch (e) {
      if (e instanceof PurchaseCancelled) return; // user ne Play pe khud band kiya
      Alert.alert('VIP', (e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#3d1028', '#1c0a15', colors.bg]} locations={[0, 0.55, 1]} style={styles.topGlow} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Meto VIP</Text>
      </View>

      {!info ? (
        <ActivityIndicator color={colors.gold1} style={{ marginTop: 60 }} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={['#2a1a08', '#120a06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroGlow}>
                <Glow size={280} opacity={0.4} />
              </View>
              <Text style={styles.crown}>👑</Text>
              <Text style={styles.heroTitle}>Meto VIP</Text>
              {info.isVip && info.vipUntil ? (
                <View style={styles.active}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Active till {vipDate(info.vipUntil)}</Text>
                </View>
              ) : (
                <Text style={styles.heroSub}>Bonus gems · cheaper calls · VIP status</Text>
              )}
            </LinearGradient>

            <View style={styles.perks}>
              {PERKS.map((p, i) => (
                <View key={p.title} style={[styles.perk, i > 0 && styles.perkBorder]}>
                  <View style={styles.perkIc}>
                    <Text style={{ fontSize: 17 }}>{p.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.perkTitle}>{p.title}</Text>
                    <Text style={styles.perkSub}>{p.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.plans}>
              {info.plans.map(p => {
                const on = p.id === sel;
                const best = p.id === info.plans[info.plans.length - 1]?.id;
                return (
                  <Pressable key={p.id} onPress={() => setSel(p.id)} style={[styles.plan, on && styles.planOn]}>
                    {on && <LinearGradient colors={['rgba(243,212,136,0.16)', 'rgba(243,212,136,0)']} style={[StyleSheet.absoluteFill, { borderRadius: 17 }]} />}
                    {best && (
                      <LinearGradient colors={gradients.rose} style={styles.save}>
                        <Text style={styles.saveText}>Best value</Text>
                      </LinearGradient>
                    )}
                    <Text style={styles.planLbl}>{p.months === 1 ? '1 Month' : `${p.months} Months`}</Text>
                    <View style={styles.bonusRow}>
                      <Coin size={15} />
                      <Text style={styles.bonusText} numberOfLines={1} adjustsFontSizeToFit>
                        +{fmt(p.bonusGems)}
                      </Text>
                    </View>
                    <Text style={styles.planPrice}>₹{fmt(p.priceInr)}</Text>
                    <Text style={styles.planPer}>₹{p.perWeek.toFixed(2)} / week</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.payBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable onPress={join} disabled={paying}>
              <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                {paying ? (
                  <ActivityIndicator color={colors.goldText} />
                ) : (
                  <Text style={styles.btnText}>
                    {info.isVip ? 'Extend VIP' : 'Join VIP'} · ₹{fmt(plan?.priceInr ?? 0)}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.note}>{IS_TEST_PAYMENTS ? 'Test mode · no real payment' : 'Secure payment via Google Play'}</Text>
          </View>
        </>
      )}

      {welcome && <Welcome until={welcome.until} bonus={welcome.bonus} onClose={() => setWelcome(null)} />}
    </View>
  );
}

function Welcome({ until, bonus, onClose }: { until: string; bonus: number; onClose: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pop, pulse]);
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] });
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.wDim}>
        <View style={styles.wCard}>
          <View style={styles.wCrownWrap}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: glow }] }]}>
              <Glow size={170} opacity={0.6} />
            </Animated.View>
            <Animated.Text style={[styles.wCrown, { transform: [{ scale: pop }] }]}>👑</Animated.Text>
          </View>
          <Text style={styles.wTitle}>You’re VIP now</Text>
          <Text style={styles.wSub}>Active till {vipDate(until)}</Text>
          <Text style={styles.wPerks}>+{fmt(bonus)} bonus gems added · Calls at 900 gems/min</Text>
          <Pressable onPress={onClose} style={{ alignSelf: 'stretch' }}>
            <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
              <Text style={styles.btnText}>Awesome</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 360 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },

  hero: { marginHorizontal: 16, marginTop: 4, borderRadius: 24, paddingVertical: 20, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(246,220,155,0.5)' },
  heroGlow: { position: 'absolute', top: -150, width: 280, height: 280 },
  crown: { fontSize: 48, lineHeight: 58 },
  heroTitle: { color: colors.gold1, fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  heroSub: { color: '#c9b58f', fontSize: 12.5, marginTop: 2 },
  active: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(62,224,143,0.12)' },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.online },
  activeText: { color: colors.online, fontSize: 12.5, fontWeight: '700' },

  perks: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  perkBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  perkIc: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,220,155,0.12)' },
  perkTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  perkSub: { color: colors.muted, fontSize: 11.5, marginTop: 1 },

  plans: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 16 },
  plan: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, overflow: 'visible', backgroundColor: '#262023', borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)' },
  planOn: { borderColor: '#f3d488', borderWidth: 1.5, backgroundColor: '#1e1517' },
  save: { position: 'absolute', top: -9, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  saveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  planLbl: { color: colors.muted, fontSize: 12 },
  planPrice: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 6, maxWidth: '100%' },
  bonusText: { color: colors.gold1, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  planPer: { color: colors.fine, fontSize: 10, marginTop: 1 },

  payBar: { paddingHorizontal: 16, paddingTop: 10 },
  btn: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.goldText, fontSize: 15.5, fontWeight: '800' },
  note: { color: colors.fine, fontSize: 11, textAlign: 'center', marginTop: 8 },

  wDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  wCard: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 28, padding: 22, backgroundColor: '#1a0f0a', borderWidth: 1, borderColor: 'rgba(246,220,155,0.5)' },
  wCrownWrap: { width: 170, height: 170, alignItems: 'center', justifyContent: 'center', marginTop: -10 },
  wCrown: { fontSize: 84, lineHeight: 100 },
  wTitle: { color: colors.gold1, fontSize: 24, fontWeight: '800' },
  wSub: { color: colors.online, fontSize: 13, fontWeight: '700', marginTop: 4 },
  wPerks: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 10, marginBottom: 18, lineHeight: 18 },
});

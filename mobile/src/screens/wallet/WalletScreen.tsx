import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Icon from '../../components/Icon';
import Coin from '../../components/Coin';
import { colors, gradients } from '../../theme';
import { buyPack, fmt, getWallet, IS_TEST_PAYMENTS, type Pack, type WalletSummary, type WalletTx } from '../../services/wallet';
import { useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';
import { PurchaseCancelled } from '../../services/billing';
import { ErrorState, SkeletonList } from '../../components/States';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

// Sikkon ka dher — bada pack, bada dher
const STACKS: { x: number; y: number }[][] = [
  [{ x: 10, y: 8 }],
  [{ x: 4, y: 12 }, { x: 16, y: 4 }],
  [{ x: 2, y: 14 }, { x: 18, y: 14 }, { x: 10, y: 2 }],
  [{ x: 0, y: 15 }, { x: 20, y: 15 }, { x: 4, y: 3 }, { x: 16, y: 0 }],
];

function CoinStack({ n, scale = 1 }: { n: number; scale?: number }) {
  return (
    <View style={{ width: 44 * scale, height: 40 * scale }}>
      {STACKS[n - 1].map((p, i) => (
        <View key={i} style={[styles.stackCoin, { left: p.x * scale, top: p.y * scale }]}>
          <Coin size={24 * scale} />
        </View>
      ))}
    </View>
  );
}

export default function WalletScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { balance, setBalance } = useWallet();
  const [data, setData] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ tx: WalletTx; pack: Pack } | null>(null);

  const load = useCallback(async () => {
    try {
      const w = await getWallet();
      setData(w);
      setBalance(w.balance);
      setSel(s => (s && w.packs.some(p => p.id === s) ? s : w.packs.find(p => p.tag === 'once')?.id ?? w.packs.find(p => p.tag === 'popular')?.id ?? w.packs[0]?.id ?? null));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [setBalance]);

  // Har baar screen pe aate hi taaza (call / gift ke baad bhi sahi balance)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // Live balance (socket) — screen khuli ho tab bhi turant badle
  const shownBalance = balance ?? data?.balance ?? 0;

  const pack = data?.packs.find(p => p.id === sel) ?? null;

  const pay = async () => {
    if (!pack || paying) return;
    setPaying(true);
    try {
      const r = await buyPack(pack.id);
      setBalance(r.balance);
      setDone({ tx: r.tx, pack });
      load();
    } catch (e) {
      if (e instanceof PurchaseCancelled) return; // user ne Play pe khud band kiya
      appAlert('Recharge failed', (e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const mins = data ? Math.floor(shownBalance / Math.max(1, data.callRate)) : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#3d1028', '#1c0a15', colors.bg]} locations={[0, 0.55, 1]} style={styles.topGlow} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Wallet</Text>
        <Pressable onPress={() => navigation.navigate('WalletHistory')} hitSlop={10} style={styles.histBtn}>
          <Icon name="clock" size={16} color="#ffd6e4" />
          <Text style={styles.histText}>History</Text>
        </Pressable>
      </View>

      {!data ? (
        error ? (
          <ErrorState onRetry={load} />
        ) : (
          <SkeletonList rows={5} avatar={false} />
        )
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bal}>
              <Svg style={styles.balShine} width={240} height={240}>
                <Defs>
                  <RadialGradient id="shine" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#ffffff" stopOpacity={0.75} />
                    <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={120} cy={120} r={120} fill="url(#shine)" />
              </Svg>
              <Text style={styles.balLbl}>Gems balance</Text>
              <View style={styles.balRow}>
                <Coin size={34} />
                <Text style={styles.balNum}>{fmt(shownBalance)}</Text>
              </View>
              <Text style={styles.balSub}>
                {mins > 0 ? `≈ ${mins} min of video calls` : `Video calls start at ${data.callRate} gems / min`}
              </Text>
            </LinearGradient>

            {data.packs.some(p => p.tag === 'once') && (
              <LinearGradient
                colors={['rgba(255,95,143,0.18)', 'rgba(255,95,143,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.first}>
                <Text style={styles.firstGift}>🎁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.firstTitle}>New user offer</Text>
                  <Text style={styles.firstSub}>5,000 gems for just ₹100 · only once</Text>
                </View>
                <LinearGradient colors={gradients.rose} style={styles.firstTag}>
                  <Text style={styles.firstTagText}>ONCE</Text>
                </LinearGradient>
              </LinearGradient>
            )}

            <Text style={styles.sec}>Choose a pack</Text>
            <View style={styles.tiles}>
              {data.packs.map(p => {
                const on = p.id === sel;
                return (
                  <Pressable key={p.id} onPress={() => setSel(p.id)} style={[styles.tile, on && styles.tileOn]}>
                    <LinearGradient colors={on ? ['rgba(243,212,136,0.16)', 'rgba(243,212,136,0)'] : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
                    {p.tag === 'once' && (
                      <LinearGradient colors={gradients.rose} style={styles.off}>
                        <Text style={styles.offText}>ONCE</Text>
                      </LinearGradient>
                    )}
                    {p.bonusPct > 0 && (
                      <LinearGradient colors={p.tag === 'best' ? gradients.gold : gradients.rose} style={styles.off}>
                        <Text style={[styles.offText, p.tag === 'best' && { color: colors.goldText }]}>+{p.bonusPct}%</Text>
                      </LinearGradient>
                    )}
                    {/* tag ka naam nahi — sirf % badge (design C) */}
                    <View style={{ marginTop: 4 }}>
                      <CoinStack n={p.gems < 5000 ? 1 : p.gems <= 10000 ? 2 : p.gems <= 50000 ? 3 : 4} scale={1.1} />
                    </View>
                    <Text style={styles.tileNum}>{fmt(p.gems + p.bonus)}</Text>
                    <Text style={styles.tileMins}>≈ {fmt(Math.floor(p.gems / Math.max(1, data.callRate)))} min call</Text>
                    {on ? (
                      <LinearGradient colors={['#fff4d6', '#e6bf6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.price}>
                        <Text style={[styles.priceText, { color: colors.goldText }]}>₹{fmt(p.priceInr)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.price, styles.priceOff]}>
                        <Text style={styles.priceText}>₹{fmt(p.priceInr)}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.payBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable onPress={pay} disabled={!pack || paying}>
              <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payBtn}>
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.payText}>{pack ? `Pay ₹${fmt(pack.priceInr)} · Get ${fmt(pack.total)} gems` : 'Choose a pack'}</Text>
                )}
              </LinearGradient>
            </Pressable>
            <View style={styles.secure}>
              <Icon name="lock" size={12} color={colors.fine} />
              <Text style={styles.secureText}>{IS_TEST_PAYMENTS ? 'Test mode · no real payment' : 'Secure payment via Google Play'}</Text>
            </View>
          </View>
        </>
      )}

      {done && <SuccessModal tx={done.tx} pack={done.pack} onClose={() => setDone(null)} />}
    </View>
  );
}

function SuccessModal({ tx, pack, onClose }: { tx: WalletTx; pack: Pack; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pop, pulse]);

  const first = Number(tx.meta?.firstBonus ?? 0);
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });
  const bob = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient colors={['#4a0f28', '#22091a', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.succ}>
          <View style={styles.burst}>
            <Animated.View style={[styles.burstGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <Animated.View style={{ transform: [{ scale: pop }, { translateY: bob }] }}>
              <Coin size={96} />
            </Animated.View>
          </View>
          <Text style={styles.succTitle}>Recharge successful</Text>
          <Text style={styles.succGot}>+{fmt(tx.amount)}</Text>
          <Text style={styles.succSub}>Gems added to your wallet</Text>
          <View style={styles.receipt}>
            <View style={styles.rRow}>
              <Text style={styles.rLbl}>Pack</Text>
              <Text style={styles.rVal}>
                {fmt(pack.gems)}
                {pack.bonus ? ` + ${fmt(pack.bonus)} bonus` : ''}
              </Text>
            </View>
            {first > 0 && (
              <View style={[styles.rRow, styles.rBorder]}>
                <Text style={styles.rLbl}>First recharge 2×</Text>
                <Text style={[styles.rVal, { color: colors.rose1 }]}>+{fmt(first)}</Text>
              </View>
            )}
            <View style={[styles.rRow, styles.rBorder]}>
              <Text style={styles.rLbl}>Paid</Text>
              <Text style={styles.rVal}>
                ₹{fmt(pack.priceInr)} · {tx.subtitle}
              </Text>
            </View>
            <View style={[styles.rRow, styles.rBorder]}>
              <Text style={styles.rLbl}>New balance</Text>
              <Text style={[styles.rVal, { color: colors.gold1 }]}>{fmt(tx.balanceAfter)} gems</Text>
            </View>
          </View>
        </View>
        <Pressable onPress={onClose} style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payBtn}>
            <Text style={[styles.payText, { color: colors.goldText }]}>Done</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 360 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700', flex: 1 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  histText: { color: '#ffd6e4', fontSize: 13, fontWeight: '600' },
  center: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  err: { color: colors.muted, textAlign: 'center' },
  retry: { marginTop: 14, height: 40, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.surface },
  retryText: { color: colors.rose1, fontWeight: '700' },

  bal: { marginHorizontal: 16, marginTop: 4, borderRadius: 24, padding: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  balShine: { position: 'absolute', right: -70, top: -110 },
  balLbl: { color: '#7a5420', fontSize: 12.5, fontWeight: '500' },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  balNum: { color: colors.goldText, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  balSub: { color: '#7a5420', fontSize: 12, marginTop: 4 },

  first: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,95,143,0.4)' },
  firstGift: { fontSize: 26 },
  firstTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  firstSub: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
  firstTag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  firstTagText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  sec: { color: colors.muted, fontSize: 13.5, fontWeight: '600', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  tile: {
    width: '48.4%',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#262023', // halka kaala (chuna nahi) — phone pe kaala na lage
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  tileOn: { borderColor: '#f3d488', borderWidth: 1.5, backgroundColor: '#1e1517' },
  stackCoin: { position: 'absolute', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3, borderRadius: 30 },
  off: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7 },
  offText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tagText: { alignSelf: 'flex-start', color: colors.rose1, fontSize: 10, fontWeight: '800', letterSpacing: 0.3, height: 14 },
  tileNum: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3, marginTop: 6 },
  tileBonus: { color: colors.online, fontSize: 11, fontWeight: '700', marginTop: 1 },
  tileMins: { color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 1 },
  tileVip: { color: colors.gold1, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  tileFirst: { color: colors.rose1, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  price: { alignSelf: 'stretch', height: 34, marginTop: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  priceOff: { backgroundColor: 'rgba(255,255,255,0.10)' },
  priceText: { color: colors.text, fontSize: 14, fontWeight: '700' },

  payBar: { paddingHorizontal: 16, paddingTop: 10 },
  payBtn: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  payText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  secureText: { color: colors.fine, fontSize: 11 },

  succ: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  burst: { width: 170, height: 170, alignItems: 'center', justifyContent: 'center' },
  burstGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(246,220,155,0.22)', shadowColor: colors.gold2, shadowOpacity: 1, shadowRadius: 40, elevation: 0 },
  succTitle: { color: colors.text, fontSize: 23, fontWeight: '700', marginTop: 14 },
  succGot: { color: colors.gold1, fontSize: 34, fontWeight: '800', marginTop: 6 },
  succSub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  receipt: { alignSelf: 'stretch', marginTop: 24, borderRadius: 18, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  rBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rLbl: { color: colors.muted, fontSize: 13 },
  rVal: { color: colors.text, fontSize: 13, fontWeight: '600' },
});

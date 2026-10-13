import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Coin from './Coin';
import { colors, gradients } from '../theme';
import { buyPack, fmt, getWallet, IS_TEST_PAYMENTS, type WalletSummary } from '../services/wallet';
import { PurchaseCancelled } from '../services/billing';

export type RechargeRequest = {
  needed: number; // kitne gems chahiye (call ke liye 1 minute ka rate)
  peerName?: string;
  inCall?: boolean; // chalti call ke beech — "Recharge & Call" nahi, sirf "Recharge"
  onRecharged?: (balance: number) => void;
};

type Props = RechargeRequest & { balance: number | null; onClose: () => void; onMorePacks: () => void; onBalance: (n: number) => void };

// "Gems kam" — call / gift se pehle, ya call ke beech gems khatam hone wale hon
export default function LowBalanceSheet(p: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<WalletSummary | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    getWallet()
      .then(w => {
        setData(w);
        p.onBalance(w.balance);
        setSel(w.packs.find(x => x.tag === 'popular')?.id ?? w.packs[0]?.id ?? null);
      })
      .catch(e => {
        Alert.alert('Wallet', (e as Error).message);
        p.onClose();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async () => {
    if (!sel || paying) return;
    setPaying(true);
    try {
      const r = await buyPack(sel);
      p.onBalance(r.balance);
      p.onClose();
      p.onRecharged?.(r.balance);
    } catch (e) {
      if (e instanceof PurchaseCancelled) return; // user ne Play pe khud band kiya
      Alert.alert('Recharge failed', (e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const packs = data?.packs.slice(0, 3) ?? [];
  const title = p.inCall ? 'Gems running low' : 'Not enough gems';
  const text = p.inCall
    ? `Recharge now to keep talking${p.peerName ? ` with ${p.peerName}` : ''}. Your call won’t be interrupted.`
    : `A video call${p.peerName ? ` with ${p.peerName}` : ''} needs at least 1 minute of gems.`;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={p.onClose}>
      <Pressable style={styles.dim} onPress={p.onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.warn}>
          <Text style={{ fontSize: 28 }}>💎</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>

        {!data ? (
          <ActivityIndicator color={colors.rose1} style={{ marginVertical: 50 }} />
        ) : (
          <>
            <View style={styles.need}>
              <View style={styles.needBox}>
                <Text style={styles.needLbl}>You have</Text>
                <View style={styles.needRow}>
                  <Coin size={20} />
                  <Text style={styles.needNum}>{fmt(p.balance ?? data.balance)}</Text>
                </View>
              </View>
              <View style={styles.needBox}>
                <Text style={styles.needLbl}>Video call</Text>
                <View style={styles.needRow}>
                  <Coin size={20} />
                  <Text style={styles.needNum}>{fmt(p.needed)}/min</Text>
                </View>
              </View>
            </View>

            <View style={styles.packs}>
              {packs.map(pk => {
                const on = pk.id === sel;
                return (
                  <Pressable key={pk.id} onPress={() => setSel(pk.id)} style={[styles.pack, on && styles.packOn]}>
                    {pk.tag === 'popular' && (
                      <LinearGradient colors={gradients.rose} style={styles.ribbon}>
                        <Text style={styles.ribbonText}>Popular</Text>
                      </LinearGradient>
                    )}
                    <View style={styles.needRow}>
                      <Coin size={18} />
                      <Text style={styles.packNum}>{fmt(pk.total)}</Text>
                    </View>
                    {on ? (
                      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.price}>
                        <Text style={[styles.priceText, { color: colors.goldText }]}>₹{fmt(pk.priceInr)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.price, styles.priceOff]}>
                        <Text style={styles.priceText}>₹{fmt(pk.priceInr)}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {data.packs.some(x => x.tag === 'once') && <Text style={styles.first}>🎁 New user offer: 5,000 gems for ₹100 · once</Text>}

            <Pressable onPress={pay} disabled={paying}>
              <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{p.inCall ? 'Recharge' : 'Recharge & Call'}</Text>}
              </LinearGradient>
            </Pressable>
            {!p.inCall && (
              <Pressable onPress={p.onMorePacks} hitSlop={8}>
                <Text style={styles.more}>More packs in Wallet ›</Text>
              </Pressable>
            )}
            {IS_TEST_PAYMENTS && <Text style={styles.test}>Test mode · no real payment</Text>}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#1a0b13', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  warn: { width: 60, height: 60, borderRadius: 20, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.12)', borderWidth: 1, borderColor: 'rgba(255,95,143,0.35)' },
  title: { color: colors.text, fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  text: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 19, paddingHorizontal: 10 },
  need: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  needBox: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  needLbl: { color: colors.muted, fontSize: 11.5 },
  needRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  needNum: { color: colors.text, fontSize: 15, fontWeight: '700' },
  packs: { flexDirection: 'row', gap: 8 },
  pack: { flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 8, paddingHorizontal: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  packOn: { borderColor: 'rgba(246,220,155,0.75)', backgroundColor: 'rgba(246,220,155,0.08)' },
  ribbon: { position: 'absolute', top: -8, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8 },
  ribbonText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  packNum: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  price: { alignSelf: 'stretch', height: 30, marginTop: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  priceOff: { backgroundColor: 'rgba(255,255,255,0.07)' },
  priceText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  first: { color: colors.rose1, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  btn: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  more: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 12 },
  test: { color: colors.fine, fontSize: 10.5, textAlign: 'center', marginTop: 6 },
});

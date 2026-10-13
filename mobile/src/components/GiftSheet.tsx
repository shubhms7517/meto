import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Coin from './Coin';
import { colors, gradients } from '../theme';
import { ApiError } from '../services/api';
import { newClientId } from '../services/chat';
import { GIFT_QTYS, GIFT_TABS, getGifts, sendGift, type Gift, type GiftBody } from '../services/gifts';
import { fmt } from '../services/wallet';
import { useWallet } from '../context/WalletContext';
import type { ChatMessage } from '../services/chat';
import { success } from '../lib/haptics';

type Props = {
  to: { id: number; name?: string | null };
  callId?: number; // call ke beech bheja
  onClose: () => void;
  onSent: (gift: GiftBody, message: ChatMessage) => void;
  onWallet?: () => void; // balance pe "+" (call ke beech nahi)
};

// "Send a gift" — chat, profile aur call teeno jagah se
export default function GiftSheet({ to, callId, onClose, onSent, onWallet }: Props) {
  const insets = useSafeAreaInsets();
  const { balance, setBalance, openRecharge } = useWallet();
  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const [tab, setTab] = useState<(typeof GIFT_TABS)[number]['key']>('popular');
  const [sel, setSel] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getGifts()
      .then(g => {
        setGifts(g);
        setSel(g.find(x => x.name === 'Love Heart')?.id ?? g[0]?.id ?? null);
      })
      .catch(e => {
        Alert.alert('Gifts', (e as Error).message);
        onClose();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gift = gifts?.find(g => g.id === sel) ?? null;
  const total = gift ? gift.price * qty : 0;
  const shown = gifts?.filter(GIFT_TABS.find(t => t.key === tab)!.filter) ?? [];

  const recharge = () => openRecharge({ needed: Math.max(total, 1), peerName: to.name ?? undefined, inCall: !!callId });

  const send = async () => {
    if (!gift || sending) return;
    if (balance != null && balance < total) return recharge();
    setSending(true);
    // Turant ghatao (server ka jawab aane tak intezaar nahi) — fail hua to wapas
    const before = balance;
    if (before != null) setBalance(before - total);
    try {
      const r = await sendGift(to.id, gift.id, qty, newClientId(), callId);
      success();
      setBalance(r.balance);
      onSent(r.gift, r.message);
      onClose();
    } catch (e) {
      if (before != null) setBalance(before);
      if (e instanceof ApiError && e.code === 'insufficient_gems') recharge();
      else Alert.alert('Gift not sent', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />
        <View style={styles.top}>
          <Text style={styles.title}>Send a gift</Text>
          <Pressable onPress={onWallet && !callId ? onWallet : recharge} style={styles.bal} hitSlop={6}>
            <Coin size={18} />
            <Text style={styles.balText}>{fmt(balance ?? 0)}</Text>
            <LinearGradient colors={gradients.rose} style={styles.plus}>
              <Text style={styles.plusText}>+</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {GIFT_TABS.map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} hitSlop={6}>
              <Text style={[styles.tab, tab === t.key && styles.tabOn]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabLine} />}
            </Pressable>
          ))}
        </View>

        {!gifts ? (
          <ActivityIndicator color={colors.rose1} style={{ marginVertical: 80 }} />
        ) : (
          <View style={styles.grid}>
            {shown.map(g => {
              const on = g.id === sel;
              return (
                <Pressable key={g.id} onPress={() => setSel(g.id)} style={[styles.cell, on && styles.cellOn]}>
                  {g.isRare && (
                    <LinearGradient colors={gradients.gold} style={styles.rare}>
                      <Text style={styles.rareText}>RARE</Text>
                    </LinearGradient>
                  )}
                  <Text style={styles.emoji}>{g.icon}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <View style={styles.priceRow}>
                    <Coin size={12} />
                    <Text style={styles.price}>{fmt(g.price)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.bottom}>
          <View style={styles.qty}>
            {GIFT_QTYS.map(q => (
              <Pressable key={q} onPress={() => setQty(q)} style={[styles.q, qty === q && styles.qOn]}>
                <Text style={[styles.qText, qty === q && { color: colors.text }]}>×{q}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={send} disabled={!gift || sending} style={{ flex: 1 }}>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.send}>
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.sendText}>Send</Text>
                  {gift && (
                    <>
                      <Text style={styles.sendDot}>·</Text>
                      <Coin size={16} />
                      <Text style={styles.sendText}>{fmt(total)}</Text>
                    </>
                  )}
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#1a0b13', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  bal: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 5, paddingRight: 5, borderRadius: 16, backgroundColor: 'rgba(212,166,75,0.12)', borderWidth: 1, borderColor: 'rgba(212,166,75,0.3)' },
  balText: { color: colors.gold1, fontSize: 13, fontWeight: '700' },
  plus: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  plusText: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 20, marginTop: 14, marginBottom: 10, paddingHorizontal: 2 },
  tab: { color: colors.fine, fontSize: 14, fontWeight: '600', paddingBottom: 5 },
  tabOn: { color: colors.text },
  tabLine: { height: 2, borderRadius: 1, backgroundColor: colors.rose1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 230 },
  cell: { width: '25%', alignItems: 'center', paddingTop: 8, paddingBottom: 7, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  cellOn: { backgroundColor: 'rgba(255,95,143,0.12)', borderColor: 'rgba(255,95,143,0.6)' },
  rare: { position: 'absolute', top: 3, right: 5, paddingHorizontal: 4, borderRadius: 5 },
  rareText: { color: colors.goldText, fontSize: 8, fontWeight: '800' },
  emoji: { fontSize: 32, lineHeight: 40 },
  name: { color: colors.muted, fontSize: 11, marginTop: 1, maxWidth: '90%' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  price: { color: colors.gold1, fontSize: 11, fontWeight: '700' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  qty: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  q: { width: 40, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  qOn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  qText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  send: { height: 46, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sendDot: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
});

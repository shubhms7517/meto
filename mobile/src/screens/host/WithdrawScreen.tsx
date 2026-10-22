import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { fmt, getWithdrawals, getWithdrawInfo, requestWithdraw, type Withdrawal, type WithdrawInfo } from '../../services/host';
import { HostHeader } from './common';
import { success } from '../../lib/haptics';
import { appAlert } from '../../lib/dialog';
import Bean, { BEAN_COLOR } from '../../components/Bean';

type Props = NativeStackScreenProps<RootStackParamList, 'Withdraw'>;

// Withdraw sirf beans me: beans chuno → UPI → request. ₹ / TDS / rate host ko nahi dikhate
// (Meto team admin ke rate se UPI pe bhejti hai).
export default function WithdrawScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<WithdrawInfo | null>(null);
  const [list, setList] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Withdrawal | null>(null);

  useFocusEffect(
    useCallback(() => {
      getWithdrawInfo()
        .then(i => {
          setInfo(i);
          setAmount(a => (a && a <= i.beans ? a : i.beans >= i.minBeans ? i.beans : null));
        })
        .catch(e => appAlert('Withdraw', (e as Error).message));
      getWithdrawals()
        .then(r => setList(r.items.slice(0, 5)))
        .catch(() => {});
    }, []),
  );

  const submit = async () => {
    if (!info || !amount) return;
    if (!info.account) {
      navigation.navigate('PayoutAccount');
      return;
    }
    setSending(true);
    try {
      setSent((await requestWithdraw(amount)).withdrawal);
      success();
    } catch (e) {
      appAlert('Withdraw', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // ---- Request bhej di ----
  if (sent) {
    return (
      <View style={st.root}>
        <StatusBar barStyle="light-content" />
        <HostHeader title="Withdraw" top={insets.top} onBack={() => navigation.goBack()} />
        <View style={st.done}>
          <View style={st.ring}>
            <Text style={st.ringText}>✓</Text>
          </View>
          <Text style={st.doneTitle}>Request sent</Text>
          <Text style={st.doneSub}>
            {fmt(sent.beans)} beans withdrawal to <Text style={{ color: colors.text, fontWeight: '700' }}>{sent.upiId}</Text>.{'\n'}We will notify you when it is paid.
          </Text>
        </View>
        <View style={st.steps}>
          <Step n="✓" state="ok" label="Requested" right={new Date(sent.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} />
          <Step n="2" state="now" label="Processing" right="within 48 h" />
          <Step n="3" state="todo" label="Paid to UPI" right="—" last />
        </View>
        <Pressable onPress={() => navigation.goBack()}>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[st.btn, { marginTop: 18 }]}>
            <Text style={[st.btnText, { color: '#fff' }]}>Done</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  const can = !!info && info.beans >= info.minBeans && !info.pending;
  const chips = info ? [info.minBeans, info.minBeans * 2].filter(v => v > 0) : [];

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <HostHeader title="Withdraw" top={insets.top} onBack={() => navigation.goBack()} />
      {!info ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <View style={st.bal}>
            <Text style={st.balLbl}>Beans you can withdraw</Text>
            <View style={st.balRow}>
              <Bean size={30} />
              <Text style={st.balAmt}>{fmt(info.beans)}</Text>
            </View>
          </View>

          {info.pending ? (
            // Ek waqt me ek hi request
            <Pressable onPress={() => navigation.navigate('Withdrawals')} style={st.pending}>
              <Text style={st.pendingTitle}>⏳ {fmt(info.pending.beans)} beans is being processed</Text>
              <Text style={st.pendingSub}>To {info.pending.upiId} · usually within 48 hours · tap to see</Text>
            </Pressable>
          ) : info.beans < info.minBeans ? (
            <View style={st.pending}>
              <Text style={st.pendingTitle}>Minimum withdrawal is {fmt(info.minBeans)} beans</Text>
              <Text style={st.pendingSub}>Keep earning — you need {fmt(info.minBeans - info.beans)} more beans</Text>
            </View>
          ) : null}

          <Text style={st.lbl}>Beans to withdraw</Text>
          <View style={st.amt}>
            {chips.map(v => (
              <AmtChip key={v} label={fmt(v)} on={amount === v} off={!can || v > info.beans} onPress={() => setAmount(v)} />
            ))}
            <AmtChip label={`All · ${fmt(info.beans)}`} on={amount === info.beans} off={!can} onPress={() => setAmount(info.beans)} />
          </View>

          <Text style={st.lbl}>Send to</Text>
          <Pressable onPress={() => navigation.navigate('PayoutAccount')} style={st.upi}>
            <View style={st.upiIc}>
              <Text style={{ fontSize: 17 }}>🏦</Text>
            </View>
            <View style={{ flex: 1 }}>
              {info.account ? (
                <>
                  <Text style={st.upiId}>{info.account.upiId}</Text>
                  <Text style={st.upiSub}>
                    UPI · {info.account.upiName} · PAN {info.account.panMasked} ✓
                  </Text>
                </>
              ) : (
                <>
                  <Text style={st.upiId}>Add UPI &amp; PAN</Text>
                  <Text style={st.upiSub}>Needed once for payouts</Text>
                </>
              )}
            </View>
            <Text style={st.change}>{info.account ? 'Change' : 'Add'}</Text>
          </Pressable>

          {!!amount && (
            <View style={st.bk}>
              <Row label="Withdraw" value={`${fmt(amount)} beans`} />
              <Row label="Left after this" value={`${fmt(Math.max(0, info.beans - amount))} beans`} />
            </View>
          )}

          <Pressable onPress={submit} disabled={!can || !amount || sending} style={(!can || !amount) && { opacity: 0.45 }}>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[st.btnText, { color: '#fff' }]}>{info.account ? `Withdraw ${amount ? `${fmt(amount)} beans` : ''}` : 'Add UPI & PAN to withdraw'}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={st.small}>Minimum {fmt(info.minBeans)} beans · Meto team sends the money to your UPI within 48 hours · 1 request at a time</Text>

          {list.length > 0 && (
            <View style={st.hist}>
              <Text style={st.histTitle}>Your withdrawals</Text>
              {list.map(w => (
                <View key={w.id} style={st.hRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.hMain}>
                      {new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {w.upiId}
                    </Text>
                    <Text style={st.hSub} numberOfLines={1}>
                      {w.status === 'paid' && w.utr ? `UTR ${w.utr}` : w.status === 'rejected' ? (w.reason ?? 'Returned') : 'Processing'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={st.hBeans}>
                      <Bean size={14} />
                      <Text style={st.hAmt}>{fmt(w.beans)} beans</Text>
                    </View>
                    <Text style={[st.hStatus, w.status === 'paid' ? { color: colors.online } : w.status === 'rejected' ? { color: colors.rose1 } : { color: colors.gold1 }]}>
                      {w.status === 'paid' ? 'Paid ✓' : w.status === 'rejected' ? 'Returned' : 'Processing'}
                    </Text>
                  </View>
                </View>
              ))}
              <Pressable onPress={() => navigation.navigate('Withdrawals')} hitSlop={8}>
                <Text style={st.history}>See all ›</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function AmtChip({ label, on, off, onPress }: { label: string; on: boolean; off: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={off} onPress={onPress} style={[st.chip, on && st.chipOn, off && { opacity: 0.35 }]}>
      <Text style={[st.chipText, on && { color: colors.gold1 }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={[st.rowL, strong && { color: colors.text }]}>{label}</Text>
      <Text style={[st.rowV, strong && { color: colors.online, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

function Step({ n, state, label, right, last }: { n: string; state: 'ok' | 'now' | 'todo'; label: string; right: string; last?: boolean }) {
  return (
    <View style={[st.step, !last && st.stepLine]}>
      <View style={[st.dot, state === 'ok' && { backgroundColor: colors.online }, state === 'now' && { backgroundColor: colors.gold1 }]}>
        <Text style={[st.dotText, state !== 'todo' && { color: '#1a0f15' }]}>{n}</Text>
      </View>
      <Text style={st.stepLabel}>{label}</Text>
      <Text style={st.stepRight}>{right}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bal: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 22, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,171,94,0.35)' },
  balLbl: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  balAmt: { color: BEAN_COLOR, fontSize: 32, fontWeight: '800' },
  hist: { marginHorizontal: 16, marginTop: 22, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  histTitle: { color: colors.muted, fontSize: 12.5, fontWeight: '700', marginBottom: 4 },
  hRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  hMain: { color: colors.text, fontSize: 13 },
  hSub: { color: colors.fine, fontSize: 11, marginTop: 2 },
  hBeans: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hAmt: { color: BEAN_COLOR, fontSize: 13, fontWeight: '800' },
  hStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  pending: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(246,220,155,0.08)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.3)' },
  pendingTitle: { color: colors.gold1, fontSize: 13, fontWeight: '800' },
  pendingSub: { color: colors.muted, fontSize: 11.5, marginTop: 3 },
  lbl: { color: colors.muted, fontSize: 12, marginHorizontal: 18, marginTop: 16, marginBottom: 7 },
  amt: { flexDirection: 'row', gap: 7, marginHorizontal: 16 },
  chip: { flex: 1, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: '#f3d488', backgroundColor: 'rgba(243,212,136,0.1)' },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  upi: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 13, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  upiIc: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,224,143,0.12)' },
  upiId: { color: colors.text, fontSize: 14, fontWeight: '700' },
  upiSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  change: { color: colors.rose1, fontSize: 12.5, fontWeight: '800' },
  bk: { marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#1a0f15', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowL: { color: colors.muted, fontSize: 12.5 },
  rowV: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  btn: { marginHorizontal: 16, marginTop: 14, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.goldText, fontSize: 15, fontWeight: '800' },
  small: { color: colors.fine, fontSize: 11, textAlign: 'center', marginTop: 8, marginHorizontal: 20 },
  history: { color: colors.rose1, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  done: { alignItems: 'center', marginTop: 30, paddingHorizontal: 24 },
  ring: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,224,143,0.1)', borderWidth: 2, borderColor: 'rgba(62,224,143,0.5)' },
  ringText: { color: colors.online, fontSize: 46, fontWeight: '800' },
  doneTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 14 },
  doneSub: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  steps: { marginHorizontal: 16, marginTop: 20, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  stepLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  dotText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  stepLabel: { flex: 1, color: colors.text, fontSize: 13 },
  stepRight: { color: colors.muted, fontSize: 11.5 },
});

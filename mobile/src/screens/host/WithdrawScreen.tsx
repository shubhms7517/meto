import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getWithdrawInfo, requestWithdraw, rupees, type Withdrawal, type WithdrawInfo } from '../../services/host';
import { HostHeader } from './common';
import { success } from '../../lib/haptics';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Withdraw'>;

// Withdraw: rakam chuno → UPI → TDS → kitna milega. Request ke baad "Request sent"
export default function WithdrawScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<WithdrawInfo | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Withdrawal | null>(null);

  useFocusEffect(
    useCallback(() => {
      getWithdrawInfo()
        .then(i => {
          setInfo(i);
          setAmount(a => (a && a <= i.availableInr ? a : i.availableInr >= i.minInr ? i.availableInr : null));
        })
        .catch(e => appAlert('Withdraw', (e as Error).message));
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
            {rupees(sent.net)} will reach <Text style={{ color: colors.text, fontWeight: '700' }}>{sent.upiId}</Text>.{'\n'}We'll notify you when it's paid.
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

  const tds = amount && info ? Math.round(amount * info.tdsPct) / 100 : 0;
  const net = amount ? amount - tds : 0;
  const can = !!info && info.availableInr >= info.minInr && !info.pending;
  const chips = info ? [500, 1000].filter(v => v >= info.minInr) : [];

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <HostHeader title="Withdraw" top={insets.top} onBack={() => navigation.goBack()} />
      {!info ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.bal}>
            <Text style={st.balLbl}>Available to withdraw</Text>
            <Text style={st.balAmt}>{rupees(info.points / info.pointsPerInr)}</Text>
            <Text style={st.balSub}>
              {info.points.toLocaleString('en-IN')} points · {info.pointsPerInr} points = ₹1
            </Text>
          </LinearGradient>

          {info.pending ? (
            // Ek waqt me ek hi request
            <Pressable onPress={() => navigation.navigate('Withdrawals')} style={st.pending}>
              <Text style={st.pendingTitle}>⏳ {rupees(info.pending.net)} is being processed</Text>
              <Text style={st.pendingSub}>To {info.pending.upiId} · usually within 48 hours · tap to see</Text>
            </Pressable>
          ) : info.availableInr < info.minInr ? (
            <View style={st.pending}>
              <Text style={st.pendingTitle}>Minimum withdrawal is ₹{info.minInr}</Text>
              <Text style={st.pendingSub}>Keep earning — you need ₹{(info.minInr - info.points / info.pointsPerInr).toFixed(2)} more</Text>
            </View>
          ) : null}

          <Text style={st.lbl}>Amount</Text>
          <View style={st.amt}>
            {chips.map(v => (
              <AmtChip key={v} label={`₹${v.toLocaleString('en-IN')}`} on={amount === v} off={!can || v > info.availableInr} onPress={() => setAmount(v)} />
            ))}
            <AmtChip
              label={`All · ₹${info.availableInr.toLocaleString('en-IN')}`}
              on={amount === info.availableInr}
              off={!can}
              onPress={() => setAmount(info.availableInr)}
            />
          </View>

          <Text style={st.lbl}>Pay to</Text>
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
              <Row label="Amount" value={rupees(amount)} />
              <Row label={`TDS (${info.tdsPct}%, as per law)`} value={`− ${rupees(tds)}`} />
              <View style={st.line} />
              <Row label="You receive" value={rupees(net)} strong />
            </View>
          )}

          <Pressable onPress={submit} disabled={!can || !amount || sending} style={(!can || !amount) && { opacity: 0.45 }}>
            <LinearGradient colors={['#fff4d6', '#e6bf6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
              {sending ? (
                <ActivityIndicator color={colors.goldText} />
              ) : (
                <Text style={st.btnText}>{info.account ? `Withdraw ${amount ? rupees(net) : ''}` : 'Add UPI & PAN to withdraw'}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={st.small}>Minimum ₹{info.minInr} · usually paid within 48 hours · 1 request at a time</Text>

          <Pressable onPress={() => navigation.navigate('Withdrawals')} hitSlop={8}>
            <Text style={st.history}>Withdrawal history ›</Text>
          </Pressable>
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
  bal: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 22, alignItems: 'center' },
  balLbl: { color: colors.goldText, fontSize: 12, fontWeight: '600', opacity: 0.8 },
  balAmt: { color: colors.goldText, fontSize: 32, fontWeight: '800', marginVertical: 2 },
  balSub: { color: colors.goldText, fontSize: 11.5, fontWeight: '700' },
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

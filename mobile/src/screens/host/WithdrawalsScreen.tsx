import React from 'react';
import { FlatList, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { fmt, getWithdrawals } from '../../services/host';
import Bean, { BEAN_COLOR } from '../../components/Bean';
import { HostHeader } from './common';
import { EmptyState, ErrorState, refreshControl, SkeletonList } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';

type Props = NativeStackScreenProps<RootStackParamList, 'Withdrawals'>;

const STATUS = {
  pending: { label: 'Processing', bg: 'rgba(246,220,155,0.15)', fg: colors.gold1 },
  paid: { label: 'Paid ✓', bg: 'rgba(62,224,143,0.15)', fg: colors.online },
  rejected: { label: 'Returned', bg: 'rgba(255,59,92,0.15)', fg: '#ff8a9e' },
} as const;

// Withdraw history (beans me): Processing / Paid (UTR) / Returned (beans wapas)
export default function WithdrawalsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const L = useLoad(() => getWithdrawals().then(r => r.items), { focus: true });
  const items = L.data;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <HostHeader title="Withdrawals" top={insets.top} onBack={() => navigation.goBack()} />
      {L.failed ? (
        <ErrorState onRetry={L.retry} />
      ) : !items ? (
        <SkeletonList rows={4} />
      ) : (
        <FlatList
          data={items}
          refreshControl={refreshControl(L.refreshing, L.refresh)}
          keyExtractor={w => String(w.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: w }) => {
            const s = STATUS[w.status];
            const date = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            const sub = w.status === 'paid' && w.utr ? `${date} · UTR ${w.utr}` : w.status === 'rejected' ? `${date} · ${w.reason ?? ''} · beans returned` : `${date} · ${w.upiId}`;
            return (
              <View style={st.row}>
                <View style={st.ic}>
                  <Bean size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.amt, { color: BEAN_COLOR }]}>{fmt(w.beans)} beans</Text>
                  <Text style={st.sub} numberOfLines={2}>
                    {sub}
                  </Text>
                </View>
                <View style={[st.pill, { backgroundColor: s.bg }]}>
                  <Text style={[st.pillText, { color: s.fg }]}>{s.label}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState icon="🏦" title="No withdrawals yet" text="When you have enough beans, withdraw to your UPI from Me → Withdraw." />}
          ListFooterComponent={
            items.length ? (
              <View style={st.info}>
                <Text style={st.infoText}>
                  If a payout fails, your <Text style={{ color: BEAN_COLOR, fontWeight: '800' }}>beans come back</Text> automatically.
                </Text>
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ic: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  amt: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  info: { marginHorizontal: 16, marginTop: 16, padding: 11, borderRadius: 12, backgroundColor: 'rgba(246,220,155,0.06)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.22)' },
  infoText: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
});

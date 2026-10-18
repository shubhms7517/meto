import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { inr, type HostTx } from '../../services/host';

const ICON: Record<string, string> = { call: '📞', gift: '🎁', message: '💬', withdraw: '🏦', refund: '↩️', admin: '⭐', unlock: '🔓' };

export default function TxRow({ t, perInr }: { t: HostTx; perInr: number }) {
  const zero = t.points === 0;
  return (
    <View style={st.tx}>
      <View style={st.txIc}>
        <Text style={{ fontSize: 15 }}>{ICON[t.kind] ?? '•'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.txTitle} numberOfLines={1}>
          {t.title}
        </Text>
        <Text style={st.txSub}>
          {new Date(t.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {t.subtitle ? ` · ${t.subtitle}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[st.txPts, t.points < 0 && { color: colors.rose1 }, zero && { color: colors.muted }]}>
          {t.points > 0 ? '+' : ''}
          {t.points.toLocaleString('en-IN')}
        </Text>
        <Text style={st.txInr}>{inr(Math.abs(t.points), perInr)}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tx: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  txIc: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.12)' },
  txTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  txSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  txPts: { color: colors.online, fontSize: 13.5, fontWeight: '800' },
  txInr: { color: colors.fine, fontSize: 10.5, marginTop: 1 },
});

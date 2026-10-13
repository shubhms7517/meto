import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getEarnings, getHostMe, inr, type EarningsPage, type HostTx } from '../../services/host';
import { HostHeader } from './common';
import TxRow from './TxRow';

type Props = NativeStackScreenProps<RootStackParamList, 'HostEarnings'>;
type Kind = 'all' | 'call' | 'gift' | 'message';
const TABS: { k: Kind; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'call', label: 'Calls' },
  { k: 'gift', label: 'Gifts' },
  { k: 'message', label: 'Messages' },
];

// Kamai ka poora hisaab + Withdraw (Step 5)
export default function HostEarningsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>('all');
  const [page, setPage] = useState<EarningsPage | null>(null);
  const [items, setItems] = useState<HostTx[]>([]);
  const [balance, setBalance] = useState<number | null>(null); // null = abhi load ho raha

  const load = useCallback(async (k: Kind) => {
    const p = await getEarnings(k);
    setPage(p);
    setItems(p.items);
  }, []);

  useEffect(() => {
    load(kind).catch(() => {});
  }, [kind, load]);
  useEffect(() => {
    getHostMe()
      .then(h => {
        setBalance(h.points);
      })
      .catch(() => {});
  }, []);

  const more = async () => {
    if (!page?.nextBefore) return;
    const p = await getEarnings(kind, page.nextBefore);
    setPage(p);
    setItems(x => [...x, ...p.items]);
  };

  const per = page?.pointsPerInr ?? 100;
  const withdraw = () => navigation.navigate('Withdraw');

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <HostHeader title="Earnings" top={insets.top} onBack={() => navigation.goBack()} />
      <FlatList
        data={items}
        keyExtractor={t => String(t.id)}
        renderItem={({ item }) => <TxRow t={item} perInr={per} />}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <View style={st.big}>
              <Text style={st.bigLbl}>Available balance</Text>
              <Text style={st.bigAmt}>{balance == null ? '…' : inr(balance, per)}</Text>
              <Text style={st.bigSub}>
                {balance == null ? '…' : balance.toLocaleString('en-IN')} points · {per} points = ₹1
              </Text>
            </View>
            <Pressable onPress={withdraw}>
              <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.wd}>
                <Text style={st.wdText}>Withdraw to UPI</Text>
              </LinearGradient>
            </Pressable>
            <View style={st.seg}>
              {TABS.map(t =>
                t.k === kind ? (
                  <LinearGradient key={t.k} colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.segItem}>
                    <Text style={[st.segText, { color: '#fff' }]}>{t.label}</Text>
                  </LinearGradient>
                ) : (
                  <Pressable key={t.k} onPress={() => setKind(t.k)} style={st.segItem}>
                    <Text style={st.segText}>{t.label}</Text>
                  </Pressable>
                ),
              )}
            </View>
            {page && (
              <View style={st.split}>
                {(['call', 'gift', 'message'] as const).map(k => (
                  <View key={k} style={st.splitItem}>
                    <Text style={st.splitAmt}>{inr(page.totals[k], per)}</Text>
                    <Text style={st.splitLbl}>{k === 'call' ? 'Calls' : k === 'gift' ? 'Gifts' : 'Messages'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={page ? <Text style={st.empty}>Nothing here yet</Text> : <ActivityIndicator color={colors.rose1} style={{ marginTop: 30 }} />}
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  big: { marginHorizontal: 16, padding: 18, borderRadius: 22, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(246,220,155,0.4)' },
  bigLbl: { color: colors.muted, fontSize: 12 },
  bigAmt: { color: colors.gold1, fontSize: 34, fontWeight: '800', marginVertical: 2 },
  bigSub: { color: colors.muted, fontSize: 12 },
  wd: { marginHorizontal: 16, marginTop: 12, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wdText: { color: colors.goldText, fontSize: 15, fontWeight: '800' },
  seg: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, padding: 3, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  split: { flexDirection: 'row', gap: 7, marginHorizontal: 16, marginTop: 10, marginBottom: 6 },
  splitItem: { flex: 1, paddingVertical: 9, borderRadius: 14, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  splitAmt: { color: colors.gold1, fontSize: 14, fontWeight: '800' },
  splitLbl: { color: colors.muted, fontSize: 10.5, marginTop: 1 },
  empty: { color: colors.fine, textAlign: 'center', marginTop: 24, fontSize: 12.5 },
});

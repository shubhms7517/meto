import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useWallet } from '../../context/WalletContext';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import {
  fmt,
  getHistory,
  type HistoryFilter,
  type HistoryPage,
  type TxKind,
  type WalletTx,
} from '../../services/wallet';
import type { RootStackParamList } from '../../navigation/types';
import {
  EmptyState,
  ErrorState,
  refreshControl,
  SkeletonList,
} from '../../components/States';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletHistory'>;

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'added', label: 'Added' },
  { key: 'spent', label: 'Spent' },
];

const KIND_ICON: Record<TxKind, { emoji: string; bg: string }> = {
  recharge: { emoji: '💳', bg: 'rgba(62,224,143,0.12)' },
  bonus: { emoji: '🎁', bg: 'rgba(212,166,75,0.14)' },
  checkin: { emoji: '📅', bg: 'rgba(212,166,75,0.14)' },
  message: { emoji: '💬', bg: 'rgba(255,95,143,0.14)' },
  unlock: { emoji: '🔓', bg: 'rgba(212,166,75,0.14)' },
  call: { emoji: '📹', bg: 'rgba(255,95,143,0.12)' },
  gift: { emoji: '🌹', bg: 'rgba(255,95,143,0.12)' },
  refund: { emoji: '↩️', bg: 'rgba(62,224,143,0.12)' },
  admin: { emoji: '🛡️', bg: 'rgba(255,255,255,0.08)' },
};

const time = (d: Date) =>
  d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'TODAY';
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d
    .toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })
    .toUpperCase();
}

export default function WalletHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [items, setItems] = useState<WalletTx[] | null>(null);
  const [month, setMonth] = useState<HistoryPage['month'] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const shownFilter = useRef<HistoryFilter | null>(null);

  // Filter badla → skeleton; wahi filter (screen pe wapas / refresh) → purani list dikhti rahe
  const load = useCallback(async (f: HistoryFilter) => {
    if (shownFilter.current !== f) setItems(null);
    try {
      const r = await getHistory(f);
      setItems(r.items);
      setMonth(r.month);
      setNext(r.nextBefore);
      setFailed(false);
      shownFilter.current = f;
    } catch {
      setFailed(true);
    }
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  };

  // Screen khuli ho aur balance badle (call / gift / recharge) → list bhi taaza
  const { balance } = useWallet();
  const firstBal = useRef(true);
  useEffect(() => {
    if (firstBal.current) {
      firstBal.current = false;
      return;
    }
    getHistory(filter)
      .then(r => {
        setItems(r.items);
        setMonth(r.month);
        setNext(r.nextBefore);
      })
      .catch(() => {});
  }, [balance]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [filter, load]),
  );

  const more = async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await getHistory(filter, next);
      setItems(list => [...(list ?? []), ...r.items]);
      setNext(r.nextBefore);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const sections = useMemo(() => {
    const map = new Map<string, WalletTx[]>();
    for (const t of items ?? []) {
      const k = dayLabel(new Date(t.createdAt));
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map].map(([title, data]) => ({ title, data }));
  }, [items]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#3d1028', '#1c0a15', colors.bg]}
        locations={[0, 0.55, 1]}
        style={styles.topGlow}
      />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.back}
        >
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Gems history</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map(f =>
          f.key === filter ? (
            <LinearGradient
              key={f.key}
              colors={gradients.rose}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chip}
            >
              <Text style={[styles.chipText, { color: '#fff' }]}>
                {f.label}
              </Text>
            </LinearGradient>
          ) : (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, styles.chipOff]}
            >
              <Text style={styles.chipText}>{f.label}</Text>
            </Pressable>
          ),
        )}
      </View>

      {month && (
        <View style={styles.sum}>
          <View style={styles.sumBox}>
            <Text style={styles.sumLbl}>Added this month</Text>
            <Text style={[styles.sumNum, { color: colors.online }]}>
              +{fmt(month.added)}
            </Text>
          </View>
          <View style={styles.sumBox}>
            <Text style={styles.sumLbl}>Spent this month</Text>
            <Text style={styles.sumNum}>
              {month.spent ? `−${fmt(month.spent)}` : '0'}
            </Text>
          </View>
        </View>
      )}

      {failed && !items ? (
        <ErrorState onRetry={() => load(filter)} />
      ) : !items ? (
        <SkeletonList />
      ) : (
        <SectionList
          sections={sections}
          refreshControl={refreshControl(refreshing, refresh)}
          keyExtractor={t => String(t.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onEndReached={more}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => (
            <Text style={styles.day}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const ic = KIND_ICON[item.kind] ?? KIND_ICON.admin;
            const plus = item.amount > 0;
            const extra =
              item.kind === 'recharge'
                ? Number(item.meta?.bonus ?? 0) +
                  Number(item.meta?.firstBonus ?? 0)
                : 0;
            return (
              <View style={styles.tx}>
                <View style={[styles.ic, { backgroundColor: ic.bg }]}>
                  <Text style={styles.icText}>{ic.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.txSub} numberOfLines={1}>
                    {[item.subtitle, time(new Date(item.createdAt))]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.amt, plus && { color: colors.online }]}>
                    {plus ? '+' : '−'}
                    {fmt(Math.abs(item.amount))}
                  </Text>
                  {extra > 0 && (
                    <Text style={styles.amtSub}>incl. {fmt(extra)} bonus</Text>
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.rose1} style={{ margin: 16 }} />
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="💎"
              title="Nothing here yet"
              text="Recharges, calls and gifts will show up here."
              action={{
                label: 'Recharge',
                onPress: () => navigation.navigate('Wallet'),
              }}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 300 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOff: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  sum: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sumBox: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sumLbl: { color: colors.fine, fontSize: 11 },
  sumNum: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  day: {
    color: colors.fine,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 4,
  },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ic: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icText: { fontSize: 19 },
  txTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  txSub: { color: colors.fine, fontSize: 11.5, marginTop: 2 },
  amt: { color: colors.text, fontSize: 15, fontWeight: '700' },
  amtSub: { color: colors.fine, fontSize: 10.5, marginTop: 1 },
});

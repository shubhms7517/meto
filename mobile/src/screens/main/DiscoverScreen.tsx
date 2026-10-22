import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CoinChip from '../../components/CoinChip';
import { onNetChange } from '../../lib/netStatus';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import Glow from '../../components/Glow';
import Icon from '../../components/Icon';
import UserCard from '../../components/UserCard';
import StatusRail from '../../components/StatusRail';
import { useCall } from '../../context/CallContext';
import { launchImageLibrary } from 'react-native-image-picker';
import { getStatusFeed, StatusFeed } from '../../services/status';
import Wordmark from '../../components/Wordmark';
import { colors, gradients } from '../../theme';
import { DEFAULT_FILTER, filterCount, getDiscover, getFollowing, UserCard as Card, type DiscoverFilter } from '../../services/users';
import FilterSheet from '../../components/FilterSheet';

// Filter screen badalne pe bhi yaad rahe (app band hone tak)
let savedFilter: DiscoverFilter = DEFAULT_FILTER;
import type { RootStackParamList } from '../../navigation/types';

type Tab = 'discover' | 'following';

export default function DiscoverScreen() {
  const { width } = useWindowDimensions(); // har render pe asli chaudai (lock / rotate ke baad bhi sahi)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { amHost } = useWallet();

  const [tab, setTab] = useState<Tab>('discover');
  const [users, setUsers] = useState<Card[]>([]);
  const [feed, setFeed] = useState<StatusFeed | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadingMore = useRef(false);
  const [filter, setFilter] = useState<DiscoverFilter>(savedFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const nFilters = filterCount(filter);

  const load = useCallback(
    async (which: Tab, nextPage: number) => {
      const res = which === 'discover' ? await getDiscover(nextPage, filterRef.current) : await getFollowing(nextPage);
      setUsers(prev => {
        if (nextPage === 1) return res.users;
        const seen = new Set(prev.map(u => u.id));
        return [...prev, ...res.users.filter(u => !seen.has(u.id))];
      });
      setPage(nextPage);
      setHasMore(res.hasMore);
    },
    [],
  );

  const refresh = useCallback(
    async (which: Tab) => {
      setError('');
      try {
        await Promise.all([
          load(which, 1),
          which === 'discover' ? getStatusFeed().then(setFeed) : Promise.resolve(),
        ]);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [load],
  );

  useEffect(() => {
    setLoading(true);
    setUsers([]);
    refresh(tab).finally(() => setLoading(false));
  }, [tab, refresh, filter]);

  const retry = () => {
    setLoading(true);
    refresh(tab).finally(() => setLoading(false));
  };
  // Server wapas aaya aur list load nahi hui thi → khud dobara
  const errorRef = useRef(error);
  errorRef.current = error;
  useEffect(() => onNetChange(on => on && !!errorRef.current && refresh(tab)), [tab, refresh]);

  // Chupchaap taaza karna (online status badalta rehta hai): screen pe wapas aane pe + har 1 min.
  // Agar user neeche tak scroll kar chuka hai (page > 1) to list nahi chhedte, sirf favourites row.
  const pageRef = useRef(page);
  pageRef.current = page;
  useFocusEffect(
    useCallback(() => {
      const silent = () => {
        if (pageRef.current === 1) refresh(tab);
        else if (tab === 'discover') getStatusFeed().then(setFeed).catch(() => {});
      };
      const first = setTimeout(silent, 300);
      const timer = setInterval(silent, 60_000);
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
    }, [tab, refresh]),
  );

  const applyFilter = useCallback((f: DiscoverFilter) => {
    savedFilter = f;
    setFilter(f);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh(tab);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore.current || loading) return;
    loadingMore.current = true;
    try {
      await load(tab, page + 1);
    } catch {
      // agli scroll pe dobara try hoga
    } finally {
      loadingMore.current = false;
    }
  };

  // Status lagana: pehle gallery, phir caption wali screen
  const addStatus = useCallback(async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const uri = res.assets?.[0]?.uri;
    if (uri) navigation.navigate('AddStatus', { uri });
  }, [navigation]);

  const openProfile = useCallback((u: Card) => navigation.navigate('Profile', { id: u.id, name: u.name }), [navigation]);
  const { placeCall } = useCall();
  const { balance } = useWallet();
  const { unread } = useNotifications();
  const call = useCallback((u: Card) => placeCall(u), [placeCall]);

  const header = (
    <View>
      <View style={styles.topbar}>
        <Wordmark size={28} />
        <View style={styles.topRight}>
          {amHost ? (
            // Host: app khula = online (gems ki jagah)
            <View style={styles.onlineChip}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          ) : (
            <CoinChip balance={balance} onPress={() => navigation.navigate('Wallet')} />
          )}
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.seg}>
        {(['discover', 'following'] as Tab[]).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.segItem}>
            <Text style={[styles.segText, tab === t && styles.segTextOn]}>{t === 'discover' ? 'Discover' : 'Following'}</Text>
            {tab === t && <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.segLine} />}
          </Pressable>
        ))}
        {tab === 'discover' && (
          <Pressable style={[styles.filter, nFilters > 0 && styles.filterOn]} onPress={() => setFilterOpen(true)}>
            <Icon name="filter" size={14} color={nFilters > 0 ? colors.rose1 : colors.muted} />
            <Text style={[styles.filterText, nFilters > 0 && { color: colors.rose1 }]}>Filter</Text>
            {nFilters > 0 && (
              <View style={styles.filterDot}>
                <Text style={styles.filterDotText}>{nFilters}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Favourites: My status + followed log (status ring / online dot) */}
      {tab === 'discover' && feed && (
        <StatusRail
          feed={feed}
          onAdd={addStatus}
          onOpenMine={() => navigation.navigate('StatusViewer', { userId: 'me' })}
          onOpen={p => (p.statuses.length ? navigation.navigate('StatusViewer', { userId: p.user.id }) : openProfile(p.user))}
        />
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Glow color={colors.rose2} size={width} opacity={0.28} style={{ top: -width * 0.45, right: -width * 0.3 }} />
      <FlatList
        data={users}
        keyExtractor={u => String(u.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <UserCard user={item} onPress={() => openProfile(item)} onCall={() => call(item)} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.rose1} colors={[colors.rose1]} progressBackgroundColor={colors.surface} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.rose1} style={styles.center} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {/* Host ko hosts nahi dikhti — Host center (agla step) tak saaf baat */}
                {error ? 'Could not load' : tab === 'following' ? 'No one yet' : nFilters > 0 ? 'No one matches your filter' : 'No users found'}
              </Text>
              <Text style={styles.emptyText}>
                {error || (tab === 'following' ? 'Follow people you like and they will show up here.' : nFilters > 0 ? 'Try a wider age range or turn off “Online now only”.' : 'Pull down to refresh.')}
              </Text>
              {!!error && (
                <Pressable onPress={retry} style={styles.clearBtn}>
                  <Text style={styles.clearText}>Retry</Text>
                </Pressable>
              )}
              {!error && tab === 'discover' && nFilters > 0 && (
                <Pressable onPress={() => applyFilter(DEFAULT_FILTER)} style={styles.clearBtn}>
                  <Text style={styles.clearText}>Clear filter</Text>
                </Pressable>
              )}
            </View>
          )
        }
        ListFooterComponent={users.length > 0 && hasMore ? <ActivityIndicator color={colors.rose1} style={styles.footer} /> : undefined}
      />
      {tab === 'discover' && !amHost && (
        <Pressable onPress={() => navigation.navigate('Match')} style={[styles.fabWrap, { bottom: Math.max(insets.bottom, 10) + 88 }]}>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
            <Text style={styles.fabBolt}>⚡</Text>
            <Text style={styles.fabText}>Match now</Text>
          </LinearGradient>
        </Pressable>
      )}
      {filterOpen && <FilterSheet value={filter} onApply={applyFilter} onClose={() => setFilterOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  onlineChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(62,224,143,0.12)', borderWidth: 1, borderColor: 'rgba(62,224,143,0.45)' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online },
  onlineText: { color: '#bff5d9', fontSize: 12.5, fontWeight: '700' },
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10 },
  topRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seg: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, gap: 22 },
  segItem: { paddingBottom: 8 },
  segText: { color: colors.fine, fontSize: 15, fontWeight: '600' },
  segTextOn: { color: colors.text, fontSize: 20 },
  segLine: { position: 'absolute', left: 0, bottom: 0, width: 18, height: 3, borderRadius: 2 },
  filter: {
    marginLeft: 'auto',
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  filterOn: { borderColor: 'rgba(255,95,143,0.55)', backgroundColor: 'rgba(255,95,143,0.1)' },
  filterDot: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose1 },
  filterDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bellBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose1, borderWidth: 2, borderColor: colors.bg },
  bellText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  fabWrap: { position: 'absolute', right: 16, borderRadius: 26, elevation: 10, shadowColor: colors.rose2, shadowOpacity: 0.8, shadowRadius: 14 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingLeft: 16, paddingRight: 20, borderRadius: 26 },
  fabBolt: { fontSize: 17 },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  clearBtn: { marginTop: 14, height: 40, paddingHorizontal: 20, borderRadius: 13, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.55)', backgroundColor: 'rgba(255,95,143,0.1)' },
  clearText: { color: colors.rose1, fontSize: 13.5, fontWeight: '700' },
  railTitle: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  railTitleText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  rail: { paddingHorizontal: 20, gap: 14 },
  story: { alignItems: 'center', width: 60 },
  ring: { width: 58, height: 58, borderRadius: 29, padding: 2.5 },
  storyAv: { flex: 1, borderRadius: 27, borderWidth: 2.5, borderColor: colors.bg },
  storyDot: {
    position: 'absolute',
    top: 44,
    right: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.online,
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  storyName: { color: colors.muted, fontSize: 11, marginTop: 6 },
  row: { gap: 12, paddingHorizontal: 16, marginTop: 12 },
  center: { marginTop: 80 },
  footer: { marginVertical: 20 },
  empty: { alignItems: 'center', marginTop: 70, paddingHorizontal: 40 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

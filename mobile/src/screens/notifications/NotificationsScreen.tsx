import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import Avatar from '../../components/Avatar';
import LevelBadge from '../../components/LevelBadge';
import CheckInSheet from '../../components/CheckInSheet';
import { colors, gradients } from '../../theme';
import { ago, getNotifications, markNotificationsRead, type AppNotification, type NotifTab } from '../../services/notifications';
import { setFollow } from '../../services/users';
import { fmt } from '../../services/wallet';
import { vipDate } from '../../services/rewards';
import { useCall } from '../../context/CallContext';
import { openNotification, useNotifications } from '../../context/NotificationContext';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, ErrorState, refreshControl, SkeletonList } from '../../components/States';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TABS: { key: NotifTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'calls', label: 'Calls' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'follows', label: 'Follows' },
  { key: 'meto', label: 'Meto' },
];

// Har type ka rang (card ki halki chamak + border)
const TINT: Record<string, [string, string]> = {
  call_missed: ['rgba(255,59,92,0.22)', 'rgba(255,59,92,0.45)'],
  gift: ['rgba(246,220,155,0.18)', 'rgba(246,220,155,0.4)'],
  follow: ['rgba(255,95,143,0.16)', 'rgba(255,95,143,0.35)'],
  level_up: ['rgba(255,95,143,0.2)', 'rgba(255,95,143,0.4)'],
  recharge: ['rgba(62,224,143,0.14)', 'rgba(62,224,143,0.3)'],
  vip: ['rgba(246,220,155,0.16)', 'rgba(246,220,155,0.35)'],
  vip_ending: ['rgba(246,220,155,0.16)', 'rgba(246,220,155,0.35)'],
  checkin: ['rgba(255,95,143,0.14)', 'rgba(255,95,143,0.3)'],
  notice: ['rgba(246,220,155,0.16)', 'rgba(246,220,155,0.4)'],
  report: ['rgba(78,167,255,0.14)', 'rgba(78,167,255,0.3)'],
};

const BADGE: Record<string, { e: string; bg: string; ring: string[] }> = {
  call_missed: { e: '📞', bg: '#ff3b5c', ring: ['#ff5b6f', '#e0103f'] },
  gift: { e: '🎁', bg: '#d4a64b', ring: ['#fff4d6', '#d4a64b'] },
  follow: { e: '❤', bg: '#ff5f8f', ring: [colors.rose1, colors.rose2] },
};

const ICON: Record<string, string> = { recharge: '💳', vip: '👑', vip_ending: '⏳', checkin: '🎁', notice: '🛡️', report: '🛡️' };

function dayKey(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'TODAY';
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

function text(n: AppNotification): { l1: string; l2: React.ReactNode } {
  const d = n.data ?? {};
  const name = n.actor?.name ?? 'Someone';
  switch (n.type) {
    case 'call_missed':
      return { l1: name, l2: 'Missed video call' };
    case 'gift':
      return {
        l1: name,
        l2: (
          <>
            sent you <Text style={styles.gold}>{d.name}</Text>
            {d.total ? ` · ${fmt(Number(d.total))} gems` : ''}
          </>
        ),
      };
    case 'follow':
      return { l1: name, l2: 'started following you' };
    case 'level_up':
      return {
        l1: `Level up! You reached Lv.${d.level}`,
        l2: d.reward ? (
          <>
            <Text style={styles.gold}>+{fmt(Number(d.reward))} gems</Text> added to your wallet
          </>
        ) : (
          'Recharge more to reach the next level'
        ),
      };
    case 'recharge':
      return { l1: 'Recharge successful', l2: `${fmt(Number(d.gems ?? 0))} gems added · ₹${fmt(Number(d.priceInr ?? 0))}` };
    case 'vip':
      return { l1: 'VIP activated 👑', l2: `${d.bonus ? `+${fmt(Number(d.bonus))} bonus gems · ` : ''}active till ${d.until ? vipDate(d.until) : ''}` };
    case 'vip_ending':
      return { l1: 'Your VIP ends soon', l2: `Active till ${d.until ? vipDate(d.until) : ''} · extend to keep 900/min calls` };
    case 'checkin':
      return new Date(n.createdAt).toDateString() === new Date().toDateString()
        ? { l1: 'Your daily check-in is ready', l2: 'Claim today’s free gems' }
        : { l1: 'Daily check-in', l2: 'Come back every day for free gems' };
    case 'report':
      return { l1: 'Report reviewed', l2: 'Thanks — we have taken action' };
    case 'notice':
      return { l1: String(d.title ?? 'Official notice'), l2: String(d.body ?? '') };
  }
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { placeCall } = useCall();
  const { setUnread } = useNotifications();
  const [tab, setTab] = useState<NotifTab>('all');
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [counts, setCounts] = useState<Record<NotifTab, number> | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (t: NotifTab) => {
    try {
      const r = await getNotifications(t);
      setItems(r.items);
      setCounts(r.unread);
      setNext(r.nextBefore);
      setFailed(false);
    } catch {
      setFailed(true); // purani list ho to wahi dikhe, warna Retry
    }
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    await load(tab);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [tab, load]),
  );

  const more = async () => {
    if (!next) return;
    const r = await getNotifications(tab, next).catch(() => null);
    if (!r) return;
    setItems(l => [...(l ?? []), ...r.items]);
    setNext(r.nextBefore);
  };

  const markOne = (n: AppNotification) => {
    if (n.read) return;
    setItems(l => l?.map(x => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
    markNotificationsRead([n.id]).catch(() => {});
  };

  const markAll = async () => {
    setItems(l => l?.map(x => ({ ...x, read: true })) ?? l);
    setCounts(c => (c ? { all: 0, calls: 0, gifts: 0, follows: 0, meto: 0 } : c));
    setUnread(0);
    await markNotificationsRead().catch(() => {});
  };

  const followBack = async (n: AppNotification) => {
    if (!n.actor) return;
    markOne(n);
    setItems(l => l?.map(x => (x.actor?.id === n.actor!.id && x.type === 'follow' ? { ...x, iFollow: true } : x)) ?? l);
    await setFollow(n.actor.id, true).catch(e => appAlert('Follow', (e as Error).message));
  };

  const press = (n: AppNotification) => {
    markOne(n);
    if (n.type === 'checkin') return setCheckIn(true);
    if (n.type === 'notice' || n.type === 'report') return;
    openNotification(n);
  };

  const sections = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of items ?? []) map.set(dayKey(n.createdAt), [...(map.get(dayKey(n.createdAt)) ?? []), n]);
    return [...map].map(([title, data]) => ({ title, data }));
  }, [items]);

  const renderItem = ({ item: n }: { item: AppNotification }) => {
    if (n.type === 'notice') {
      return (
        <Pressable onPress={() => markOne(n)}>
          <LinearGradient colors={['rgba(246,220,155,0.14)', '#1e1519']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.notice}>
            <View style={styles.noticeTop}>
              <Text style={styles.noticeTitle}>🛡️ {String(n.data?.title ?? 'Official notice')}</Text>
              {!n.read && <View style={styles.dot} />}
            </View>
            <Text style={styles.noticeBody}>{String(n.data?.body ?? '')}</Text>
            <Text style={styles.time}>
              {ago(n.createdAt)} · Meto Team
            </Text>
          </LinearGradient>
        </Pressable>
      );
    }
    const [tint, border] = TINT[n.type] ?? TINT.report;
    const t = text(n);
    const badge = BADGE[n.type];
    return (
      <Pressable onPress={() => press(n)}>
        <LinearGradient
          colors={n.read ? ['#1e1519', '#1e1519'] : [tint, 'rgba(30,21,25,0.95)']}
          locations={[0, 0.55]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.3 }}
          style={[styles.card, { borderColor: n.read ? 'rgba(255,255,255,0.06)' : border }]}>
          {/* Baayein: photo + badge / level heera / icon */}
          {n.actor && badge ? (
            <View>
              <LinearGradient colors={badge.ring} style={styles.ring}>
                <Avatar uri={n.actor.avatarUrl} seed={n.actor.id} style={styles.av} iconScale={0.9} />
              </LinearGradient>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={styles.badgeText}>{badge.e}</Text>
              </View>
            </View>
          ) : n.type === 'level_up' ? (
            <LevelBadge level={Number(n.data?.level ?? 1)} size={48} />
          ) : (
            <View style={[styles.icon, { backgroundColor: tint }]}>
              <Text style={{ fontSize: 21 }}>{ICON[n.type] ?? '🔔'}</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.l1} numberOfLines={1}>
              {t.l1}
            </Text>
            <Text style={styles.l2} numberOfLines={2}>
              {t.l2}
            </Text>
            <View style={styles.tm}>
              {!n.read && <View style={styles.dot} />}
              <Text style={styles.time}>{ago(n.createdAt)}</Text>
            </View>
          </View>

          {/* Daayein: action */}
          {n.type === 'call_missed' && n.actor && (
            <Pressable
              onPress={() => {
                markOne(n);
                placeCall(n.actor!);
              }}
              hitSlop={6}>
              <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Icon name="videoFill" size={14} color="#fff" />
                <Text style={styles.btnText}>Call back</Text>
              </LinearGradient>
            </Pressable>
          )}
          {n.type === 'gift' && (
            <View style={styles.gtile}>
              <Text style={{ fontSize: 28 }}>{String(n.data?.icon ?? '🎁')}</Text>
              {Number(n.data?.qty) > 1 && (
                <LinearGradient colors={gradients.gold} style={styles.qty}>
                  <Text style={styles.qtyText}>×{n.data?.qty}</Text>
                </LinearGradient>
              )}
            </View>
          )}
          {n.type === 'follow' && !n.iFollow && (
            <Pressable onPress={() => followBack(n)} hitSlop={6} style={styles.line}>
              <Text style={styles.lineText}>+ Follow</Text>
            </Pressable>
          )}
          {/* Claim sirf aaj wali pe — purani check-in notification pe button nahi */}
          {n.type === 'checkin' && new Date(n.createdAt).toDateString() === new Date().toDateString() && (
            <Pressable onPress={() => press(n)} hitSlop={6}>
              <LinearGradient colors={['#fff4d6', '#e6bf6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Text style={[styles.btnText, { color: colors.goldText }]}>Claim</Text>
              </LinearGradient>
            </Pressable>
          )}
          {n.type === 'vip_ending' && (
            <Pressable onPress={() => press(n)} hitSlop={6}>
              <LinearGradient colors={['#fff4d6', '#e6bf6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Text style={[styles.btnText, { color: colors.goldText }]}>Extend</Text>
              </LinearGradient>
            </Pressable>
          )}
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#3d1028', '#170910', colors.bg]} locations={[0, 0.5, 1]} style={styles.topGlow} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        {!!counts?.all && (
          <Pressable onPress={markAll} hitSlop={8}>
            <Text style={styles.mark}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map(t => {
            const on = t.key === tab;
            const c = counts?.[t.key] ?? 0;
            const inner = (
              <>
                <Text style={[styles.tabText, on && { color: '#fff' }]}>{t.label}</Text>
                {c > 0 && (
                  <View style={[styles.tabCount, on && { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
                    <Text style={styles.tabCountText}>{c > 99 ? '99+' : c}</Text>
                  </View>
                )}
              </>
            );
            return on ? (
              <LinearGradient key={t.key} colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tab}>
                {inner}
              </LinearGradient>
            ) : (
              <Pressable
                key={t.key}
                onPress={() => {
                  setItems(null);
                  setTab(t.key);
                }}
                style={[styles.tab, styles.tabOff]}>
                {inner}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {failed && !items ? (
        <ErrorState onRetry={() => load(tab)} />
      ) : !items ? (
        <SkeletonList />
      ) : (
        <SectionList
          sections={sections}
          refreshControl={refreshControl(refreshing, refresh)}
          keyExtractor={n => String(n.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onEndReached={more}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => {
            const fresh = section.data.filter(n => !n.read).length;
            return (
              <View style={styles.day}>
                <Text style={styles.dayText}>{section.title}</Text>
                {fresh > 0 && (
                  <View style={styles.newPill}>
                    <Text style={styles.newText}>{fresh} new</Text>
                  </View>
                )}
                <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dayLine} />
              </View>
            );
          }}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState icon="🔔" title="No notifications yet" text="Gifts, follows and missed calls will show up here." />}
        />
      )}
      {checkIn && <CheckInSheet onClose={() => setCheckIn(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 320 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700', flex: 1 },
  mark: { color: colors.rose1, fontSize: 12.5, fontWeight: '700' },
  tabs: { gap: 7, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 },
  tabOff: { backgroundColor: '#241c20', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  tabCount: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose1 },
  tabCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  day: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  dayText: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  newPill: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(255,95,143,0.18)' },
  newText: { color: colors.rose1, fontSize: 11, fontWeight: '800' },
  dayLine: { flex: 1, height: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  ring: { width: 48, height: 48, borderRadius: 24, padding: 2 },
  av: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#1e1519' },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#1e1519' },
  badgeText: { fontSize: 10, color: '#fff' },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  l1: { color: colors.text, fontSize: 14, fontWeight: '700' },
  l2: { color: colors.muted, fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  gold: { color: colors.gold1, fontWeight: '700' },
  tm: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose1 },
  time: { color: colors.fine, fontSize: 11 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 13, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  line: { height: 34, paddingHorizontal: 13, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.1)', borderWidth: 1, borderColor: 'rgba(255,95,143,0.5)' },
  lineText: { color: colors.rose1, fontSize: 12.5, fontWeight: '800' },
  gtile: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,220,155,0.14)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.45)' },
  qty: { position: 'absolute', right: -5, bottom: -6, paddingHorizontal: 5, borderRadius: 7 },
  qtyText: { color: colors.goldText, fontSize: 10, fontWeight: '800' },
  notice: { marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(246,220,155,0.35)' },
  noticeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noticeTitle: { color: colors.gold1, fontSize: 14, fontWeight: '800', flex: 1 },
  noticeBody: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 6 },
});

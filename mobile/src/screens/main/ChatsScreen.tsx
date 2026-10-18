import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import Ticks from '../../components/Ticks';
import { colors, gradients } from '../../theme';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { formatDuration, getCallLog } from '../../services/calls';
import { chatTime, ChatSummary, FollowerCard, getFollowers, getFriends, previewText } from '../../services/chat';
import { setFollow, timeAgo, UserCard } from '../../services/users';
import type { RootStackParamList } from '../../navigation/types';

type Tab = 'chats' | 'friends' | 'followed' | 'calls';
const TABS: { key: Tab; label: string }[] = [
  { key: 'chats', label: 'Chats' },
  { key: 'friends', label: 'Friends' },
  { key: 'followed', label: 'Followed' },
  { key: 'calls', label: 'Calls' },
];
const NEW_FOLLOWER_MS = 24 * 60 * 60_000;

export default function ChatsScreen() {
  const { width } = useWindowDimensions(); // har render pe asli chaudai (lock / rotate ke baad bhi sahi)
  const TAB_W = (width - 28) / 4;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { chats, loaded, typing, refresh } = useChat();
  const { placeCall } = useCall();

  const [tab, setTab] = useState<Tab>('chats');
  const slide = useRef(new Animated.Value(0)).current;
  const [friends, setFriends] = useState<UserCard[] | null>(null);
  const [followers, setFollowers] = useState<FollowerCard[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const newFollowers = (followers ?? []).filter(f => !f.isFollowingBack && Date.now() - new Date(f.followedAt).getTime() < NEW_FOLLOWER_MS).length;

  const loadTab = useCallback(
    async (t: Tab) => {
      if (t === 'chats') await refresh();
      if (t === 'friends') await getFriends().then(r => setFriends(r.users)).catch(() => setFriends(f => f ?? []));
      if (t === 'followed') await getFollowers().then(r => setFollowers(r.users)).catch(() => setFollowers(f => f ?? []));
    },
    [refresh],
  );

  // Tab pe aate hi taaza data; Followed ka count tab bar ke liye pehle se
  useFocusEffect(
    useCallback(() => {
      loadTab(tab);
      if (tab !== 'followed') getFollowers().then(r => setFollowers(r.users)).catch(() => {});
    }, [tab, loadTab]),
  );

  useEffect(() => {
    Animated.spring(slide, { toValue: TABS.findIndex(t => t.key === tab) * TAB_W, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [tab, slide, TAB_W]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTab(tab);
    setRefreshing(false);
  };

  const openChat = (u: { id: number; name: string }) => navigation.navigate('Chat', { id: u.id, name: u.name });
  const openProfile = (u: { id: number; name: string }) => navigation.navigate('Profile', { id: u.id, name: u.name });

  const followBack = async (u: FollowerCard) => {
    setFollowers(fs => fs?.map(f => (f.id === u.id ? { ...f, isFollowingBack: true } : f)) ?? fs);
    try {
      await setFollow(u.id, true);
      setFriends(null); // Friends list badal gayi
    } catch {
      setFollowers(fs => fs?.map(f => (f.id === u.id ? { ...f, isFollowingBack: false } : f)) ?? fs);
    }
  };

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.rose1} colors={[colors.rose1]} progressBackgroundColor={colors.surface} />
  );
  const listPad = { paddingHorizontal: 14, paddingBottom: insets.bottom + 110, gap: 10 };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#5a0f2e', '#2a0a19', colors.bg]} locations={[0, 0.5, 1]} style={[styles.topGlow, { height: insets.top + 260 }]} />

      <Text style={[styles.title, { paddingTop: insets.top + 6 }]}>Chats</Text>
      <View style={styles.tabs}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, { width: TAB_W }]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabOn]}>{t.label}</Text>
            {t.key === 'followed' && newFollowers > 0 && (
              <LinearGradient colors={gradients.rose} style={styles.n}>
                <Text style={styles.nText}>{newFollowers}</Text>
              </LinearGradient>
            )}
          </Pressable>
        ))}
        <Animated.View style={[styles.lineWrap, { width: TAB_W, transform: [{ translateX: slide }] }]}>
          <LinearGradient colors={[colors.gold1, colors.rose1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.line} />
        </Animated.View>
      </View>

      {/* ---------------- Chats ---------------- */}
      {tab === 'chats' && (
        <FlatList
          data={chats}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={listPad}
          refreshControl={refreshControl}
          ListHeaderComponent={<NoticeCard />}
          renderItem={({ item }) => <ChatRow chat={item} typing={!!typing[item.user.id]} onPress={() => openChat(item.user)} onAvatar={() => openProfile(item.user)} />}
          ListEmptyComponent={
            loaded ? (
              <Empty icon="chat" title="No chats yet" text="Find someone you like on Discover and say hi 👋" />
            ) : (
              <ActivityIndicator color={colors.rose1} style={{ marginTop: 40 }} />
            )
          }
        />
      )}

      {/* ---------------- Friends ---------------- */}
      {tab === 'friends' && (
        <FlatList
          data={friends ?? []}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={listPad}
          refreshControl={refreshControl}
          ListHeaderComponent={friends?.length ? <Text style={styles.sec}>FRIENDS · {friends.length}</Text> : undefined}
          renderItem={({ item }) => (
            <Pressable onPress={() => openProfile(item)} style={styles.card}>
              <AvatarDot user={item} />
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {item.isVerified && <Icon name="verified" size={15} />}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.online ? 'Online' : item.lastSeenAt ? `Active ${timeAgo(item.lastSeenAt)} ago` : 'Offline'}
                  {item.city ? ` · ${item.city}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => openChat(item)} style={styles.actChat} hitSlop={4}>
                <Icon name="chat" size={18} />
              </Pressable>
              <Pressable onPress={() => placeCall(item)} hitSlop={4}>
                <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actCall}>
                  <Icon name="videoFill" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            friends ? (
              <Empty icon="user" title="No friends yet" text="When you and someone follow each other, they appear here." />
            ) : (
              <ActivityIndicator color={colors.rose1} style={{ marginTop: 40 }} />
            )
          }
        />
      )}

      {/* ---------------- Followed ---------------- */}
      {tab === 'followed' && (
        <FlatList
          data={followers ?? []}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={listPad}
          refreshControl={refreshControl}
          ListHeaderComponent={followers?.length ? <Text style={styles.sec}>PEOPLE WHO FOLLOW YOU</Text> : undefined}
          renderItem={({ item }) => {
            const isNew = Date.now() - new Date(item.followedAt).getTime() < NEW_FOLLOWER_MS;
            return (
              <Pressable onPress={() => openProfile(item)} style={styles.card}>
                <AvatarDot user={item} />
                <View style={styles.body}>
                  <View style={styles.row}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {item.isVerified && <Icon name="verified" size={15} />}
                    {isNew && !item.isFollowingBack && <Text style={styles.newTag}>NEW</Text>}
                  </View>
                  <Text style={styles.sub}>{item.isFollowingBack ? 'Friends ✓' : `Followed you · ${timeAgo(item.followedAt)} ago`}</Text>
                </View>
                {item.isFollowingBack ? (
                  <Pressable onPress={() => openChat(item)} style={styles.actChat} hitSlop={4}>
                    <Icon name="chat" size={18} />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => followBack(item)} hitSlop={4}>
                    <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followBtn}>
                      <Icon name="plus" size={14} color="#fff" strokeWidth={2.6} />
                      <Text style={styles.followText}>Follow</Text>
                    </LinearGradient>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            followers ? (
              <Empty icon="heartOutline" title="No followers yet" text="Add photos and a bio — people follow complete profiles." />
            ) : (
              <ActivityIndicator color={colors.rose1} style={{ marginTop: 40 }} />
            )
          }
        />
      )}

      {/* ---------------- Calls ---------------- */}
      {tab === 'calls' && <CallsTab bottom={insets.bottom} />}
    </View>
  );
}

function AvatarDot({ user }: { user: UserCard }) {
  return (
    <View>
      <Avatar uri={user.avatarUrl} seed={user.id} style={styles.av} iconScale={0.9} />
      {user.online && <View style={styles.dot} />}
    </View>
  );
}

function ChatRow({ chat, typing, onPress, onAvatar }: { chat: ChatSummary; typing: boolean; onPress: () => void; onAvatar: () => void }) {
  const m = chat.lastMessage;
  const mine = m.to === chat.user.id;
  const unread = chat.unread > 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <Pressable onPress={onAvatar}>
        <AvatarDot user={chat.user} />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{chat.user.name}</Text>
          {chat.user.isVerified && <Icon name="verified" size={15} />}
          <Text style={[styles.time, unread && { color: colors.rose1, fontWeight: '600' }]}>{chatTime(m.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          {typing && !chat.blocked ? (
            <Text style={[styles.last, styles.typing]}>typing…</Text>
          ) : (
            <>
              {mine && <Ticks m={m} color={colors.fine} size={14} />}
              <Text style={[styles.last, unread && styles.lastUnread]} numberOfLines={1}>
                {chat.blocked ? 'Blocked' : previewText(m)}
              </Text>
            </>
          )}
          {unread && (
            <LinearGradient colors={['#ff4d6d', '#e0103f']} style={styles.badge}>
              <Text style={styles.badgeText}>{chat.unread > 99 ? '99+' : chat.unread}</Text>
            </LinearGradient>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Abhi app ki taraf se welcome — Part 2 me asli notices (admin se)
function NoticeCard() {
  return (
    <LinearGradient colors={['rgba(246,220,155,0.16)', 'rgba(255,95,143,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.card, styles.notice]}>
      <LinearGradient colors={['#ffd27a', '#f08a24', '#c4570f']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.bell}>
        <Icon name="bell" size={22} color="#fff" />
      </LinearGradient>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.name}>Official Notice</Text>
        </View>
        <Text style={styles.last} numberOfLines={1}>
          Welcome to Meto 💖 Never share money or OTP in chats.
        </Text>
      </View>
    </LinearGradient>
  );
}

type CallFilter = 'all' | 'missed' | 'called';
type LogItem = Awaited<ReturnType<typeof getCallLog>>['calls'][number];

function CallsTab({ bottom }: { bottom: number }) {
  const { placeCall } = useCall();
  const [filter, setFilter] = useState<CallFilter>('all');
  const [calls, setCalls] = useState<LogItem[] | null>(null);
  const [missed, setMissed] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      getCallLog(filter)
        .then(r => {
          setCalls(r.calls);
          setMissed(r.missedCount);
        })
        .catch(() => setCalls(c => c ?? [])),
    [filter],
  );
  useFocusEffect(
    useCallback(() => {
      setCalls(null);
      load();
    }, [load]),
  );

  const describe = (c: LogItem) => {
    if (c.status === 'ended') return `Video · ${formatDuration(c.durationSec)}`;
    if (c.outgoing) return c.status === 'busy' ? 'User was busy' : c.status === 'cancelled' ? 'Cancelled' : 'Not answered';
    return c.status === 'declined' ? 'Declined' : 'Missed video call';
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.cfilter}>
        {(['all', 'missed', 'called'] as CallFilter[]).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={styles.cfItem}>
            {filter === f && (
              <LinearGradient
                colors={f === 'missed' ? ['#ff6b6b', '#e0103f'] : gradients.rose}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.row}>
              <Text style={[styles.cfText, filter === f && { color: '#fff' }]}>{f === 'all' ? 'All' : f === 'missed' ? 'Missed' : 'Called'}</Text>
              {f === 'missed' && missed > 0 && (
                <View style={[styles.n, { backgroundColor: filter === f ? 'rgba(255,255,255,0.28)' : '#e0103f' }]}>
                  <Text style={styles.nText}>{missed}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={calls ?? []}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: bottom + 110, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.rose1}
            colors={[colors.rose1]}
            progressBackgroundColor={colors.surface}
          />
        }
        renderItem={({ item }) => {
          const peer = item.outgoing ? item.callee : item.caller;
          const bad = !item.outgoing && item.status !== 'ended';
          return (
            <View style={styles.card}>
              <AvatarDot user={peer} />
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={[styles.name, bad && { color: '#ff8a8a' }]} numberOfLines={1}>{peer.name}</Text>
                  <Text style={styles.time}>{chatTime(item.createdAt)}</Text>
                </View>
                <View style={styles.row}>
                  <View style={[styles.cic, bad ? styles.cicMissed : item.outgoing ? styles.cicOut : styles.cicIn]}>
                    <Text style={[styles.cicArrow, { color: bad ? '#ff7a7a' : item.outgoing ? '#6fd3ff' : colors.online }]}>{item.outgoing ? '↗' : '↙'}</Text>
                  </View>
                  <Text style={styles.sub}>{describe(item)}</Text>
                </View>
              </View>
              <Pressable onPress={() => placeCall(peer)} hitSlop={4}>
                <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actCall}>
                  <Icon name="videoFill" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          calls ? (
            <Empty
              icon="video"
              title={filter === 'missed' ? 'No missed calls' : 'No calls yet'}
              text={filter === 'missed' ? 'Missed calls from the last 30 days appear here.' : 'Your video call history will appear here.'}
            />
          ) : (
            <ActivityIndicator color={colors.rose1} style={{ marginTop: 40 }} />
          )
        }
      />
    </View>
  );
}

function Empty({ icon, title, text }: { icon: 'chat' | 'user' | 'heartOutline' | 'video'; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIc}>
        <Icon name={icon} size={28} color={colors.rose1} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 18, paddingBottom: 6 },
  tabs: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 8, paddingBottom: 11 },
  tabText: { color: colors.fine, fontSize: 13, fontWeight: '600' },
  tabOn: { color: '#fff' },
  lineWrap: { position: 'absolute', bottom: -1, left: 0, alignItems: 'center' },
  line: { width: 34, height: 3, borderRadius: 3 },
  n: { minWidth: 17, height: 17, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  nText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  sec: { color: colors.fine, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.4, marginLeft: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(36,18,27,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  notice: { borderColor: 'rgba(212,166,75,0.3)', marginBottom: 0 },
  bell: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  av: { width: 56, height: 56, borderRadius: 28 },
  dot: { position: 'absolute', left: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2.5, borderColor: '#24121b' },
  body: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  time: { marginLeft: 'auto', color: colors.fine, fontSize: 11 },
  last: { flex: 1, color: colors.muted, fontSize: 12.5 },
  lastUnread: { color: colors.text, fontWeight: '500' },
  typing: { color: colors.online, fontStyle: 'italic' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sub: { color: colors.fine, fontSize: 11.5 },
  newTag: { color: colors.rose1, fontSize: 9.5, fontWeight: '700', backgroundColor: 'rgba(255,95,143,0.14)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  actChat: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actCall: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: 12 },
  followText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  cfilter: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 14,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cfItem: { flex: 1, height: 34, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cic: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  cicIn: { backgroundColor: 'rgba(62,224,143,0.14)' },
  cicOut: { backgroundColor: 'rgba(111,211,255,0.14)' },
  cicMissed: { backgroundColor: 'rgba(255,107,107,0.14)' },
  cicArrow: { fontSize: 13, fontWeight: '800' },
  cfText:{ color: colors.muted, fontSize: 12.5, fontWeight: '600' },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIc: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.12)', marginBottom: 14 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});

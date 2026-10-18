import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import CallButton from '../../components/CallButton';
import IntroVideo from '../../components/IntroVideo';
import PhotoViewer from '../../components/PhotoViewer';
import GiftSheet from '../../components/GiftSheet';
import VipBadge from '../../components/VipBadge';
import { useWallet } from '../../context/WalletContext';
import GiftBurst, { type Burst } from '../../components/GiftBurst';
import { useSafetyMenu } from '../../hooks/useSafetyMenu';
import { useCall } from '../../context/CallContext';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  compact,
  getProfile,
  type MediaItem,
  setFollow,
  unlockMedia,
  UserProfile,
} from '../../services/users';
import { ApiError } from '../../services/api';
import type { RootStackParamList } from '../../navigation/types';
import { refreshControl } from '../../components/States';
import { tap } from '../../lib/haptics';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;


const COUNTRIES: Record<string, string> = { IN: '🇮🇳 India' };

export default function ProfileScreen({ navigation, route }: Props) {
  const { width: W } = useWindowDimensions(); // har render pe asli chaudai (lock / rotate ke baad bhi sahi)
  const HERO_H = Math.round(W * 1.22);
  const { id, name: initialName } = route.params;
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { placeCall } = useCall();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const {
    rateFor,
    amHost,
    setBalance,
    openRecharge,
    hostRate: myRate,
  } = useWallet();
  const [burst, setBurst] = useState<Burst | null>(null);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);
  const [stickyOn, setStickyOn] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Chhota header sirf dikhne pe touch le — warna neeche ke hero buttons (❤, ⋯) block ho jaate hain
  useEffect(() => {
    const sub = scrollY.addListener(({ value }) =>
      setStickyOn(value > HERO_H - 120),
    );
    return () => scrollY.removeListener(sub);
  }, [scrollY, HERO_H]);
  const beat = useRef(new Animated.Value(1)).current;

  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    () =>
      getProfile(id)
        .then(u => {
          setUser(u);
          setError('');
        })
        .catch(e => setError((e as Error).message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Follow kiya hua ho to heart dhadakta hai
  useEffect(() => {
    if (!user?.isFollowing || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, {
          toValue: 1.22,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 0.95,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 1.12,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.delay(960),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [user?.isFollowing, reduced, beat]);

  const toggleFollow = async () => {
    tap();
    if (!user || user.isMe) return;
    const next = !user.isFollowing;
    // Turant UI update, server fail ho to wapas
    setUser({
      ...user,
      isFollowing: next,
      followersCount: user.followersCount + (next ? 1 : -1),
    });
    try {
      const res = await setFollow(user.id, next);
      setUser(u => (u ? { ...u, ...res } : u));
    } catch {
      setUser(u =>
        u
          ? { ...u, isFollowing: !next, followersCount: user.followersCount }
          : u,
      );
    }
  };

  const safety = useSafetyMenu({
    userId: id,
    name: user?.name ?? initialName ?? 'User',
    blocked: !!user?.isBlockedByMe,
    onBlockedChange: b =>
      setUser(u =>
        u
          ? {
              ...u,
              isBlockedByMe: b,
              ...(b
                ? {
                    isFollowing: false,
                    online: false,
                    followersCount: Math.max(
                      0,
                      u.followersCount - (u.isFollowing ? 1 : 0),
                    ),
                  }
                : {}),
            }
          : u,
      ),
  });

  // Upar swipe hone wali photos: avatar + album ki khuli photos (duplicate hata ke)
  const slides = user
    ? [
        ...new Set(
          [user.avatarUrl, ...user.photos.map(p => p.url)].filter(
            (u): u is string => !!u,
          ),
        ),
      ]
    : [];

  // Lock wali photo / video: gems dekar kholo (host ko kamai). Ek baar khuli = hamesha
  const askUnlock = (kind: 'photo' | 'video', m: MediaItem) => {
    if (!user || !m.price) return;
    appAlert(
      kind === 'photo' ? 'Unlock photo?' : 'Unlock video?',
      `Unlock for ${m.price} gems. It stays unlocked for you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Unlock · ${m.price}`,
          onPress: async () => {
            try {
              const r = await unlockMedia(user.id, kind, m.id);
              if (r.balance != null) setBalance(r.balance);
              const fresh = await getProfile(user.id);
              setUser(fresh);
              if (kind === 'photo') {
                const urls = fresh.photos
                  .filter(x => x.url)
                  .map(x => x.url as string);
                setViewer(urls.indexOf(r.url));
              }
            } catch (e) {
              if (e instanceof ApiError && e.code === 'insufficient_gems')
                openRecharge({
                  needed: m.price!,
                  peerName: user.name ?? undefined,
                });
              else appAlert('Unlock', (e as Error).message);
            }
          },
        },
      ],
    );
  };

  const openAlbumPhoto = (p: UserProfile['photos'][number]) => {
    if (p.isLocked || !p.url) {
      if (p.price) askUnlock('photo', p);
      // Aam user ki private photo: chat ya call ke baad khulti hai (paisa nahi)
      else
        appAlert(
          'Private photo 🔒',
          `${
            user?.name ?? 'This user'
          } shares private photos only with people they have chatted or called with.`,
        );
      return;
    }
    setViewer(slides.indexOf(p.url));
  };
  const stickyOpacity = scrollY.interpolate({
    inputRange: [HERO_H - 160, HERO_H - 90],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const followBtn = (small = false) => (
    <Pressable
      onPress={toggleFollow}
      style={[
        styles.glass,
        user?.isFollowing && styles.glassFollow,
        small && styles.glassSolid,
      ]}
    >
      <Animated.View
        style={{ transform: [{ scale: user?.isFollowing ? beat : 1 }] }}
      >
        <Icon
          name={user?.isFollowing ? 'heart' : 'heartOutline'}
          size={19}
          color={user?.isFollowing ? colors.rose1 : '#fff'}
        />
      </Animated.View>
    </Pressable>
  );

  if (error && !user) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <View style={styles.errorRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.errorBtn}
          >
            <Text style={styles.errorBtnText}>Go back</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        scrollEventThrottle={16}
        refreshControl={refreshControl(refreshing, refresh)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* ---------- Hero photo(s) ---------- */}
        <View style={{ height: HERO_H }}>
          {slides.length > 0 ? (
            <FlatList
              data={slides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u, i) => `${i}-${u}`}
              onMomentumScrollEnd={e =>
                setSlide(Math.round(e.nativeEvent.contentOffset.x / W))
              }
              renderItem={({ item, index }) => (
                <Pressable onPress={() => setViewer(index)}>
                  <Image
                    source={{ uri: item }}
                    style={{ width: W, height: HERO_H }}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
            />
          ) : (
            <Avatar
              uri={null}
              seed={id}
              style={StyleSheet.absoluteFill}
              iconScale={0.78}
            />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(0,0,0,0.4)',
              'transparent',
              'transparent',
              colors.bg,
            ]}
            locations={[0, 0.22, 0.55, 0.98]}
            style={StyleSheet.absoluteFill}
          />
          {slides.length > 1 && (
            <View style={[styles.dots, { top: insets.top + 58 }]}>
              {slides.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === slide && styles.dotOn]}
                />
              ))}
            </View>
          )}
          {user?.online && (
            <View style={styles.onlineTag}>
              <View style={styles.live} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          )}
        </View>

        {/* ---------- Details ---------- */}
        {!user ? (
          <ActivityIndicator color={colors.rose1} style={{ marginTop: 10 }} />
        ) : (
          <View style={styles.sheet}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {user.name}
              </Text>
              {user.isVerified && <Icon name="verified" size={20} />}
              {user.isVip && <VipBadge size="md" />}
              <LinearGradient
                colors={gradients.rose}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.likes}
              >
                <Icon name="heart" size={13} color="#fff" />
                <Text style={styles.likesText}>
                  {compact(user.followersCount)}
                </Text>
              </LinearGradient>
            </View>
            <Text style={styles.idText}>ID: {user.id}</Text>

            <View style={styles.tags}>
              <Text style={styles.tag}>
                {COUNTRIES[user.country] ?? user.country}
              </Text>
              <Text style={[styles.tag, styles.tagAge]}>
                {user.gender === 'female'
                  ? '♀'
                  : user.gender === 'male'
                  ? '♂'
                  : '⚧'}{' '}
                {user.age}
              </Text>
              <Text style={[styles.tag, styles.tagLv]}>★ Lv.{user.level}</Text>
              {!!user.city && <Text style={styles.tag}>📍 {user.city}</Text>}
            </View>

            {!!user.bio && (
              <View style={styles.bio}>
                <Icon name="quote" size={15} color={colors.gold2} />
                <Text style={styles.bioText}>{user.bio}</Text>
              </View>
            )}

            {user.languages.length > 0 && (
              <>
                <Text style={styles.sec}>Speaking language</Text>
                <View style={styles.chips}>
                  {user.languages.map(l => (
                    <Text key={l} style={styles.chip}>
                      {l}
                    </Text>
                  ))}
                </View>
              </>
            )}

            {/* Host ke videos: pehla free, baaki gems se kholo */}
            {!!user.videos?.length && (
              <>
                <View style={styles.secRow}>
                  <Text style={styles.sec}>Videos</Text>
                  <Text style={styles.secHint}>
                    {user.videos.length} videos
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.album}
                >
                  {user.videos.map(v =>
                    v.url ? (
                      <IntroVideo
                        key={v.id}
                        uri={v.url}
                        style={styles.introVideo}
                        label="Tap for sound"
                      />
                    ) : (
                      <Pressable
                        key={v.id}
                        onPress={() => askUnlock('video', v)}
                        style={[styles.introVideo, styles.lockTile]}
                      >
                        <LockFace price={v.price} kind="video" />
                      </Pressable>
                    ),
                  )}
                </ScrollView>
              </>
            )}

            {user.photos.length > 0 && (
              <>
                <View style={styles.secRow}>
                  <Text style={styles.sec}>Album</Text>
                  <Text style={styles.secHint}>
                    {user.photos.length} photos
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.album}
                >
                  {user.photos.map(p => (
                    <Pressable
                      key={p.id}
                      onPress={() => openAlbumPhoto(p)}
                      style={styles.albumPh}
                    >
                      {p.url ? (
                        <Image
                          source={{ uri: p.url }}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : (
                        <LockFace price={p.price} kind="photo" />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.secRow}>
              <Text style={styles.sec}>Gifts received</Text>
            </View>
            <LinearGradient
              colors={['rgba(246,220,155,0.14)', 'rgba(255,95,143,0.1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.giftTotal}
            >
              <View style={styles.giftIc}>
                <Text style={styles.giftIcText}>🎁</Text>
              </View>
              <View>
                <Text style={styles.giftTotalNum}>
                  {user.giftTotal.toLocaleString('en-IN')} gifts
                </Text>
                <Text style={styles.giftTotalSub}>
                  from {user.giftSenders} people
                </Text>
              </View>
              {!user.isMe &&
                user.isHost &&
                !amHost && ( // gift sirf user → host
                  <Pressable
                    onPress={() => setGiftOpen(true)}
                    style={styles.sendWrap}
                  >
                    <LinearGradient
                      colors={gradients.gold}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.send}
                    >
                      <Text style={styles.sendText}>Send gift</Text>
                    </LinearGradient>
                  </Pressable>
                )}
            </LinearGradient>
            {user.gifts.length > 0 ? (
              <View style={styles.gifts}>
                {user.gifts.map(g => (
                  <View
                    key={g.id}
                    style={[styles.gift, { width: (W - 36 - 24) / 4 }, g.isRare && styles.giftRare]}
                  >
                    <Text style={styles.giftEmoji}>{g.icon}</Text>
                    <Text
                      style={[
                        styles.giftCount,
                        g.isRare && { color: colors.gold1 },
                      ]}
                    >
                      x{g.count}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noGifts}>No gifts yet. Be the first! 💝</Text>
            )}
          </View>
        )}
      </Animated.ScrollView>

      {/* ---------- Upar buttons (hero pe) ---------- */}
      <View
        style={[styles.heroBar, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.glass}>
          <Icon name="back" size={19} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Profile</Text>
        <View style={styles.heroRight}>
          {user && !user.isMe && !user.isBlockedByMe && followBtn()}
          {user && !user.isMe && (
            <Pressable onPress={safety.openMenu} style={styles.glass}>
              <Icon name="more" size={19} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      {/* ---------- Scroll ke baad chhota header ---------- */}
      <Animated.View
        pointerEvents={user && stickyOn ? 'box-none' : 'none'}
        style={[
          styles.sticky,
          { paddingTop: insets.top + 6, opacity: stickyOpacity },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.glass, styles.glassSolid]}
        >
          <Icon name="back" size={19} color="#fff" />
        </Pressable>
        <Avatar
          uri={user?.avatarUrl}
          seed={id}
          style={styles.mini}
          iconScale={0.9}
        />
        <View style={styles.stickyText}>
          <Text style={styles.stickyName} numberOfLines={1}>
            {user?.name ?? initialName}
          </Text>
          {user?.online && <Text style={styles.stickyOnline}>● Online</Text>}
        </View>
        {user && !user.isMe && !user.isBlockedByMe && followBtn(true)}
      </Animated.View>

      {/* ---------- Blocked: Chat/Call ki jagah Unblock ---------- */}
      {user && !user.isMe && user.isBlockedByMe && (
        <View
          style={[styles.blockedBar, { paddingBottom: insets.bottom + 14 }]}
        >
          <Text style={styles.blockedText} numberOfLines={2}>
            You blocked {user.name}
          </Text>
          <Pressable onPress={safety.unblock} style={styles.unblockBtn}>
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      )}

      {/* ---------- Neeche Chat + Video Call ---------- */}
      {user && !user.isMe && !user.isBlockedByMe && (
        <LinearGradient
          pointerEvents="box-none"
          colors={['transparent', colors.bg]}
          locations={[0, 0.35]}
          style={[styles.actionBar, { paddingBottom: insets.bottom + 14 }]}
        >
          <Pressable
            onPress={() =>
              navigation.navigate('Chat', { id: user.id, name: user.name })
            }
            style={styles.chatBtn}
          >
            <Icon name="chat" size={22} />
          </Pressable>
          {/* Video call sirf host ko (uske rate pe) */}
          {/* Call user ↔ host dono taraf (host ki call ka paisa user deta hai) */}
          {user.isHost !== amHost && (
            <CallButton
              rate={amHost ? myRate : rateFor(user.rate)}
              onPress={() => placeCall(user)}
              style={styles.callBtn}
            />
          )}
        </LinearGradient>
      )}

      <PhotoViewer
        photos={slides}
        index={viewer}
        onClose={() => setViewer(null)}
      />
      {safety.sheets}
      {giftOpen && user && (
        <GiftSheet
          to={{ id: user.id, name: user.name }}
          onClose={() => setGiftOpen(false)}
          onWallet={() => {
            setGiftOpen(false);
            navigation.navigate('Wallet');
          }}
          onSent={gift => {
            setBurst({ key: Date.now(), gift, text: 'You sent' });
            getProfile(id)
              .then(setUser)
              .catch(() => {});
          }}
        />
      )}
      <GiftBurst burst={burst} onDone={() => setBurst(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  introVideo: { width: 120, height: 170 },
  lockTile: { overflow: 'hidden' },
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.muted, fontSize: 14 },
  errorRow: { flexDirection: 'row', gap: 10 },
  errorBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  errorBtnText: { color: colors.text, fontWeight: '600' },

  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotOn: { backgroundColor: '#fff' },
  onlineTag: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  live: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  onlineText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  sheet: { marginTop: -70, paddingHorizontal: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  likes: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
  },
  likesText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  idText: { color: colors.fine, fontSize: 12, marginTop: 4 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    height: 25,
    lineHeight: 23,
    paddingHorizontal: 9,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagAge: {
    color: colors.rose1,
    backgroundColor: 'rgba(255,95,143,0.12)',
    borderColor: 'rgba(255,95,143,0.3)',
  },
  tagLv: {
    color: colors.gold1,
    backgroundColor: 'rgba(246,220,155,0.12)',
    borderColor: 'rgba(212,166,75,0.35)',
  },

  bio: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bioText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },

  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sec: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 9,
  },
  secHint: {
    color: colors.fine,
    fontSize: 11.5,
    marginTop: 18,
    marginBottom: 9,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 30,
    lineHeight: 28,
    paddingHorizontal: 13,
    borderRadius: 15,
    overflow: 'hidden',
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  album: { gap: 8, paddingRight: 18 },
  albumPh: {
    width: 92,
    height: 116,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  lockCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,166,75,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.4)',
  },
  lockText: { color: colors.gold1, fontSize: 10.5, fontWeight: '600' },

  giftTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.25)',
    marginBottom: 10,
  },
  giftIc: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  giftIcText: { fontSize: 20 },
  giftTotalNum: { color: colors.text, fontSize: 14, fontWeight: '700' },
  giftTotalSub: { color: colors.muted, fontSize: 11.5 },
  sendWrap: { marginLeft: 'auto' },
  send: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 11,
    justifyContent: 'center',
  },
  sendText: { color: colors.goldText, fontSize: 12, fontWeight: '600' },
  gifts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gift: {
    paddingTop: 10,
    paddingBottom: 7,
    borderRadius: 16,
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  giftRare: {
    borderColor: 'rgba(212,166,75,0.45)',
    backgroundColor: 'rgba(246,220,155,0.08)',
  },
  giftEmoji: { fontSize: 30 },
  giftCount: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  noGifts: { color: colors.muted, fontSize: 12.5 },

  heroBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  heroRight: { marginLeft: 'auto', flexDirection: 'row', gap: 8 },
  glass: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassFollow: {
    backgroundColor: 'rgba(255,95,143,0.22)',
    borderColor: 'rgba(255,95,143,0.5)',
  },
  glassSolid: { backgroundColor: colors.surface, borderColor: colors.border },

  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(18,7,13,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mini: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.rose1,
  },
  stickyText: { flex: 1 },
  stickyName: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  stickyOnline: { color: colors.online, fontSize: 10.5 },

  blockedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    backgroundColor: 'rgba(18,7,13,0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  blockedText: { color: colors.muted, fontSize: 13.5 },
  unblockBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,95,143,0.5)',
    backgroundColor: 'rgba(255,95,143,0.1)',
  },
  unblockText: { color: colors.rose1, fontSize: 13.5, fontWeight: '700' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 26,
  },
  chatBtn: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callBtn: { flex: 1 },
});

// Lock wali photo / video ka chehra: dhundhla + 🔒 + daam
function LockFace({
  price,
  kind,
}: {
  price?: number;
  kind: 'photo' | 'video';
}) {
  return (
    <LinearGradient colors={['#3a1d2b', '#24101a']} style={styles.locked}>
      <View style={styles.lockCircle}>
        <Icon name="lock" size={18} color={colors.gold1} />
      </View>
      <Text style={styles.lockText}>
        {price ? `${kind === 'video' ? '🎥 ' : ''}${price} gems` : 'Private'}
      </Text>
    </LinearGradient>
  );
}

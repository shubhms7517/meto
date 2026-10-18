import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import Ticks from '../../components/Ticks';
import PhotoViewer from '../../components/PhotoViewer';
import { useSafetyMenu } from '../../hooks/useSafetyMenu';
import { launchImageLibrary } from 'react-native-image-picker';
import { colors, gradients } from '../../theme';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst, { type Burst } from '../../components/GiftBurst';
import Coin from '../../components/Coin';
import { parseGift, type GiftBody } from '../../services/gifts';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { useWallet } from '../../context/WalletContext';
import { ApiError } from '../../services/api';
import type { ChatPricing } from '../../services/chat';
import { getSocket } from '../../services/socket';
import {
  ChatMessage,
  callDuration,
  callRecordTitle,
  parseCallRecord,
  getOlderMessages,
  getPresence,
  markChatRead,
  newClientId,
  openChatWith,
  sendChatMessage,
  sendChatPhoto,
} from '../../services/chat';
import { timeAgo, UserCard } from '../../services/users';
import type { RootStackParamList } from '../../navigation/types';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type Partner = UserCard & { languages: string[] };

const MAX_LEN = 1000;

const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export default function ChatScreen({ navigation, route }: Props) {
  const { id: partnerId, name: initialName } = route.params;
  const insets = useSafeAreaInsets();
  const { typing, setActiveChat, markLocalRead } = useChat();
  const { placeCall } = useCall();
  const { openRecharge, amHost, rateFor } = useWallet();
  const [pricing, setPricing] = useState<ChatPricing | null>(null); // host ko message: free bache / daam

  const [partner, setPartner] = useState<Partner | null>(null);
  const partnerName = useRef(initialName ?? 'They');
  partnerName.current = partner?.name ?? initialName ?? 'They';
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // naye se purane (inverted list)
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [kb, setKb] = useState(0);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [burst, setBurst] = useState<Burst | null>(null);
  const { refresh: refreshChats } = useChat();
  const convRef = useRef<number | null>(null);
  convRef.current = conversationId;
  const loadingOlder = useRef(false);
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard ki height (Android edge-to-edge me window resize nahi hoti)
  useEffect(() => {
    // height me Android ka navigation bar nahi aata — isliye screen ke neeche se keyboard ki upar wali line tak ka gap
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e =>
        setKb(
          Math.max(
            e.endCoordinates.height,
            Dimensions.get('screen').height - e.endCoordinates.screenY,
          ),
        ),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKb(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Khuli chat ke messages unread me nahi gine jaate
  useEffect(() => {
    setActiveChat(partnerId);
    return () => setActiveChat(null);
  }, [partnerId, setActiveChat]);

  const readNow = useCallback(
    (cid: number) => {
      markLocalRead(cid);
      markChatRead(cid);
    },
    [markLocalRead],
  );

  // Header ka "Online / Active 2h ago" chat khuli rahe tab bhi taaza
  useEffect(() => {
    const t = setInterval(() => {
      getPresence(partnerId)
        .then(pr => setPartner(p => (p ? { ...p, online: pr.online, lastSeenAt: pr.lastSeenAt } : p)))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [partnerId]);

  // Pehli load
  useEffect(() => {
    openChatWith(partnerId)
      .then(res => {
        setPartner(res.user);
        setBlockedByMe(res.blockedByMe);
        setBlockedMe(res.blockedMe);
        setPricing(res.pricing ?? null);
        setConversationId(res.conversationId);
        setMessages(res.messages);
        setHasMore(res.hasMore);
        if (
          res.conversationId &&
          res.messages.some(m => m.from === partnerId && !m.readAt)
        )
          readNow(res.conversationId);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [partnerId, readNow]);

  // Live events
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onNew = (m: ChatMessage) => {
      if (m.from !== partnerId && m.to !== partnerId) return;
      if (!convRef.current) setConversationId(m.conversationId);
      setMessages(ms => {
        // Apna bheja hua (pending) server se aaya → replace
        const i = ms.findIndex(
          x => x.id === m.id || (m.clientId && x.clientId === m.clientId),
        );
        if (i >= 0) return ms.map((x, j) => (j === i ? m : x));
        return [m, ...ms];
      });
      if (m.from === partnerId) readNow(m.conversationId);
      // Saamne wale ne gift bheja → bada animation
      if (m.type === 'gift' && m.from === partnerId) {
        const g = parseGift(m.body);
        if (g) setBurst({ key: Date.now(), gift: g, text: `${partnerName.current} sent you` });
      }
    };
    const onRead = ({
      conversationId: cid,
      readAt,
    }: {
      conversationId: number;
      readAt: string;
    }) => {
      if (cid !== convRef.current) return;
      setMessages(ms =>
        ms.map(m =>
          m.to === partnerId && !m.readAt
            ? { ...m, readAt, deliveredAt: m.deliveredAt ?? readAt }
            : m,
        ),
      );
    };
    const onDelivered = ({
      conversationId: cid,
      deliveredAt,
    }: {
      conversationId: number;
      deliveredAt: string;
    }) => {
      if (cid !== convRef.current) return;
      setMessages(ms =>
        ms.map(m =>
          m.to === partnerId && !m.deliveredAt ? { ...m, deliveredAt } : m,
        ),
      );
    };
    // Reconnect ke baad jo miss hua wo lao
    const onConnect = () =>
      openChatWith(partnerId)
        .then(res => {
          setMessages(ms => {
            const pending = ms.filter(m => m.pending || m.failed);
            return [...pending, ...res.messages];
          });
          if (res.conversationId) setConversationId(res.conversationId);
        })
        .catch(() => {});

    s.on('message:new', onNew);
    s.on('message:read', onRead);
    s.on('message:delivered', onDelivered);
    s.on('connect', onConnect);
    return () => {
      s.off('message:new', onNew);
      s.off('message:read', onRead);
      s.off('message:delivered', onDelivered);
      s.off('connect', onConnect);
    };
  }, [partnerId, readNow]);

  // Typing signal: likhna shuru → true, 2.5 sec ruke → false
  const setTypingSignal = (on: boolean) => {
    if (typingSent.current === on) return;
    typingSent.current = on;
    getSocket()?.emit('typing', { to: partnerId, typing: on });
  };
  const onChangeText = (t: string) => {
    setText(t);
    if (!t.trim()) {
      setTypingSignal(false);
      return;
    }
    setTypingSignal(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingSignal(false), 2500);
  };
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      getSocket()?.emit('typing', { to: partnerId, typing: false });
    },
    [partnerId],
  );

  // Ek free message use hua
  const usedOne = () =>
    setPricing(p => (p && !p.vipFree && p.freeLeft > 0 ? { ...p, freeLeft: p.freeLeft - 1, paid: p.freeLeft - 1 === 0 && p.price > 0 } : p));
  // Gems kam → recharge sheet (message "failed" rehta hai, recharge ke baad retry)
  const noGems = (e: unknown) => {
    if (!(e instanceof ApiError) || e.code !== 'insufficient_gems') return false;
    openRecharge({ needed: pricing?.price ?? 200, peerName: partner?.name ?? undefined });
    return true;
  };

  const deliver = async (body: string, clientId: string) => {
    try {
      const saved = await sendChatMessage(partnerId, body, clientId);
      setMessages(ms => {
        const exists = ms.some(m => m.id === saved.id);
        return exists
          ? ms.filter(m => m.clientId !== clientId || m.id === saved.id)
          : ms.map(m => (m.clientId === clientId ? saved : m));
      });
      if (!convRef.current) setConversationId(saved.conversationId);
      usedOne();
    } catch (e) {
      setMessages(ms =>
        ms.map(m =>
          m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      if (noGems(e)) return;
      const msg = (e as Error).message;
      if (msg !== 'offline' && msg !== 'timeout')
        appAlert('Message not sent', msg);
    }
  };

  const send = (raw = text) => {
    const body = raw.trim();
    if (!body) return;
    const clientId = newClientId();
    const now = new Date().toISOString();
    setMessages(ms => [
      {
        id: -Date.now(),
        conversationId: convRef.current ?? 0,
        from: 0,
        to: partnerId,
        type: 'text',
        body,
        clientId,
        createdAt: now,
        deliveredAt: null,
        readAt: null,
        pending: true,
      },
      ...ms,
    ]);
    if (raw === text) setText('');
    setTypingSignal(false);
    deliver(body, clientId);
  };

  const retry = (m: ChatMessage) => {
    setMessages(ms =>
      ms.map(x =>
        x.clientId === m.clientId ? { ...x, failed: false, pending: true } : x,
      ),
    );
    deliver(m.body, m.clientId!);
  };

  const loadOlder = async () => {
    if (
      !hasMore ||
      loadingOlder.current ||
      !conversationId ||
      messages.length === 0
    )
      return;
    loadingOlder.current = true;
    try {
      const oldest = messages.filter(m => m.id > 0).at(-1);
      if (!oldest) return;
      const res = await getOlderMessages(conversationId, oldest.id);
      setMessages(ms => [...ms, ...res.messages]);
      setHasMore(res.hasMore);
    } finally {
      loadingOlder.current = false;
    }
  };

  const safety = useSafetyMenu({
    userId: partnerId,
    name: partner?.name ?? initialName ?? 'User',
    blocked: blockedByMe,
    conversationId,
    onBlockedChange: b => {
      setBlockedByMe(b);
      if (b)
        setPartner(p => (p ? { ...p, online: false, lastSeenAt: null } : p));
      refreshChats();
    },
    extraActions: [
      {
        label: 'View profile',
        icon: 'user',
        onPress: () =>
          navigation.navigate('Profile', {
            id: partnerId,
            name: partner?.name,
          }),
      },
    ],
  });
  const moreMenu = safety.openMenu;

  /* ---------- Photo bhejna ---------- */
  const deliverPhoto = async (uri: string, clientId: string) => {
    try {
      const saved = await sendChatPhoto(partnerId, uri, clientId);
      setMessages(ms => {
        const exists = ms.some(m => m.id === saved.id);
        return exists
          ? ms.filter(m => m.clientId !== clientId || m.id === saved.id)
          : ms.map(m => (m.clientId === clientId ? saved : m));
      });
      if (!convRef.current) setConversationId(saved.conversationId);
      usedOne();
    } catch (e) {
      setMessages(ms =>
        ms.map(m =>
          m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      if (noGems(e)) return;
      appAlert('Photo not sent', (e as Error).message);
    }
  };

  const pickPhoto = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    const clientId = newClientId();
    // Turant apni local photo dikhao, upload ke baad server wali
    setMessages(ms => [
      {
        id: -Date.now(),
        conversationId: convRef.current ?? 0,
        from: 0,
        to: partnerId,
        type: 'image',
        body: uri,
        clientId,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        pending: true,
      },
      ...ms,
    ]);
    deliverPhoto(uri, clientId);
  };

  // Chat ki saari photos (purani se nayi) — full-screen viewer ke liye
  const photoUrls = messages
    .filter(m => m.type === 'image')
    .map(m => m.body)
    .reverse();
  const openPhoto = (url: string) => setViewer(photoUrls.indexOf(url));

  const isTyping = !!typing[partnerId];
  const subtitle = isTyping
    ? 'typing…'
    : partner?.online
    ? 'Online'
    : partner?.lastSeenAt
    ? `Active ${timeAgo(partner.lastSeenAt)} ago`
    : '';

  const hostRate = partner?.isHost && !amHost && partner.rate ? rateFor(partner.rate) : 0;

  // Free messages khatam → notice usi message ke theek baad (chat ke saath upar chala jata hai)
  const showPricing = !!pricing && !pricing.vipFree && pricing.freeLimit > 0;
  const noticeAfterId = useMemo(() => {
    if (!showPricing || pricing!.freeLeft > 0 || hasMore) return null;
    const mine = messages.filter(m => m.id > 0 && m.to === partnerId && (m.type === 'text' || m.type === 'image')).sort((x, y) => x.id - y.id);
    return mine[pricing!.freeLimit - 1]?.id ?? null;
  }, [showPricing, pricing, hasMore, messages, partnerId]);

  const renderItem = (p: { item: ChatMessage; index: number }) =>
    p.item.id === noticeAfterId ? (
      <View>
        {renderMessage(p)}
        <PaidNotice price={pricing!.price} vip={pricing!.vipOffer} onVip={() => navigation.navigate('Vip')} />
      </View>
    ) : (
      renderMessage(p)
    );

  const renderMessage = ({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) => {
    const older = messages[index + 1];
    const showDay =
      !older || dayKey(older.createdAt) !== dayKey(item.createdAt);
    const mine = item.to === partnerId;
    if (item.type === 'call') {
      const r = parseCallRecord(item.body);
      if (!r) return null;
      const missed = r.s !== 'ended' && !mine; // mujhe aayi aur nahi uthayi
      const canCall = !!partner && partner.isHost !== amHost && !blockedByMe && !blockedMe;
      return (
        <View>
          {showDay && <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>}
          <View style={[styles.callRec, mine ? styles.callRecMine : styles.callRecTheirs]}>
            <View style={[styles.callRecIc, missed && styles.callRecIcMissed]}>
              <Icon name="videoFill" size={17} color={missed ? '#ff7b7b' : colors.rose1} />
            </View>
            <View style={styles.flexShrink}>
              <Text style={[styles.callRecTitle, missed && styles.callRecMissed]}>{callRecordTitle(r, mine)}</Text>
              <Text style={styles.callRecSub}>
                {r.s === 'ended' ? `${callDuration(r.d)} · ` : ''}
                {hhmm(item.createdAt)}
              </Text>
            </View>
            {canCall && (
              <Pressable onPress={() => placeCall(partner!)} hitSlop={8} style={styles.callRecBtn}>
                <Text style={styles.callRecBtnText}>{mine ? 'Call' : 'Call back'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    }
    if (item.type === 'gift') {
      const g = parseGift(item.body);
      if (g)
        return (
          <View>
            {showDay && <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>}
            <LinearGradient
              colors={['rgba(246,220,155,0.22)', 'rgba(255,95,143,0.16)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.giftBubble, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}
            >
              <Text style={styles.giftEmoji}>{g.icon}</Text>
              <Text style={styles.giftName}>
                {g.name}
                {g.qty > 1 ? ` ×${g.qty}` : ''}
              </Text>
              <View style={styles.giftSub}>
                {mine ? (
                  <>
                    <Text style={styles.giftSubText}>You sent · </Text>
                    <Coin size={12} />
                    <Text style={styles.giftSubText}> {g.total.toLocaleString('en-IN')}</Text>
                  </>
                ) : (
                  <Text style={styles.giftSubText} numberOfLines={1}>
                    {partner?.name ?? 'They'} sent you
                  </Text>
                )}
              </View>
              <View style={styles.giftMeta}>
                <Text style={styles.metaIn}>{hhmm(item.createdAt)}</Text>
                {mine && <Ticks m={item} size={14} color={colors.gold1} />}
              </View>
            </LinearGradient>
          </View>
        );
    }
    if (item.type === 'image') {
      return (
        <View>
          {showDay && (
            <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>
          )}
          <Pressable
            onPress={
              item.failed
                ? () => (
                    setMessages(ms =>
                      ms.map(x =>
                        x.clientId === item.clientId
                          ? { ...x, failed: false, pending: true }
                          : x,
                      ),
                    ),
                    deliverPhoto(item.body, item.clientId!)
                  )
                : () => openPhoto(item.body)
            }
            style={[
              styles.photoBubble,
              mine ? styles.photoOut : styles.photoIn,
            ]}
          >
            <Image source={{ uri: item.body }} style={styles.photo} />
            {item.pending && (
              <View style={styles.photoLoading}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={styles.photoMeta}>
              <Text style={styles.metaOut}>{hhmm(item.createdAt)}</Text>
              {mine && (
                <Ticks m={item} size={14} color="rgba(255,255,255,0.9)" />
              )}
            </View>
          </Pressable>
          {item.failed && (
            <Text style={[styles.failed, { alignSelf: 'flex-end' }]}>
              Not sent · tap to retry
            </Text>
          )}
        </View>
      );
    }
    return (
      <View>
        {showDay && <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>}
        {mine ? (
          <Pressable
            onPress={item.failed ? () => retry(item) : undefined}
            style={styles.outWrap}
          >
            <LinearGradient
              colors={['#ff6a95', colors.rose2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.out]}
            >
              <Text style={styles.outText}>{item.body}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaOut}>{hhmm(item.createdAt)}</Text>
                <Ticks m={item} size={14} color="rgba(255,255,255,0.8)" />
              </View>
            </LinearGradient>
            {item.failed && (
              <Text style={styles.failed}>Not sent · tap to retry</Text>
            )}
          </Pressable>
        ) : (
          <View style={[styles.bubble, styles.in]}>
            <Text style={styles.inText}>{item.body}</Text>
            <View style={styles.meta}>
              <Text style={styles.metaIn}>{hhmm(item.createdAt)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const empty = !loading && messages.length === 0;

  return (
    <View style={[styles.root, { paddingBottom: kb }]}>
      <StatusBar barStyle="light-content" />

      {/* ---------- Header ---------- */}
      <LinearGradient
        colors={['#3a0c22', '#22091a']}
        style={[styles.header, { paddingTop: insets.top + 6 }]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.back}
        >
          <Icon name="back" size={20} />
        </Pressable>
        <Pressable
          onPress={() =>
            navigation.navigate('Profile', {
              id: partnerId,
              name: partner?.name,
            })
          }
          style={styles.who}
        >
          <View>
            <Avatar
              uri={partner?.avatarUrl}
              seed={partnerId}
              style={styles.hAv}
              iconScale={0.9}
            />
            {partner?.online && <View style={styles.hDot} />}
          </View>
          <View style={styles.whoText}>
            <View style={styles.row}>
              <Text style={styles.hName} numberOfLines={1}>
                {partner?.name ?? initialName ?? ''}
              </Text>
              {partner?.isVerified && <Icon name="verified" size={15} />}
            </View>
            {(!!subtitle || !!hostRate) && (
              <Text style={styles.hSub} numberOfLines={1}>
                <Text style={[(isTyping || partner?.online) && { color: colors.online }, isTyping && { fontStyle: 'italic' }]}>{subtitle}</Text>
                {/* Host ka apna rate — user ko call se pehle pata ho */}
                {!!hostRate && <Text style={styles.hRate}>{subtitle ? ' · ' : ''}💎 {hostRate.toLocaleString('en-IN')}/min</Text>}
              </Text>
            )}
          </View>
        </Pressable>
        {/* Video call user ↔ host (host bhi user ko call kar sakti hai) */}
        {partner && partner.isHost !== amHost && (
          <Pressable onPress={() => !blockedByMe && !blockedMe && placeCall(partner)}>
            <LinearGradient
              colors={gradients.rose}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hCall}
            >
              <Icon name="videoFill" size={19} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}
        <Pressable onPress={moreMenu} style={styles.hMore}>
          <Icon name="more" size={18} />
        </Pressable>
      </LinearGradient>

      {/* ---------- Messages ---------- */}
      {loading ? (
        <ActivityIndicator color={colors.rose1} style={{ flex: 1 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
        </View>
      ) : empty ? (
        <View style={styles.hello}>
          <LinearGradient
            colors={[colors.gold1, colors.rose1, colors.rose2, colors.gold2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bigRing}
          >
            <Avatar
              uri={partner?.avatarUrl}
              seed={partnerId}
              style={styles.bigAv}
              iconScale={0.85}
            />
          </LinearGradient>
          <Text style={styles.helloName}>
            {partner?.name}, {partner?.age}
          </Text>
          <Text style={styles.helloSub}>
            {[partner?.city, partner?.languages.join(', ')]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.wave}>👋</Text>
          <View style={styles.chips}>
            {[
              `Hi ${partner?.name ?? ''}! 👋`,
              "How's your day?",
              'Love your vibe ✨',
            ].map(c => (
              <Pressable key={c} onPress={() => send(c)} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <SafetyTip />
          {showPricing && <FreeNote n={pricing!.freeLimit} price={pricing!.price} />}
          {pricing?.vipFree && <VipFreeNote />}
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={m => m.clientId ?? String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={isTyping ? <TypingBubble /> : undefined}
          ListFooterComponent={
            hasMore ? (
              <ActivityIndicator
                color={colors.rose1}
                style={{ marginVertical: 10 }}
              />
            ) : (
              <View>
                <SafetyTip />
                {showPricing && <FreeNote n={pricing!.freeLimit} price={pricing!.price} />}
                {pricing?.vipFree && <VipFreeNote />}
              </View>
            )
          }
        />
      )}

      {/* ---------- Block hone pe composer ki jagah patti ---------- */}
      {blockedByMe || blockedMe ? (
        <View style={[styles.blockBar, { paddingBottom: insets.bottom + 14 }]}>
          <Icon name="lock" size={16} color={colors.muted} />
          <Text style={styles.blockText}>
            {blockedByMe
              ? `You blocked ${partner?.name ?? 'this user'}.`
              : 'You can’t reply to this conversation.'}
          </Text>
          {blockedByMe && (
            <Pressable onPress={safety.unblock} hitSlop={8}>
              <Text style={styles.unblock}>Unblock</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.composer,
            { paddingBottom: kb ? 10 : insets.bottom + 10 },
          ]}
        >
          <Pressable onPress={pickPhoto} style={styles.cBtn}>
            <Icon name="image" size={20} color={colors.muted} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder="Message…"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.rose1}
            cursorColor={colors.rose1}
            multiline
            maxLength={MAX_LEN}
            style={styles.input}
          />
          {partner?.isHost && !amHost && (
            <Pressable
              onPress={() => setGiftOpen(true)}
              style={[styles.cBtn, styles.giftBtn]}
            >
              <Icon name="gift" size={20} color={colors.gold1} />
            </Pressable>
          )}
          <Pressable onPress={() => send()} disabled={!text.trim()}>
            <LinearGradient
              colors={gradients.rose}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.sendBtn, !text.trim() && { opacity: 0.45 }]}
            >
              <Icon name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {safety.sheets}
      {giftOpen && (
        <GiftSheet
          to={{ id: partnerId, name: partner?.name ?? initialName }}
          onClose={() => setGiftOpen(false)}
          onWallet={() => {
            setGiftOpen(false);
            navigation.navigate('Wallet');
          }}
          onSent={(gift: GiftBody, message: ChatMessage) => {
            setMessages(ms => (ms.some(x => x.id === message.id) ? ms : [message, ...ms]));
            if (!convRef.current) setConversationId(message.conversationId);
            setBurst({ key: Date.now(), gift, text: 'You sent' });
          }}
        />
      )}
      <GiftBurst burst={burst} onDone={() => setBurst(null)} />
      <PhotoViewer
        photos={photoUrls}
        index={viewer}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

function SafetyTip() {
  return (
    <View style={styles.safety}>
      <Icon name="shield" size={14} color={colors.gold1} />
      <Text style={styles.safetyText}>
        Never send money or share OTP, bank or personal details. Report anyone
        who asks.
      </Text>
    </View>
  );
}

// Chat ki shuruaat me: kitne free, phir daam
function FreeNote({ n, price }: { n: number; price: number }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        💬 First {n} messages are free · then {price} gems each
      </Text>
    </View>
  );
}

// VIP ki chat free — upar ek baar bata do (warna pata hi nahi chalta)
function VipFreeNote() {
  return (
    <View style={[styles.note, styles.vipNote]}>
      <Text style={[styles.noteText, styles.vipNoteText]}>👑 VIP · your messages are free</Text>
    </View>
  );
}

// Free khatam hone par chat ke beech (screenshot jaisa)
function PaidNotice({ price, vip, onVip }: { price: number; vip: boolean; onVip: () => void }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        No more free messages · <Text style={styles.notePrice}>{price} gems/message</Text>
        {vip ? '  ·  👑 VIP chats are free  ' : ''}
        {vip && (
          <Text style={styles.noteVip} onPress={onVip}>
            View VIP
          </Text>
        )}
      </Text>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.bubble, styles.in, styles.typingB]}>
      <Text style={styles.typingDots}>• • •</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  callRec: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, maxWidth: '80%', marginVertical: 3, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: '#2a2025', borderWidth: 1, borderColor: colors.border },
  callRecMine: { alignSelf: 'flex-end' },
  callRecTheirs: { alignSelf: 'flex-start' },
  callRecIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.15)' },
  callRecIcMissed: { backgroundColor: 'rgba(255,80,80,0.15)' },
  callRecTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  callRecMissed: { color: '#ff7b7b' },
  callRecSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  callRecBtn: { marginLeft: 'auto', paddingLeft: 10 },
  callRecBtnText: { color: colors.rose1, fontSize: 12, fontWeight: '800' },
  vipNote: { backgroundColor: 'rgba(246,220,155,0.08)', borderColor: 'rgba(246,220,155,0.3)', borderWidth: 1 },
  vipNoteText: { color: colors.gold1 },
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  hAv: { width: 44, height: 44, borderRadius: 22 },
  hDot: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: '#2e0b1e',
  },
  whoText: { flex: 1, minWidth: 0 },
  hName: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  hRate: { color: colors.gold1, fontWeight: '700' },
  hSub: { color: colors.fine, fontSize: 11.5 },
  hCall: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hMore: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: '90deg' }],
  },

  list: { paddingHorizontal: 14, paddingVertical: 12 },
  day: {
    alignSelf: 'center',
    color: colors.muted,
    fontSize: 10.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 8,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 18,
    marginVertical: 3,
  },
  in: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  outWrap: { alignSelf: 'flex-end', maxWidth: '78%', alignItems: 'flex-end' },
  out: { maxWidth: '100%', borderBottomRightRadius: 6 },
  inText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  outText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  metaIn: { color: colors.fine, fontSize: 9.5 },
  metaOut: { color: 'rgba(255,255,255,0.8)', fontSize: 9.5 },
  failed: { color: '#ff8a8a', fontSize: 10.5, marginTop: 2, marginRight: 4 },
  typingB: { paddingVertical: 10 },
  typingDots: { color: colors.muted, fontSize: 14, letterSpacing: 2 },

  safety: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    maxWidth: '92%',
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(212,166,75,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.22)',
    marginVertical: 10,
  },
  safetyText: { flex: 1, color: colors.gold1, fontSize: 11, lineHeight: 16 },

  hello: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  bigRing: { width: 112, height: 112, borderRadius: 56, padding: 3 },
  bigAv: { flex: 1, borderRadius: 53, borderWidth: 3, borderColor: colors.bg },
  helloName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
  },
  helloSub: { color: colors.muted, fontSize: 12.5, marginTop: 4 },
  wave: { fontSize: 30, marginTop: 14 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,95,143,0.4)',
  },
  chipText: { color: colors.text, fontSize: 13 },

  giftBubble: { width: 200, borderRadius: 20, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 12, alignItems: 'center', marginVertical: 3, borderWidth: 1, borderColor: 'rgba(246,220,155,0.45)' },
  giftEmoji: { fontSize: 50, lineHeight: 60 },
  giftName: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  giftSub: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  giftSubText: { color: colors.gold1, fontSize: 11.5, fontWeight: '600' },
  giftMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end', marginTop: 4 },
  photoBubble: {
    width: 210,
    height: 260,
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  photoOut: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  photoIn: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  photo: { width: '100%', height: '100%' },
  photoLoading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  photoMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
  },

  blockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(18,7,13,0.98)',
  },
  blockText: { color: colors.muted, fontSize: 13 },
  unblock: { color: colors.rose1, fontSize: 13, fontWeight: '700' },

  note: {
    alignSelf: 'center',
    maxWidth: '88%',
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(246,220,155,0.22)',
  },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  notePrice: { color: colors.rose1, fontWeight: '800' },
  noteVip: { color: colors.gold1, fontWeight: '800', textDecorationLine: 'underline' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(18,7,13,0.98)',
  },
  cBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  giftBtn: {
    backgroundColor: 'rgba(212,166,75,0.1)',
    borderColor: 'rgba(212,166,75,0.35)',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

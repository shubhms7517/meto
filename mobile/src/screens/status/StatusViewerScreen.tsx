import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  Modal,
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
import { colors, gradients } from '../../theme';
import { useSafetyMenu } from '../../hooks/useSafetyMenu';
import { useCall } from '../../context/CallContext';
import { newClientId, sendChatMessage } from '../../services/chat';
import {
  cachedFeed,
  deleteStatus,
  expiresIn,
  getStatusFeed,
  getStatusViewers,
  likeStatus,
  markStatusViewed,
  StatusFeed,
  StatusItem,
  StatusViewer,
  statusAge,
} from '../../services/status';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StatusViewer'>;
type Group = { userId: number; name: string; avatarUrl: string | null; online: boolean; isVerified: boolean; isMe: boolean; statuses: StatusItem[] };

const DURATION = 5000;
const { width: W } = Dimensions.get('window');

function buildGroups(feed: StatusFeed, start: number | 'me'): { groups: Group[]; index: number } {
  if (start === 'me') {
    return {
      groups: [{ userId: feed.me?.id ?? 0, name: 'My status', avatarUrl: feed.me?.avatarUrl ?? null, online: false, isVerified: false, isMe: true, statuses: feed.mine }],
      index: 0,
    };
  }
  const groups: Group[] = feed.people
    .filter(p => p.statuses.length > 0)
    .map(p => ({ userId: p.user.id, name: p.user.name, avatarUrl: p.user.avatarUrl, online: p.user.online, isVerified: p.user.isVerified, isMe: false, statuses: p.statuses }));
  return { groups, index: Math.max(0, groups.findIndex(g => g.userId === start)) };
}

export default function StatusViewerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { placeCall } = useCall();
  const start = route.params.userId;

  const [groups, setGroups] = useState<Group[] | null>(() => {
    const f = cachedFeed();
    return f ? buildGroups(f, start).groups : null;
  });
  const [gi, setGi] = useState(() => {
    const f = cachedFeed();
    return f ? buildGroups(f, start).index : 0;
  });
  const [si, setSi] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [reply, setReply] = useState('');
  const [kb, setKb] = useState(0);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [toast, setToast] = useState('');

  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const valueRef = useRef(0);

  // Feed cache na ho to server se
  useEffect(() => {
    if (groups) return;
    getStatusFeed()
      .then(f => {
        const b = buildGroups(f, start);
        setGroups(b.groups);
        setGi(b.index);
      })
      .catch(() => navigation.goBack());
  }, [groups, start, navigation]);

  const group = groups?.[gi];
  const status = group?.statuses[si];

  // Naye user pe → pehla unseen status
  useEffect(() => {
    if (!group) return;
    const firstUnseen = group.statuses.findIndex(s => !s.viewed);
    setSi(group.isMe || firstUnseen < 0 ? 0 : firstUnseen);
  }, [gi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status badla → progress 0, image load hone ka wait
  useEffect(() => {
    anim.current?.stop();
    progress.setValue(0);
    valueRef.current = 0;
    setLoaded(false);
    if (status && group && !group.isMe && !status.viewed) {
      markStatusViewed(status.id);
      status.viewed = true;
    }
  }, [status?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const next = useCallback(() => {
    if (!groups || !group) return;
    if (si < group.statuses.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) setGi(gi + 1);
    else close();
  }, [groups, group, si, gi, close]);

  const prev = useCallback(() => {
    if (!groups) return;
    if (si > 0) setSi(si - 1);
    else if (gi > 0) setGi(gi - 1);
    else {
      progress.setValue(0);
      valueRef.current = 0;
    }
  }, [groups, si, gi, progress]);

  // Timer chalao / roko
  const holding = paused || viewersOpen || kb > 0 || !loaded;
  useEffect(() => {
    if (holding || !status) {
      anim.current?.stop();
      return;
    }
    const remaining = DURATION * (1 - valueRef.current);
    anim.current = Animated.timing(progress, { toValue: 1, duration: remaining, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) next();
    });
    return () => anim.current?.stop();
  }, [holding, status?.id, next, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = progress.addListener(({ value }) => (valueRef.current = value));
    return () => progress.removeListener(id);
  }, [progress]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e =>
      setKb(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !group || !status) return;
    setReply('');
    Keyboard.dismiss();
    try {
      await sendChatMessage(group.userId, `↩️ Replied to your status: ${text}`, newClientId());
      flash('Reply sent 💬');
    } catch (e) {
      Alert.alert('Not sent', (e as Error).message);
    }
  };

  const toggleLike = async () => {
    if (!status) return;
    const now = !liked[status.id];
    setLiked(l => ({ ...l, [status.id]: now }));
    try {
      await likeStatus(status.id, now);
      if (now) flash('❤️ Liked');
    } catch {
      setLiked(l => ({ ...l, [status.id]: !now }));
    }
  };

  const removeMine = () => {
    if (!status || !groups) return;
    Alert.alert('Delete status?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStatus(status.id);
            setViewersOpen(false);
            const left = group!.statuses.filter(s => s.id !== status.id);
            if (left.length === 0) return close();
            setGroups(gs => gs!.map((g, i) => (i === gi ? { ...g, statuses: left } : g)));
            setSi(Math.min(si, left.length - 1));
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
        },
      },
    ]);
  };

  const safety = useSafetyMenu({
    userId: group && !group.isMe ? group.userId : 0,
    name: group?.name ?? '',
    blocked: false,
    onBlockedChange: b => b && close(),
  });

  if (!groups || !group || !status) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.rose1} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Photo + tap zones */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={e => (e.nativeEvent.locationX < W * 0.33 ? prev() : next())}
        onLongPress={() => setPaused(true)}
        delayLongPress={180}
        onPressOut={() => setPaused(false)}>
        <Image source={{ uri: status.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={() => setLoaded(true)} />
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']} locations={[0, 0.22, 0.62, 1]} style={StyleSheet.absoluteFill} />
        {!loaded && <ActivityIndicator color="#fff" style={styles.loader} />}
      </Pressable>

      {/* Progress lines */}
      <View style={[styles.bars, { top: insets.top + 6 }]} pointerEvents="none">
        {group.statuses.map((s, i) => (
          <View key={s.id} style={styles.bar}>
            {i < si && <View style={[styles.fill, { width: '100%' }]} />}
            {i === si && <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />}
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={[styles.head, { top: insets.top + 18 }]}>
        <Pressable
          onPress={() => !group.isMe && navigation.navigate('Profile', { id: group.userId, name: group.name })}
          style={styles.who}>
          <Avatar uri={group.avatarUrl} seed={group.userId} style={styles.av} iconScale={0.9} />
          <View>
            <View style={styles.row}>
              <Text style={styles.name}>{group.name}</Text>
              {group.isVerified && <Icon name="verified" size={14} />}
              {group.online && <View style={styles.onDot} />}
            </View>
            <Text style={styles.age}>
              {statusAge(status.createdAt)}
              {group.isMe ? ` · ${status.visibility === 'followers' ? 'Followers' : 'Everyone'}` : ''}
            </Text>
          </View>
        </Pressable>
        {!group.isMe && (
          <Pressable onPress={() => (setPaused(true), safety.openMenu())} style={styles.hBtn} hitSlop={6}>
            <Icon name="more" size={18} color="#fff" />
          </Pressable>
        )}
        <Pressable onPress={close} style={[styles.hBtn, styles.x]} hitSlop={6}>
          <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
        </Pressable>
      </View>

      {!!status.caption && (
        <Text style={[styles.caption, { bottom: (group.isMe ? 90 : 96) + insets.bottom + (kb ? kb - insets.bottom : 0) }]} pointerEvents="none">
          {status.caption}
        </Text>
      )}

      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Neeche: apna → views; doosre ka → reply / ❤ / call */}
      {group.isMe ? (
        <Pressable onPress={() => setViewersOpen(true)} style={[styles.viewsBtn, { bottom: insets.bottom + 24 }]}>
          <Icon name="user" size={16} color="#fff" />
          <Text style={styles.viewsText}>
            {status.views ?? 0} views{status.likes ? ` · ❤️ ${status.likes}` : ''}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.reply, { bottom: kb ? kb + 10 : insets.bottom + 20 }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder={`Reply to ${group.name}…`}
            placeholderTextColor="rgba(255,255,255,0.75)"
            selectionColor={colors.rose1}
            cursorColor={colors.rose1}
            onSubmitEditing={sendReply}
            returnKeyType="send"
            maxLength={500}
            style={styles.replyInput}
          />
          {reply.trim() ? (
            <Pressable onPress={sendReply}>
              <LinearGradient colors={gradients.rose} style={styles.circle}>
                <Icon name="send" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={toggleLike} style={[styles.circle, styles.circleGlass]}>
                <Icon name={liked[status.id] ? 'heart' : 'heartOutline'} size={21} color={liked[status.id] ? colors.rose1 : '#fff'} />
              </Pressable>
              <Pressable onPress={() => { const card = cachedFeed()?.people.find(p => p.user.id === group.userId)?.user; if (card) { close(); placeCall(card); } }}>
                <LinearGradient colors={gradients.rose} style={styles.circle}>
                  <Icon name="videoFill" size={19} color="#fff" />
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      )}

      <ViewersSheet visible={viewersOpen} status={group.isMe ? status : null} onClose={() => setViewersOpen(false)} onDelete={removeMine} />
      {!group.isMe && safety.sheets}
    </View>
  );
}

function ViewersSheet({ visible, status, onClose, onDelete }: { visible: boolean; status: StatusItem | null; onClose: () => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  const [viewers, setViewers] = useState<StatusViewer[] | null>(null);

  useEffect(() => {
    if (!visible || !status) return;
    setViewers(null);
    getStatusViewers(status.id).then(setViewers).catch(() => setViewers([]));
  }, [visible, status]);

  const title = useMemo(() => `${viewers?.length ?? status?.views ?? 0} views`, [viewers, status]);
  if (!status) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Icon name="user" size={18} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onDelete} style={styles.del}>
            <Text style={styles.delText}>Delete</Text>
          </Pressable>
        </View>
        <Text style={styles.expires}>{expiresIn(status.expiresAt)}</Text>
        {!viewers ? (
          <ActivityIndicator color={colors.rose1} style={{ marginVertical: 30 }} />
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={v => String(v.id)}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <View style={styles.vrow}>
                <Avatar uri={item.avatarUrl} seed={item.id} style={styles.vav} iconScale={0.9} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vname}>{item.name}</Text>
                  <Text style={styles.vtime}>{statusAge(item.viewedAt)}</Text>
                </View>
                {item.liked && <Text style={styles.vheart}>❤️</Text>}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.noViews}>No views yet</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  loader: { position: 'absolute', top: '48%', alignSelf: 'center' },
  bars: { position: 'absolute', left: 10, right: 10, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  head: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  onDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.online },
  age: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  hBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  x: { transform: [{ rotate: '45deg' }] },
  caption: { position: 'absolute', left: 18, right: 18, color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 22, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  toast: { position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  reply: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: { flex: 1, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 14, paddingHorizontal: 18 },
  circle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  circleGlass: { backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  viewsBtn: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  viewsText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1a0b13', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  del: { marginLeft: 'auto', height: 34, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(255,107,107,0.1)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' },
  delText: { color: '#ff8a8a', fontSize: 12.5, fontWeight: '700' },
  expires: { color: colors.fine, fontSize: 11.5, marginTop: 4, marginBottom: 10 },
  vrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  vav: { width: 42, height: 42, borderRadius: 21 },
  vname: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
  vtime: { color: colors.fine, fontSize: 11 },
  vheart: { fontSize: 18 },
  noViews: { color: colors.muted, textAlign: 'center', marginVertical: 24 },
});

import React, { useCallback, useState } from 'react';
import { Dimensions } from 'react-native';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { deleteHostVideo, deletePhoto, getMyProfile, type Me, type MyPhoto, uploadHostVideo, uploadPhoto } from '../../services/users';
import IntroVideo from '../../components/IntroVideo';
import StatCount from '../../components/StatCount';
import RateSheet from '../../components/RateSheet';
import { getHostMe, inr, setHostRate, type HostSummary } from '../../services/host';
import { useWallet } from '../../context/WalletContext';
import { signOut } from '../../services/auth';

const MAX_PHOTOS = 9;
const TILE = (Dimensions.get('window').width - 32 - 12) / 3; // 3 line ka grid

// Host ka "Me": wallet / VIP / level / check-in nahi — kamai, rate, photos, niyam
export default function HostMeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [me, setMe] = useState<Me | null>(null);
  const [h, setH] = useState<HostSummary | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [mediaTab, setMediaTab] = useState<'photos' | 'videos'>('photos');
  const { refresh: refreshWallet } = useWallet();

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([getMyProfile(), getHostMe()]);
    setMe(m);
    setH(s);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const addPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    setUploading(true);
    try {
      await uploadPhoto(uri, false);
      await load();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (p: MyPhoto) =>
    Alert.alert('Delete photo?', 'This photo will be removed from your profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(p.id).catch(e => Alert.alert('Could not delete', (e as Error).message));
          load().catch(() => {});
        },
      },
    ]);

  const onSignOut = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        },
      },
    ]);

  // Video: front camera se 10 sec record, ya gallery se (30 sec tak)
  const addVideo = () =>
    Alert.alert('Add video', 'Up to 30 sec. Your first video is free for users to watch.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Choose from gallery',
        onPress: async () => {
          const a = (await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 })).assets?.[0];
          if (!a?.uri) return;
          if ((a.duration ?? 0) > 31) {
            Alert.alert('Too long', 'Please choose a video of 30 seconds or less.');
            return;
          }
          setVideoBusy(true);
          try {
            await uploadHostVideo(a.uri);
            await load();
          } catch (e) {
            Alert.alert('Video', (e as Error).message);
          } finally {
            setVideoBusy(false);
          }
        },
      },
      { text: 'Record now', onPress: () => navigation.navigate('HostVideo', { mode: 'profile' }) },
    ]);

  const removeVideo = (id: number) =>
    Alert.alert('Delete video?', 'Users will no longer see this video.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteHostVideo(id).then(load).catch(e => Alert.alert('Video', (e as Error).message)) },
    ]);

  const pickRate = async (r: number) => {
    try {
      setH(await setHostRate(r));
      refreshWallet();
    } catch (e) {
      Alert.alert('Rate', (e as Error).message);
      throw e;
    }
  };

  const media = h?.media ?? { freePhotos: 3, photoPrice: 200, freeVideos: 1, videoPrice: 500, maxVideos: 5 };
  const isCustom = !!h?.rate && !h.rates.includes(h.rate); // chip ke alawa apna amount

  const segLabel = (t: 'photos' | 'videos') =>
    t === 'photos' ? `Photos · ${me?.photos.length ?? 0}/${MAX_PHOTOS}` : `Videos · ${me?.videos?.length ?? 0}/${media.maxVideos}`;

  const rows = [
    { icon: '✏️', label: 'Edit profile & photos', right: '', onPress: () => navigation.navigate('EditProfile') },
    { icon: '💰', label: 'Earnings history', right: h ? inr(h.points, h.pointsPerInr) : '', onPress: () => navigation.navigate('HostEarnings') },
    { icon: '📜', label: 'Host rules', right: '', onPress: () => navigation.navigate('Legal', { kind: 'host' }) },
    { icon: '⚙️', label: 'Settings', right: '', onPress: () => navigation.navigate('Settings') },
    { icon: '🎧', label: 'Customer service', right: '', onPress: () => navigation.navigate('CustomerService') },
    { icon: '🚫', label: 'Blocked users', right: '', onPress: () => navigation.navigate('BlockedUsers') },
  ];

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#3a0f26', colors.bg]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }}>
        <View style={st.head}>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8} style={st.gear}>
            <Icon name="settings" size={20} />
          </Pressable>
          <LinearGradient colors={[colors.gold1, colors.rose1, colors.gold2]} style={st.ring}>
            <Avatar uri={me?.avatarUrl} seed={me?.id ?? 0} style={st.avatar} iconScale={0.85} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={st.nameRow}>
              <Text style={st.name}>{me?.name ?? ' '}</Text>
              <LinearGradient colors={gradients.gold} style={st.badge}>
                <Text style={st.badgeText}>HOST</Text>
              </LinearGradient>
            </View>
            <Text style={st.sub}>
              ID {me?.id ?? '—'}
              {h?.application?.agency ? ` · ${h.application.agency.name}` : ''}
            </Text>
          </View>
        </View>

        <View style={st.statsRow}>
          <StatCount value={me?.followingCount} label="Following" />
          <StatCount value={me?.followersCount} label="Followers" />
          <StatCount value={me?.visitorsCount} label="Visitors" badge={me?.visitorsNew} gold onPress={() => navigation.navigate('Visitors')} />
        </View>

        {/* App khula = online (koi switch nahi) */}
        <View style={st.online}>
          <View style={st.dot} />
          <Text style={st.onText}>You are online · users can see and call you</Text>
        </View>

        {/* Aaj ki kamai + Withdraw */}
        <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.today}>
          <View style={{ flex: 1 }}>
            <Text style={st.todayLbl}>Today's earnings</Text>
            <Text style={st.todayAmt}>{h ? inr(h.today?.points ?? 0, h.pointsPerInr) : '…'}</Text>
            <Text style={st.todaySmall}>
              {(h?.today?.points ?? 0).toLocaleString('en-IN')} points · {h?.today?.minutes ?? 0} min · {h?.today?.calls ?? 0} calls
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Withdraw')}>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.wd}>
              <Text style={st.wdText}>Withdraw</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>

        {/* Apna rate (users itna dete hain — host call kare ya user) */}
        {h && (
          <View style={st.rate}>
            <View style={st.rateTop}>
              <Text style={st.rateLbl}>Your call rate</Text>
              <Text style={st.rateVal}>{(h.rate ?? 0).toLocaleString('en-IN')} / min</Text>
            </View>
            <View style={st.chips}>
              {h.rates.map(r => {
                const locked = r > h.rateMax;
                const on = r === h.rate;
                return (
                  <Pressable key={r} disabled={locked || on} onPress={() => pickRate(r).catch(() => {})} style={{ flex: 1 }}>
                    {on ? (
                      <LinearGradient colors={['#fff4d6', '#e6bf6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.chip}>
                        <Text style={[st.chipText, { color: colors.goldText }]}>{r.toLocaleString('en-IN')}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[st.chip, st.chipOff, locked && { opacity: 0.4 }]}>
                        <Text style={st.chipText}>
                          {locked ? '🔒 ' : ''}
                          {r.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {/* Apna amount (chip se alag) */}
            <Pressable onPress={() => setRateOpen(true)} style={({ pressed }) => [st.custom, isCustom && st.customOn, pressed && { opacity: 0.8 }]}>
              <Text style={st.customText}>
                ✏️ Custom rate{isCustom ? ' · ' : ' · set your own amount'}
                {isCustom && <Text style={st.customVal}>{(h.rate ?? 0).toLocaleString('en-IN')}</Text>}
              </Text>
              <Text style={st.customEdit}>{isCustom ? 'Edit' : 'Set'}</Text>
            </Pressable>
            <Text style={st.rateNote}>🔒 Rates above {h.rateMax.toLocaleString('en-IN')} unlock at a higher host level · if you end a call, only full minutes count</Text>
          </View>
        )}
        {h && (
          <RateSheet
            visible={rateOpen}
            value={h.rate ?? h.rateMin}
            min={h.rateMin}
            max={h.rateMax}
            step={h.rateStep}
            pointsPerInr={h.pointsPerInr}
            onClose={() => setRateOpen(false)}
            onSave={pickRate}
          />
        )}

        {/* Photos / Videos — tab + grid. Pehle N free, baaki users gems se kholte hain */}
        <View style={st.seg}>
          {(['photos', 'videos'] as const).map(t =>
            t === mediaTab ? (
              <LinearGradient key={t} colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.segItem}>
                <Text style={[st.segText, { color: '#fff' }]}>{segLabel(t)}</Text>
              </LinearGradient>
            ) : (
              <Pressable key={t} onPress={() => setMediaTab(t)} style={st.segItem}>
                <Text style={st.segText}>{segLabel(t)}</Text>
              </Pressable>
            ),
          )}
        </View>

        <View style={st.grid}>
          {mediaTab === 'photos' ? (
            <>
              {(me?.photos.length ?? 0) < MAX_PHOTOS && (
                <Pressable onPress={addPhoto} disabled={uploading} style={[st.tile, st.add]}>
                  {uploading ? (
                    <ActivityIndicator color={colors.rose1} />
                  ) : (
                    <>
                      <Icon name="plus" size={22} color={colors.rose1} strokeWidth={2.6} />
                      <Text style={st.addText}>Add photo</Text>
                    </>
                  )}
                </Pressable>
              )}
              {me?.photos.map((p, i) => (
                <View key={p.id} style={st.tile}>
                  <Image source={{ uri: p.url }} style={st.fill} />
                  <Badge free={i < media.freePhotos} price={media.photoPrice} />
                  <Pressable onPress={() => removePhoto(p)} hitSlop={6} style={st.x}>
                    <Text style={st.xText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </>
          ) : (
            <>
              {(me?.videos?.length ?? 0) < media.maxVideos && (
                <Pressable onPress={addVideo} disabled={videoBusy} style={[st.tile, st.add]}>
                  {videoBusy ? (
                    <ActivityIndicator color={colors.rose1} />
                  ) : (
                    <>
                      <Icon name="video" size={22} color={colors.rose1} />
                      <Text style={st.addText}>Add video</Text>
                    </>
                  )}
                </Pressable>
              )}
              {me?.videos?.map((v, i) => (
                <View key={v.id} style={st.tile}>
                  <IntroVideo uri={v.url} style={st.fill} label="" />
                  <Badge free={i < media.freeVideos} price={media.videoPrice} />
                  <Pressable onPress={() => removeVideo(v.id)} hitSlop={6} style={st.x}>
                    <Text style={st.xText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </View>
        <View style={st.note}>
          <Text style={st.noteText}>
            {mediaTab === 'photos' ? (
              <>
                Users see your <Text style={st.noteB}>first {media.freePhotos} photos free</Text>. Others unlock for{' '}
                <Text style={st.noteB}>{media.photoPrice} gems</Text> — you earn the points.
              </>
            ) : (
              <>
                Your <Text style={st.noteB}>first {media.freeVideos === 1 ? 'video is' : `${media.freeVideos} videos are`} free</Text> to watch. Others unlock for{' '}
                <Text style={st.noteB}>{media.videoPrice} gems</Text> — you earn the points.
              </>
            )}
          </Text>
        </View>

        <View style={st.menu}>
          {rows.map((r, i) => (
            <Pressable key={r.label} onPress={r.onPress} style={[st.row, i > 0 && st.rowLine]}>
              <Text style={st.rowIc}>{r.icon}</Text>
              <Text style={st.rowText}>{r.label}</Text>
              {!!r.right && <Text style={st.rowRight}>{r.right}</Text>}
              <Icon name="chevron" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={onSignOut} style={[st.menu, st.row]}>
          <Icon name="logout" size={18} color="#ff8a8a" />
          <Text style={[st.rowText, { color: '#ff8a8a' }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gear: { position: 'absolute', right: 0, top: 0, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, zIndex: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18 },
  ring: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 66, height: 66, borderRadius: 33 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  badgeText: { color: colors.goldText, fontSize: 10, fontWeight: '900' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  lbl: { color: colors.muted, fontSize: 12, marginHorizontal: 18, marginTop: 18, marginBottom: 8 },
  photos: { paddingHorizontal: 16, gap: 8 },
  photo: { width: 84, height: 108, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,95,143,0.5)' },
  addText: { color: colors.rose1, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  seg: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, padding: 3, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: 16, marginTop: 10 },
  tile: { width: TILE, height: TILE * 1.33, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  fill: { width: '100%', height: '100%', borderRadius: 0 },
  x: { position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  xText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mBadge: { position: 'absolute', left: 6, top: 6, height: 19, paddingHorizontal: 7, borderRadius: 10, justifyContent: 'center' },
  mBadgeFree: { backgroundColor: colors.online },
  mBadgeText: { fontSize: 9.5, fontWeight: '900' },
  note: { marginHorizontal: 16, marginTop: 10, padding: 11, borderRadius: 12, backgroundColor: 'rgba(246,220,155,0.06)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.22)' },
  noteText: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  noteB: { color: colors.gold1, fontWeight: '800' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  online: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: 'rgba(62,224,143,0.1)', borderWidth: 1, borderColor: 'rgba(62,224,143,0.4)' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.online },
  onText: { color: '#bff5d9', fontSize: 12.5, fontWeight: '600', flex: 1 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, padding: 15, borderRadius: 20 },
  todayLbl: { color: colors.goldText, fontSize: 11.5, fontWeight: '600', opacity: 0.8 },
  todayAmt: { color: colors.goldText, fontSize: 26, fontWeight: '800', marginTop: 1 },
  todaySmall: { color: colors.goldText, fontSize: 11, fontWeight: '700', marginTop: 3 },
  wd: { height: 34, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wdText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  rate: { marginHorizontal: 16, marginTop: 10, padding: 13, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rateTop: { flexDirection: 'row', justifyContent: 'space-between' },
  rateLbl: { color: colors.muted, fontSize: 13 },
  rateVal: { color: colors.gold1, fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip: { height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  rateNote: { color: colors.fine, fontSize: 10.5, marginTop: 8, lineHeight: 15 },
  custom: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(246,220,155,0.5)', backgroundColor: 'rgba(246,220,155,0.06)' },
  customOn: { borderStyle: 'solid', borderColor: colors.gold1 },
  customText: { flex: 1, color: colors.text, fontSize: 12.5 },
  customVal: { color: colors.gold1, fontWeight: '800' },
  customEdit: { color: colors.rose1, fontSize: 12, fontWeight: '800' },
  menu: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowIc: { fontSize: 17, width: 22, textAlign: 'center' },
  rowText: { flex: 1, color: colors.text, fontSize: 14.5, fontWeight: '600' },
  rowRight: { color: colors.gold1, fontSize: 12.5, fontWeight: '700' },
});

// FREE (hara) ya 🔒 daam (sunehra) — users ko kaise dikhega
function Badge({ free, price }: { free: boolean; price: number }) {
  return free ? (
    <View style={[st.mBadge, st.mBadgeFree]}>
      <Text style={[st.mBadgeText, { color: '#0d2b1b' }]}>FREE</Text>
    </View>
  ) : (
    <LinearGradient colors={gradients.gold} style={st.mBadge}>
      <Text style={[st.mBadgeText, { color: colors.goldText }]}>🔒 {price}</Text>
    </LinearGradient>
  );
}

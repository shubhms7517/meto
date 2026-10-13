import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import Coin from '../../components/Coin';
import Glow from '../../components/Glow';
import Icon, { IconName } from '../../components/Icon';
import { colors, gradients } from '../../theme';
import { useWallet } from '../../context/WalletContext';
import VipBadge from '../../components/VipBadge';
import { vipDate } from '../../services/rewards';
import { signOut } from '../../services/auth';
import StatCount from '../../components/StatCount';
import { deletePhoto, getMyProfile, Me, MyPhoto, uploadPhoto } from '../../services/users';
import { getHostMe, type HostSummary } from '../../services/host';
import { launchImageLibrary } from 'react-native-image-picker';
import PhotoViewer from '../../components/PhotoViewer';
import CheckInSheet from '../../components/CheckInSheet';
import { getCheckIn, type CheckIn } from '../../services/rewards';

const MAX_PHOTOS = 9;
import type { RootStackParamList } from '../../navigation/types';

const { width } = Dimensions.get('window');

type Row = { icon: IconName; label: string; tint: string; bg: string; end?: string; endTint?: string; to?: 'BlockedUsers' | 'WalletHistory' | 'Level' | 'CustomerService' | 'Settings'; action?: 'checkin' };
const MENU: Row[] = [
  { icon: 'gift', label: 'Daily check-in', tint: colors.rose1, bg: 'rgba(255,95,143,0.14)', endTint: colors.rose1, action: 'checkin' },
  { icon: 'clock', label: 'Gems history', tint: colors.gold1, bg: 'rgba(212,166,75,0.14)', to: 'WalletHistory' },
  { icon: 'trend', label: 'My level', tint: colors.gold1, bg: 'rgba(212,166,75,0.14)', to: 'Level' },
  { icon: 'shield', label: 'Account & security', tint: '#7fb0ff', bg: 'rgba(78,167,255,0.14)', to: 'Settings' },
  { icon: 'support', label: 'Customer service', tint: '#5fe3a3', bg: 'rgba(62,224,143,0.12)', to: 'CustomerService' },
  { icon: 'lock', label: 'Blocked users', tint: '#ff8a8a', bg: 'rgba(255,107,107,0.12)', to: 'BlockedUsers' },
];

export default function MeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { balance, isVip, refresh: refreshWallet } = useWallet();
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [host, setHost] = useState<HostSummary | null>(null); // "Become a host" row (sirf ladki)
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => getMyProfile().then(setMe).catch(() => {}), []);
  // Tab pe aate hi taaza data (follow count waghera badal sakte hain)
  useFocusEffect(
    useCallback(() => {
      load();
      refreshWallet();
      getCheckIn().then(setCheckIn).catch(() => {});
      getHostMe().then(setHost).catch(() => {});
    }, [load, refreshWallet]),
  );

  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const upload = async (uri: string, locked: boolean) => {
    setUploading(true);
    try {
      await uploadPhoto(uri, locked);
      await load();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addStatus = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const uri = res.assets?.[0]?.uri;
    if (uri) navigation.navigate('AddStatus', { uri });
  };

  const addPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    Alert.alert('Who can see this photo?', 'Private photos are blurred until unlocked.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Private 🔒', onPress: () => upload(uri, true) },
      { text: 'Everyone', onPress: () => upload(uri, false) },
    ]);
  };

  const removePhoto = (p: MyPhoto) =>
    Alert.alert('Delete photo?', 'This photo will be removed from your profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(p.id);
            await load();
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Glow color={colors.rose2} size={width} opacity={0.32} style={{ top: -width * 0.5, left: 0 }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
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
        }>
        <View style={styles.head}>
          <Pressable style={styles.settings} onPress={() => navigation.navigate('Settings')}>
            <Icon name="settings" size={20} />
          </Pressable>

          <Pressable onPress={() => navigation.navigate('EditProfile')}>
            <LinearGradient
              colors={[colors.gold1, colors.rose1, colors.rose2, colors.gold2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}>
              <Avatar uri={me?.avatarUrl} seed={me?.id ?? 0} style={styles.avatar} iconScale={0.85} />
            </LinearGradient>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.edit}>
              <Icon name="edit" size={13} color="#fff" strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{me?.name ?? ' '}</Text>
            {isVip && <VipBadge size="md" />}
            {me?.gender && (
              <View style={[styles.gender, me.gender === 'female' && styles.genderF]}>
                <Icon name={me.gender === 'female' ? 'female' : 'male'} size={12} color={me.gender === 'female' ? colors.rose1 : '#7fb0ff'} strokeWidth={2.5} />
              </View>
            )}
          </View>
          <Text style={styles.id}>ID: {me?.id ?? '—'}</Text>

          <View style={styles.stats}>
            <Stat value={me?.followingCount} label="Following" />
            <Stat value={me?.followersCount} label="Followers" />
            <StatCount value={me?.visitorsCount} label="Visitors" badge={me?.visitorsNew} gold onPress={() => navigation.navigate('Visitors')} />
          </View>
        </View>

        {/* ---------- My photos ---------- */}
        <View style={styles.photosHead}>
          <Text style={styles.photosTitle}>My photos</Text>
          <Text style={styles.photosHint}>
            {me?.photos.length ?? 0}/{MAX_PHOTOS} · hold to delete
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {(me?.photos.length ?? 0) < MAX_PHOTOS && (
            <Pressable onPress={addPhoto} disabled={uploading} style={[styles.photo, styles.addPhoto]}>
              {uploading ? (
                <ActivityIndicator color={colors.rose1} />
              ) : (
                <>
                  <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addCircle}>
                    <Icon name="plus" size={18} color="#fff" strokeWidth={2.6} />
                  </LinearGradient>
                  <Text style={styles.addText}>Add photo</Text>
                </>
              )}
            </Pressable>
          )}
          {/* Status lagana (24 ghante) — gold box, Add photo ke bagal me */}
          <Pressable onPress={addStatus} style={[styles.photo, styles.addPhoto, styles.addStatus]}>
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addCircle}>
              <Icon name="plus" size={18} color={colors.goldText} strokeWidth={2.6} />
            </LinearGradient>
            <Text style={[styles.addText, { color: colors.gold1 }]}>Add status</Text>
          </Pressable>
          {me?.photos.map((p, i) => (
            <Pressable key={p.id} onPress={() => setViewer(i)} onLongPress={() => removePhoto(p)} style={styles.photo}>
              <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} />
              {p.isLocked && (
                <View style={styles.lockBadge}>
                  <Icon name="lock" size={12} color={colors.gold1} strokeWidth={2.4} />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Host banna — sirf agency link wali ladki ko (server batata hai canApply) */}
        {host?.canApply && (
          <Pressable
            onPress={() => navigation.navigate(host.role === 'host' || host.application ? 'HostStatus' : 'HostIntro')}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={['rgba(246,220,155,0.18)', 'rgba(255,95,143,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hostRow}>
              <Text style={styles.hostEmoji}>🎙️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.hostTitle}>
                  {host.role === 'host'
                    ? 'You are a Meto host'
                    : host.application?.status === 'pending'
                    ? 'Host application under review'
                    : host.application?.status === 'rejected'
                    ? 'Host application not approved'
                    : 'Become a host'}
                </Text>
                <Text style={styles.hostSub}>
                  {host.role === 'host'
                    ? 'Users can find and call you'
                    : host.application?.status === 'pending'
                    ? 'We will notify you soon'
                    : host.application?.status === 'rejected'
                    ? 'Tap to see why and apply again'
                    : host.invite
                    ? `Invited by ${host.invite.name}`
                    : 'Earn by video chatting'}
                </Text>
              </View>
              <Icon name="chevron" size={16} color={colors.gold1} />
            </LinearGradient>
          </Pressable>
        )}

        {/* Wallet */}
        <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wallet}>
          <View>
            <Text style={styles.walletLbl}>Gems balance</Text>
            <View style={styles.balRow}>
              <Coin size={26} />
              <Text style={styles.bal}>{(balance ?? 0).toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <Pressable onPress={() => navigation.navigate('Wallet')}>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.recharge}>
              <Icon name="plus" size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.rechargeText}>Recharge</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>

        <Pressable onPress={() => navigation.navigate('Vip')} style={styles.vip}>
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.crown}>
            <Icon name="crown" size={20} color={colors.goldText} />
          </LinearGradient>
          <View>
            <Text style={styles.vipTitle}>Meto VIP</Text>
            <Text style={styles.vipSub}>
              {isVip && me?.vipUntil ? `Active till ${vipDate(me.vipUntil)}` : 'Cheaper calls · +10% gems'}
            </Text>
          </View>
          <View style={styles.vipGo}>
            <Text style={styles.vipGoText}>{isVip ? 'Active' : 'Join'}</Text>
            <Icon name="chevron" size={14} color={colors.gold1} />
          </View>
        </Pressable>

        <View style={styles.menu}>
          {MENU.map((r, i) => (
            <Pressable key={r.label} onPress={() => (r.action === 'checkin' ? setCheckInOpen(true) : r.to && navigation.navigate(r.to))} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={[styles.rowIc, { backgroundColor: r.bg }]}>
                <Icon name={r.icon} size={17} color={r.tint} />
              </View>
              <Text style={styles.rowText}>{r.label}</Text>
              <View style={styles.rowEnd}>
                {r.action === 'checkin' && checkIn ? (
                  <Text style={[styles.rowEndText, { color: checkIn.claimedToday ? colors.fine : colors.rose1 }]}>
                    {checkIn.claimedToday ? 'Claimed ✓' : `+${checkIn.rewards[checkIn.day - 1]} free`}
                  </Text>
                ) : r.to === 'Level' && me ? (
                  <Text style={[styles.rowEndText, { color: colors.gold1 }]}>Lv.{me.level}</Text>
                ) : (
                  !!r.end && <Text style={[styles.rowEndText, { color: r.endTint }]}>{r.end}</Text>
                )}
                <Icon name="chevron" size={15} color={colors.fine} />
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={onSignOut} style={[styles.menu, styles.row]}>
          <View style={[styles.rowIc, { backgroundColor: 'rgba(255,107,107,0.12)' }]}>
            <Icon name="logout" size={17} color="#ff8a8a" />
          </View>
          <Text style={[styles.rowText, { color: '#ff8a8a' }]}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <PhotoViewer photos={me?.photos.map(p => p.url) ?? []} index={viewer} onClose={() => setViewer(null)} />
      {checkInOpen && <CheckInSheet onClose={() => setCheckInOpen(false)} onClaimed={setCheckIn} />}
    </View>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{value ?? '—'}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  head: { alignItems: 'center', paddingHorizontal: 20 },
  settings: {
    position: 'absolute',
    right: 18,
    top: 0,
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  ring: { width: 100, height: 100, borderRadius: 50, padding: 3, marginTop: 22 },
  avatar: { flex: 1, borderRadius: 47, borderWidth: 3, borderColor: colors.bg },
  edit: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  name: { color: colors.text, fontSize: 21, fontWeight: '700' },
  gender: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(90,150,255,0.18)' },
  genderF: { backgroundColor: 'rgba(255,95,143,0.18)' },
  id: { color: colors.fine, fontSize: 12, marginTop: 3 },
  stats: { flexDirection: 'row', width: '100%', marginTop: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: colors.text, fontSize: 17, fontWeight: '700' },
  statLbl: { color: colors.fine, fontSize: 11 },

  photosHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 20, marginBottom: 10 },
  photosTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  photosHint: { color: colors.fine, fontSize: 11 },
  photos: { gap: 8, paddingHorizontal: 16 },
  photo: {
    width: 84,
    height: 106,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addPhoto: { alignItems: 'center', justifyContent: 'center', gap: 8, borderStyle: 'dashed', borderColor: 'rgba(255,95,143,0.45)' },
  addStatus: { borderColor: 'rgba(212,166,75,0.5)', backgroundColor: 'rgba(212,166,75,0.06)' },
  addCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.muted, fontSize: 11, fontWeight: '500' },
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  wallet: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  walletLbl: { color: '#7a5420', fontSize: 11.5, fontWeight: '500' },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  bal: { color: colors.goldText, fontSize: 28, fontWeight: '800' },
  recharge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: 13 },
  rechargeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  hostRow: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(246,220,155,0.45)',
  },
  hostEmoji: { fontSize: 24 },
  hostTitle: { color: colors.gold1, fontSize: 14, fontWeight: '800' },
  hostSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  vip: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 20,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f1018',
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.3)',
  },
  crown: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  vipTitle: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
  vipSub: { color: colors.fine, fontSize: 11 },
  vipGo: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
  vipGoText: { color: colors.gold1, fontSize: 12, fontWeight: '600' },

  menu: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { color: colors.text, fontSize: 13.5, fontWeight: '500' },
  rowEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowEndText: { fontSize: 12, fontWeight: '600' },
});

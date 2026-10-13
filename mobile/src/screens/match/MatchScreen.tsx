import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import Avatar from '../../components/Avatar';
import Coin from '../../components/Coin';
import VipBadge from '../../components/VipBadge';
import { colors, gradients } from '../../theme';
import { api } from '../../services/api';
import { getMe } from '../../services/auth';
import type { UserCard } from '../../services/users';
import { useCall } from '../../context/CallContext';
import { useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Match'>;
type MatchUser = UserCard & { bio: string | null; languages: string[] };

// Abhi online, call pe nahi, "Online for calls" wali host — server random chunta hai
const nextMatch = (skip: number[]) => api<{ user: MatchUser | null }>(`/api/match/next?skip=${skip.join(',')}`);

const MIN_SEARCH_MS = 1200; // radar thodi der ghoome (asli request ke saath)

function Radar({ me }: { me: { avatarUrl: string | null; id: number } | null }) {
  const waves = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loops = waves.map((w, i) =>
      Animated.loop(Animated.sequence([Animated.delay(i * 800), Animated.timing(w, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(w, { toValue: 0, duration: 0, useNativeDriver: true })])),
    );
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loops.forEach(l => l.start());
    s.start();
    return () => {
      loops.forEach(l => l.stop());
      s.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.radar}>
      {waves.map((w, i) => (
        <Animated.View
          key={i}
          style={[styles.wave, { opacity: w.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: w.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }] }]}
        />
      ))}
      <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}>
        <View style={[styles.dotP, { left: 6, top: 70, backgroundColor: colors.rose1 }]} />
        <View style={[styles.dotP, { right: 4, top: 34, backgroundColor: colors.gold1 }]} />
        <View style={[styles.dotP, { right: 30, bottom: 22, backgroundColor: '#ffb08a' }]} />
      </Animated.View>
      <View style={styles.me}>{me ? <Avatar uri={me.avatarUrl} seed={me.id} style={styles.meAv} iconScale={0.85} /> : null}</View>
    </View>
  );
}

export default function MatchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { placeCall } = useCall();
  const { callRate } = useWallet();
  const [phase, setPhase] = useState<'searching' | 'found' | 'none' | 'error'>('searching');
  const [user, setUser] = useState<MatchUser | null>(null);
  const [me, setMe] = useState<{ avatarUrl: string | null; id: number } | null>(null);
  const [err, setErr] = useState('');
  const skipped = useRef<number[]>([]);
  const run = useRef(0);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getMe()
      .then(u => setMe({ avatarUrl: u.avatarUrl, id: u.id }))
      .catch(() => {});
  }, []);

  const search = useCallback(async () => {
    const id = ++run.current;
    setPhase('searching');
    setUser(null);
    const started = Date.now();
    try {
      const r = await nextMatch(skipped.current);
      const wait = MIN_SEARCH_MS - (Date.now() - started);
      if (wait > 0) await new Promise<void>(res => setTimeout(() => res(), wait));
      if (id !== run.current) return;
      if (!r.user) {
        setPhase('none');
        return;
      }
      setUser(r.user);
      setPhase('found');
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    } catch (e) {
      if (id !== run.current) return;
      setErr((e as Error).message);
      setPhase('error');
    }
  }, [pop]);

  useEffect(() => {
    search();
    return () => {
      run.current++;
    };
  }, [search]);

  const skip = () => {
    if (user) skipped.current = [...skipped.current, user.id].slice(-150);
    search();
  };

  const call = () => {
    if (!user) return;
    skipped.current = [...skipped.current, user.id].slice(-150);
    placeCall(user, 'match'); // Match ka fix rate
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Match now</Text>
        <View style={styles.rate}>
          <Coin size={16} />
          <Text style={styles.rateText}>{callRate}/min</Text>
        </View>
      </View>


      {phase === 'found' && user ? (
        <>
          <Animated.View style={[styles.cardWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
            <View style={styles.card}>
              <Avatar uri={user.avatarUrl} seed={user.id} style={StyleSheet.absoluteFill} iconScale={0.8} />
              <LinearGradient colors={['transparent', 'rgba(10,3,7,0.9)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
              <View style={styles.online}>
                <View style={styles.onDot} />
                <Text style={styles.onText}>Online now</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>
                    {user.name} <Text style={styles.age}>{user.age}</Text>
                  </Text>
                  {user.isVerified && <Icon name="verified" size={20} />}
                  {user.isVip && <VipBadge size="md" />}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {[user.city ? `📍 ${user.city}` : null, user.languages?.join(', ')].filter(Boolean).join(' · ')}
                </Text>
                {!!user.bio && (
                  <Text style={styles.bio} numberOfLines={2}>
                    {user.bio}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>
          <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable onPress={skip} style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <Pressable onPress={call} style={{ flex: 1 }}>
              <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.callBtn}>
                <Icon name="videoFill" size={20} color="#fff" />
                <Text style={styles.callText}>Video call</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.center}>
            <Radar me={me} />
            {phase === 'searching' ? (
              <>
                <Text style={styles.h}>Finding someone…</Text>
                <Text style={styles.p}>Only people online right now</Text>
              </>
            ) : phase === 'none' ? (
              <>
                <Text style={styles.h}>No one is free right now</Text>
                <Text style={styles.p}>Everyone online is busy. Try again in a moment.</Text>
              </>
            ) : (
              <>
                <Text style={styles.h}>Could not search</Text>
                <Text style={styles.p}>{err}</Text>
              </>
            )}
          </View>
          <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
            {phase === 'searching' ? (
              <Pressable onPress={() => navigation.goBack()} style={[styles.skip, { flex: 1 }]}>
                <Text style={styles.skipText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  skipped.current = [];
                  search();
                }}
                style={{ flex: 1 }}>
                <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.callBtn}>
                  <Text style={styles.callText}>Try again</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700', flex: 1 },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingLeft: 5, paddingRight: 10, borderRadius: 15, backgroundColor: 'rgba(212,166,75,0.14)', borderWidth: 1, borderColor: 'rgba(212,166,75,0.32)' },
  rateText: { color: colors.gold1, fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  radar: { width: 250, height: 250, alignItems: 'center', justifyContent: 'center' },
  wave: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1.5, borderColor: 'rgba(255,95,143,0.6)' },
  orbit: { position: 'absolute', width: 230, height: 230 },
  dotP: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  me: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', backgroundColor: colors.surface },
  meAv: { width: 94, height: 94, borderRadius: 47 },
  h: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 26, textAlign: 'center' },
  p: { color: colors.muted, fontSize: 13, marginTop: 5, textAlign: 'center' },
  cardWrap: { flex: 1, marginHorizontal: 16, marginTop: 14 },
  card: { flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,95,143,0.35)' },
  online: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.4)' },
  onDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.online },
  onText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  info: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { color: '#fff', fontSize: 26, fontWeight: '800' },
  age: { color: 'rgba(255,255,255,0.8)', fontWeight: '400' },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
  bio: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  skip: { width: 120, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  skipText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  callBtn: { height: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  callText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

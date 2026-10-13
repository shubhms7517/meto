import React, { memo, useEffect } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import LinearGradient from 'react-native-linear-gradient';
import Avatar from './Avatar';
import Icon from './Icon';
import VipBadge from './VipBadge';
import Coin from './Coin';
import { useWallet } from '../context/WalletContext';
import { colors, gradients } from '../theme';
import { timeAgo, UserCard as Card } from '../services/users';

type Props = { user: Card; onPress: () => void; onCall: () => void };

// Saare cards ki ek hi "dhadkan": icon do baar pop (dhak-dhak) + andar se halki safed lehar.
// Ek hi value 0→1 ghoomti hai, baaki sab usi se — sab cards ek saath, phone pe halka.
const beat = new Animated.Value(0);
let beating = false;
function startBeat() {
  if (beating) return;
  beating = true;
  Animated.loop(
    Animated.timing(beat, {
      toValue: 1,
      duration: 2200,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  ).start();
}
const iconScale = beat.interpolate({
  inputRange: [0, 0.08, 0.16, 0.24, 0.32, 1],
  outputRange: [1, 1.28, 0.96, 1.16, 1, 1],
});
const rippleScale = beat.interpolate({
  inputRange: [0, 0.45, 1],
  outputRange: [0.4, 1.5, 1.5],
});
const rippleOpacity = beat.interpolate({
  inputRange: [0, 0.05, 0.45, 1],
  outputRange: [0, 0.55, 0, 0],
});

function UserCard({ user, onPress, onCall }: Props) {
  const reduced = useReducedMotion();
  const { rateFor } = useWallet();
  useEffect(() => {
    if (!reduced) startBeat();
  }, [reduced]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Avatar
        uri={user.avatarUrl}
        seed={user.id}
        style={StyleSheet.absoluteFill}
        iconScale={0.82}
      />
      <LinearGradient
        colors={['transparent', 'rgba(10,3,7,0.88)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        {user.online && user.busy ? (
          <View style={[styles.pill, styles.busy]}>
            <View style={[styles.live, { backgroundColor: '#fff' }]} />
            <Text style={styles.pillText}>Busy</Text>
          </View>
        ) : user.online ? (
          <View style={styles.pill}>
            <View style={styles.live} />
            <Text style={styles.pillText}>Online</Text>
          </View>
        ) : user.isNew ? (
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pill}
          >
            <Text style={[styles.pillText, { color: colors.goldText }]}>
              ★ New
            </Text>
          </LinearGradient>
        ) : user.lastSeenAt ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              Active {timeAgo(user.lastSeenAt)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
            <Text style={styles.age}> {user.age}</Text>
          </Text>
          {user.isVerified && <Icon name="verified" size={15} />}
          {user.isVip && <VipBadge />}
        </View>
        {user.rate ? (
          // Host ka rate (VIP ko chhoot wala) — Yaki jaisa card ke neeche
          <View style={styles.rateRow}>
            <Coin size={13} />
            <Text style={styles.rate}>
              {rateFor(user.rate).toLocaleString('en-IN')}/min
            </Text>
          </View>
        ) : !!user.city ? (
          <Text style={styles.meta} numberOfLines={1}>
            {user.city}
          </Text>
        ) : null}
      </View>

        <Pressable onPress={onCall} hitSlop={6} style={styles.callWrap}>
          <LinearGradient
            colors={gradients.rose}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.call}
          >
            {/* Button tika rehta hai — icon dhadakta hai, beech se lehar nikalti hai */}
            {!reduced && (
              <Animated.View
                style={[
                  styles.ripple,
                  {
                    opacity: rippleOpacity,
                    transform: [{ scale: rippleScale }],
                  },
                ]}
              />
            )}
            <Animated.View
              style={
                reduced ? undefined : { transform: [{ scale: iconScale }] }
              }
            >
              <Icon name="videoFill" size={18} color="#fff" />
            </Animated.View>
          </LinearGradient>
        </Pressable>
    </Pressable>
  );
}

export default memo(UserCard);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    maxWidth: (Dimensions.get('window').width - 44) / 2, // odd count pe aakhri card poori width na le
    height: 230,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: colors.surface,
  },
  top: { position: 'absolute', top: 10, left: 10, flexDirection: 'row' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  busy: { backgroundColor: 'rgba(255,59,92,0.85)' },
  live: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.online,
  },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  info: { position: 'absolute', left: 12, right: 56, bottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: '#fff', fontSize: 15.5, fontWeight: '700', flexShrink: 1 },
  age: { color: 'rgba(255,255,255,0.75)', fontSize: 14.5, fontWeight: '400' },
  meta: { color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 1 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  rate: { color: colors.gold1, fontSize: 11.5, fontWeight: '800' },
  callWrap: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 14,
    elevation: 8,
    shadowColor: colors.rose2,
  },
  call: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ripple: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
});

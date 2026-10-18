import React, { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import Icon, { IconName } from '../../components/Icon';
import Wordmark from '../../components/Wordmark';
import { colors, type } from '../../theme';
import { signInWithGoogle } from '../../services/auth';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;


type Tile = { colors: string[]; ink: string; online?: boolean; style: ViewStyle };

// Placeholder profile cards (baad me real users ki photos aayengi)
const tilesFor = (W: number, H: number): Tile[] => [
  { colors: ['#ff8fb1', '#a3164a'], ink: '#5c0c2c', online: true,
    style: { width: W * 0.42, height: H * 0.26, top: H * 0.05, left: -W * 0.05, transform: [{ rotate: '-8deg' }] } },
  { colors: ['#f6dc9b', '#b0802d'], ink: '#6b4a14',
    style: { width: W * 0.42, height: H * 0.26, top: H * 0.09, right: -W * 0.04, transform: [{ rotate: '7deg' }] } },
  { colors: ['#c48bff', '#6a2bb0'], ink: '#3c1470', online: true,
    style: { width: W * 0.36, height: H * 0.21, top: H * 0.3, left: W * 0.11, transform: [{ rotate: '4deg' }] } },
  { colors: ['#ff9f7a', '#c2402a'], ink: '#6d1c10',
    style: { width: W * 0.36, height: H * 0.21, top: H * 0.31, right: W * 0.08, transform: [{ rotate: '-6deg' }] } },
];

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Verified' },
  { icon: 'lock', label: 'Private' },
  { icon: 'video', label: 'HD Calls' },
];

export default function WelcomeScreen({ navigation }: Props) {
  const { width: W, height: H } = useWindowDimensions(); // har render pe asli chaudai
  const TILES = tilesFor(W, H);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const onGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle();
      if (res) {
        navigation.reset({ index: 0, routes: [{ name: res.needsProfile ? 'ProfileSetup' : 'Main' }] });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      background={
        <View style={StyleSheet.absoluteFill}>
          {TILES.map((t, i) => (
            <LinearGradient key={i} colors={t.colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.tile, t.style]}>
              {t.online && (
                <View style={styles.online}>
                  <View style={styles.dot} />
                  <Text style={styles.onlineText}>Online</Text>
                </View>
              )}
              <View style={styles.person}>
                <Icon name="person" size={W * 0.28} color={t.ink} />
              </View>
            </LinearGradient>
          ))}
          <LinearGradient
            colors={['rgba(18,7,13,0.2)', 'rgba(18,7,13,0.4)', colors.bg]}
            locations={[0, 0.35, 0.62]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      }>
      <Wordmark size={30} />
      <Text style={type.title}>Meet someone{'\n'}worth talking to.</Text>
      <Text style={[type.sub, styles.sub]}>
        Verified profiles, private chats and HD video calls — all in one place.
      </Text>

      <View style={styles.features}>
        {FEATURES.map(f => (
          <View key={f.label} style={styles.feature}>
            <Icon name={f.icon} size={14} color={colors.gold2} />
            <Text style={styles.featureText}>{f.label}</Text>
          </View>
        ))}
      </View>

      <Button
        title="Continue with Phone"
        icon={<Icon name="phone" size={20} color="#fff" />}
        onPress={() => navigation.navigate('Phone')}
      />
      <Button
        variant="ghost"
        title="Continue with Google"
        icon={<Icon name="google" size={20} />}
        style={styles.google}
        loading={googleLoading}
        onPress={onGoogle}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.fine}>
        By continuing you agree to our <Text style={styles.link}>Terms</Text> &{' '}
        <Text style={styles.link}>Privacy Policy</Text>.{'\n'}18+ only.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'flex-end' },
  tile: { position: 'absolute', borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  person: { position: 'absolute', bottom: -12, alignSelf: 'center' },
  online: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingLeft: 7,
    paddingRight: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.online },
  onlineText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  sub: { marginTop: 8 },
  features: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 18, marginBottom: 22 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { color: colors.muted, fontSize: 11.5 },
  google: { marginTop: 12 },
  error: { color: '#ff8a8a', fontSize: 12, textAlign: 'center', marginTop: 10 },
  fine: { color: colors.fine, fontSize: 11.5, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  link: { color: colors.gold1, fontWeight: '500' },
});

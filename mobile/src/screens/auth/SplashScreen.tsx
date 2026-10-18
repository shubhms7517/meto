import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../../components/Screen';
import Glow from '../../components/Glow';
import Icon from '../../components/Icon';
import Wordmark from '../../components/Wordmark';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getMe, signOut, waitForAuth } from '../../services/auth';
import { ApiError } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const DURATION = 1800;

export default function SplashScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions(); // har render pe asli chaudai (lock / rotate ke baad bhi sahi)
  const fade = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 1, duration: DURATION, useNativeDriver: false }).start();
    // Animation aur login check saath-saath chalte hain
    const minDelay = new Promise<void>(r => setTimeout(r, DURATION + 150));
    let cancelled = false;

    (async () => {
      let next: keyof RootStackParamList = 'Welcome';
      if (await waitForAuth()) {
        try {
          const me = await getMe();
          next = me.profileComplete ? 'Main' : 'ProfileSetup';
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            await signOut(); // banned / account nahi mila
          } else {
            next = 'Main'; // server/network down — logged-in user ko bahar mat nikalo
          }
        }
      }
      await minDelay;
      if (!cancelled) navigation.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [fade, progress, navigation]);

  return (
    <Screen
      contentStyle={styles.center}
      background={
        <>
          <Glow color={colors.rose2} size={width * 1.3} opacity={0.5} style={{ top: height * 0.12, left: -width * 0.4 }} />
          <Glow color={colors.gold2} size={width} opacity={0.22} style={{ bottom: -width * 0.1, right: -width * 0.4 }} />
        </>
      }>
      <Animated.View
        style={[
          styles.center,
          { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
        ]}>
        <LinearGradient colors={gradients.roseDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
          <Icon name="heart" size={38} color="#fff" />
        </LinearGradient>
        <View style={styles.wordmark}>
          <Wordmark size={48} />
        </View>
        <Text style={styles.tagline}>REAL PEOPLE · REAL CONNECTIONS</Text>
      </Animated.View>

      <View style={styles.track}>
        <Animated.View
          style={{ height: '100%', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 14,
    shadowColor: colors.rose2,
  },
  wordmark: { marginTop: 18 },
  tagline: { color: colors.muted, fontSize: 11, letterSpacing: 2.5, marginTop: 4 },
  track: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
});

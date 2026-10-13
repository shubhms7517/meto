import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraDevice, useVideoOutput } from 'react-native-vision-camera';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { ensureCallPermissions } from '../../services/calls';
import { uploadHostVideo } from '../../services/users';
import { BigButton, HostHeader, s } from './common';

type Props = NativeStackScreenProps<RootStackParamList, 'HostVideo'>;

const SECONDS = 10;

// Intro video (KYC jaisa): sirf front camera, 3-2-1 ke baad 10 sec apne aap record, khud ruk jaata hai
export default function HostVideoScreen({ navigation, route }: Props) {
  const profileMode = route.params?.mode === 'profile';
  const [uploading, setUploading] = useState(false);
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('front');
  const video = useVideoOutput({ targetResolution: CommonResolutions.HD_16_9, enableAudio: true });
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'ready' | 'count' | 'rec' | 'done'>('ready');
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(SECONDS);
  const [file, setFile] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    ensureCallPermissions().then(setAllowed);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const start = () => {
    setErr('');
    setPhase('count');
    setCount(3);
    [1, 2].forEach(i => timers.current.push(setTimeout(() => setCount(3 - i), i * 1000)));
    timers.current.push(setTimeout(record, 3000));
  };

  const record = async () => {
    try {
      const recorder = await video.createRecorder({ maxDuration: SECONDS });
      setPhase('rec');
      setLeft(SECONDS);
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: SECONDS * 1000, easing: Easing.linear, useNativeDriver: false }).start();
      for (let i = 1; i <= SECONDS; i++) timers.current.push(setTimeout(() => setLeft(SECONDS - i), i * 1000));
      await recorder.startRecording(
        path => {
          setFile(path.startsWith('file://') ? path : `file://${path}`);
          setPhase('done');
        },
        e => {
          setErr(e.message);
          setPhase('ready');
        },
      );
    } catch (e) {
      setErr((e as Error).message);
      setPhase('ready');
    }
  };

  // Wahi purana form (photos ke saath) — naya form nahi
  const use = async () => {
    if (!profileMode) return navigation.popTo('HostApply', { video: file! }, { merge: true });
    // Me ka intro video: seedha upload → users profile pe dekhenge
    setUploading(true);
    try {
      await uploadHostVideo(file!);
      navigation.goBack();
    } catch (e) {
      setErr((e as Error).message);
      setPhase('ready');
    } finally {
      setUploading(false);
    }
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[s.root, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" />
      {allowed && device && phase !== 'done' ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[video]} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, st.dim]} pointerEvents="none" />
      <HostHeader title="Intro video" top={insets.top} onBack={() => navigation.goBack()} />

      <View style={st.center} pointerEvents="none">
        <View style={[st.oval, phase === 'rec' && st.ovalRec]} />
        {phase === 'count' && <Text style={st.count}>{count}</Text>}
        {phase === 'done' && <Text style={st.doneMark}>✓</Text>}
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {allowed === false ? (
          <Text style={st.text}>Allow camera and microphone in Settings to record.</Text>
        ) : !device ? (
          <ActivityIndicator color={colors.rose1} />
        ) : phase === 'ready' ? (
          <>
            <Text style={st.text}>Keep your face in the oval. Say hi and the languages you speak.</Text>
            {!!err && <Text style={st.err}>{err}</Text>}
            <BigButton label="Start recording" onPress={start} />
          </>
        ) : phase === 'count' ? (
          <Text style={st.text}>Get ready…</Text>
        ) : phase === 'rec' ? (
          <>
            <Text style={st.recText}>● Recording · {left}s</Text>
            <View style={st.bar}>
              <Animated.View style={[st.barFill, { width }]} />
            </View>
          </>
        ) : (
          <>
            <Text style={st.text}>Video recorded ({SECONDS} sec) ✓</Text>
            {uploading ? <ActivityIndicator color={colors.rose1} style={{ marginTop: 14 }} /> : <BigButton label={profileMode ? 'Save to my profile' : 'Use this video'} onPress={use} />}
            <Pressable onPress={() => setPhase('ready')} hitSlop={8}>
              <Text style={st.retake}>Record again</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  oval: { width: 230, height: 300, borderRadius: 150, borderWidth: 3, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)' },
  ovalRec: { borderStyle: 'solid', borderColor: colors.rose1 },
  count: { position: 'absolute', color: '#fff', fontSize: 90, fontWeight: '800' },
  doneMark: { position: 'absolute', color: colors.online, fontSize: 90, fontWeight: '800' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, backgroundColor: 'rgba(10,3,7,0.75)' },
  text: { color: '#fff', fontSize: 14, textAlign: 'center', marginHorizontal: 24, lineHeight: 20 },
  err: { color: '#ff6b6b', fontSize: 12, textAlign: 'center', marginTop: 6 },
  recText: { color: colors.rose1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  bar: { height: 6, borderRadius: 3, marginHorizontal: 24, marginTop: 12, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.rose1 },
  retake: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraDevice, usePhotoOutput } from 'react-native-vision-camera';
import { useFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { applyForHost } from '../../services/host';
import { ensureCallPermissions } from '../../services/calls';
import { BigButton, HostHeader, s } from './common';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'HostSelfie'>;

// KYC jaisa: chehra pehchaan ke har pose pe APNE AAP photo (koi button nahi)
const POSES = [
  { label: 'Look straight', ok: (f: Face) => Math.abs(f.yawAngle) < 10 && Math.abs(f.pitchAngle) < 12 && (f.leftEyeOpenProbability ?? 1) > 0.5 },
  { label: 'Turn your head', ok: (f: Face) => Math.abs(f.yawAngle) > 22 },
  { label: 'Smile', ok: (f: Face) => (f.smilingProbability ?? 0) > 0.75 && Math.abs(f.yawAngle) < 15 },
];
const HOLD_MS = 600; // pose itni der tika rahe tab photo (galti se na kheeche)

export default function HostSelfieScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('front');
  const photo = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, quality: 0.85 });
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [hint, setHint] = useState('Keep your face inside the oval');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const since = useRef(0);
  const step = useRef(0);
  step.current = shots.length;

  useEffect(() => {
    ensureCallPermissions().then(setAllowed);
  }, []);

  const capture = useCallback(async () => {
    busy.current = true;
    try {
      const f = await photo.capturePhotoToFile({}, {});
      const uri = f.filePath.startsWith('file://') ? f.filePath : `file://${f.filePath}`;
      setShots(sh => [...sh, uri].slice(0, POSES.length));
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      since.current = 0;
      setTimeout(() => (busy.current = false), 900); // agle pose se pehle saans
    }
  }, [photo]);

  const onFaces = useCallback(
    (faces: Face[]) => {
      if (busy.current || step.current >= POSES.length) return;
      if (faces.length !== 1) {
        since.current = 0;
        setHint(faces.length ? 'Only your face please' : 'Keep your face inside the oval');
        return;
      }
      const f = faces[0];
      if (f.bounds.width / Math.max(1, f.frameWidth) < 0.22) {
        since.current = 0;
        setHint('Come a little closer');
        return;
      }
      const pose = POSES[step.current];
      if (!pose.ok(f)) {
        since.current = 0;
        setHint(pose.label);
        return;
      }
      if (!since.current) since.current = Date.now();
      setHint('Hold still…');
      if (Date.now() - since.current >= HOLD_MS) capture();
    },
    [capture],
  );

  const faces = useFaceDetectorOutput({
    performanceMode: 'fast',
    runClassifications: true,
    cameraFacing: 'front',
    onFacesDetected: onFaces,
    onError: () => {},
  });

  const done = shots.length >= POSES.length;

  const submit = async () => {
    if (sending) return;
    setSending(true);
    try {
      await applyForHost({ ...route.params, selfies: shots });
      navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'HostStatus' }] });
    } catch (e) {
      appAlert('Could not submit', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" />
      {allowed && device && !done ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[photo, faces]} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, st.dim]} pointerEvents="none" />
      <HostHeader title="Live selfie" top={insets.top} onBack={() => navigation.goBack()} />

      <View style={st.center} pointerEvents="none">
        {done ? (
          <View style={st.thumbs}>
            {shots.map(u => (
              <Image key={u} source={{ uri: u }} style={st.thumb} />
            ))}
          </View>
        ) : (
          <View style={[st.oval, hint === 'Hold still…' && st.ovalOk]} />
        )}
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={st.poses}>
          {POSES.map((p, i) => (
            <View key={p.label} style={[st.pose, i === shots.length && st.poseOn, i < shots.length && st.poseDone]}>
              <Text style={[st.poseText, i <= shots.length && { color: '#fff' }]}>
                {i < shots.length ? '✓' : i + 1} · {p.label}
              </Text>
            </View>
          ))}
        </View>

        {allowed === false ? (
          <Text style={st.text}>Allow the camera in Settings to continue.</Text>
        ) : !device ? (
          <ActivityIndicator color={colors.rose1} />
        ) : !done ? (
          <Text style={st.big}>{hint}</Text>
        ) : sending ? (
          <View style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
            <ActivityIndicator color={colors.rose1} />
            <Text style={st.text}>Uploading… please keep Meto open</Text>
          </View>
        ) : (
          <>
            <Text style={st.text}>Only the Meto team sees these selfies.</Text>
            <BigButton label="Submit for review" onPress={submit} />
            <Pressable onPress={() => setShots([])} hitSlop={8}>
              <Text style={st.retake}>Retake</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.2)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  oval: { width: 230, height: 300, borderRadius: 150, borderWidth: 3, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)' },
  ovalOk: { borderStyle: 'solid', borderColor: colors.online },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 96, height: 128, borderRadius: 14, borderWidth: 2, borderColor: colors.online },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, backgroundColor: 'rgba(10,3,7,0.78)' },
  poses: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap', paddingHorizontal: 10 },
  pose: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  poseOn: { borderColor: colors.rose1, backgroundColor: 'rgba(255,95,143,0.18)' },
  poseDone: { borderColor: 'rgba(62,224,143,0.5)' },
  poseText: { color: colors.muted, fontSize: 11.5 },
  big: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  text: { color: '#fff', fontSize: 13.5, textAlign: 'center', marginHorizontal: 24, lineHeight: 19 },
  retake: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' },
});

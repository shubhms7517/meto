import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getMyProfile } from '../../services/users';
import { getHostMe } from '../../services/host';
import { BigButton, HostHeader, s } from './common';

type Props = NativeStackScreenProps<RootStackParamList, 'HostApply'>;

const PHOTOS = 3;
const VIDEO_SEC = 30; // live video (HostVideoScreen ka APPLY_SECONDS)

// Form: 3 photo, 30 sec live video, umar (profile se), agency (invite link se locked, warna seedha Meto) → selfie
export default function HostApplyScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [video, setVideo] = useState<string | null>(null);
  const [dob, setDob] = useState<{ text: string; age: number | null } | null>(null);
  const [agency, setAgency] = useState<{ name: string; code: string } | null>(null);

  useEffect(() => {
    getMyProfile()
      .then(me => {
        const d = me.birthday ? new Date(me.birthday) : null;
        setDob({ text: d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', age: me.age });
      })
      .catch(() => {});
    getHostMe()
      .then(h => setAgency(h.invite))
      .catch(() => {});
  }, []);

  const pickPhoto = async (i: number) => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
    const uri = res.assets?.[0]?.uri;
    if (uri) setPhotos(p => p.map((x, j) => (j === i ? uri : x)));
  };

  // Video apne camera screen pe (front camera, 30 sec apne aap) — wahan se params me wapas aata hai
  const recordVideo = () => navigation.navigate('HostVideo');
  useEffect(() => {
    if (route.params?.video) setVideo(route.params.video);
  }, [route.params?.video]);

  const tooYoung = dob?.age != null && dob.age < 18;
  const ready = photos.every(Boolean) && !!video && !tooYoung;

  const next = () =>
    navigation.navigate('HostSelfie', { photos: photos as string[], video: video! });

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <HostHeader title="Host application" top={insets.top} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Photos ({PHOTOS}) & intro video ({VIDEO_SEC} sec)</Text>
        <View style={st.row}>
          {photos.map((uri, i) => (
            // key badalne se photo lagte hi naya dabba (Android: dashed border hatne pe andar kuch draw nahi hota)
            <Pressable key={uri ? `p${i}-${uri}` : `e${i}`} onPress={() => pickPhoto(i)} style={[st.slot, !uri && st.slotEmpty]}>
              {uri ? (
                <>
                  <Image source={{ uri }} style={st.fill} resizeMode="cover" />
                  <Text style={st.okBadge}>✓</Text>
                </>
              ) : (
                <Text style={st.slotText}>+ Photo {i + 1}</Text>
              )}
            </Pressable>
          ))}
        </View>
        <View style={st.row}>
          <Pressable key={video ? 'v-full' : 'v-empty'} onPress={recordVideo} style={[st.slot, !video && st.slotEmpty]}>
            {video ? (
              <LinearGradient colors={['#d7a6ff', '#6b2fb3']} style={[st.fill, st.center]}>
                <Text style={st.videoOk}>▶ Video ✓</Text>
                <Text style={st.videoSub}>Tap to record again</Text>
              </LinearGradient>
            ) : (
              <Text style={st.slotText}>🎥 Record</Text>
            )}
          </Pressable>
          <View style={[st.slot, st.slotEmpty, { flex: 2 }]}>
            <Text style={st.slotText}>Say hi and the languages you speak</Text>
          </View>
        </View>

        <Text style={s.label}>Date of birth</Text>
        <View style={st.input}>
          <Text style={st.inputText}>{dob ? `${dob.text} · from your profile` : '…'}</Text>
          {dob?.age != null && <Text style={[st.age, tooYoung && { color: '#ff6b6b' }]}>{dob.age} yrs {tooYoung ? '✗' : '✓'}</Text>}
        </View>
        {tooYoung && <Text style={st.err}>You must be 18 or older to become a host.</Text>}

        <Text style={s.label}>Agency</Text>
        <View style={[st.input, st.locked]}>
          <Text style={st.inputText}>{agency ? `${agency.name} · ${agency.code}` : 'No agency · directly with Meto'}</Text>
          {agency && <Text style={st.okText}>✓ Locked</Text>}
        </View>
        <Text style={st.hint}>{agency ? "You came from this agency's invite link, so it can't be changed." : 'You are applying directly with the Meto team.'}</Text>

        <BigButton label="Next: live selfie" onPress={next} disabled={!ready} />
        {!ready && !tooYoung && (
          <Text style={st.need}>
            {!photos.every(Boolean) ? 'Add 3 photos' : !video ? 'Record your intro video' : 'You must be 18 or older'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  locked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 8 },
  slot: { flex: 1, flexBasis: 0, height: 104, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  slotEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8 },
  slotText: { color: colors.muted, fontSize: 11.5, textAlign: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  okBadge: { position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', lineHeight: 22, color: '#fff', fontSize: 12, fontWeight: '900', backgroundColor: colors.online },
  videoSub: { color: 'rgba(255,255,255,0.8)', fontSize: 10.5, marginTop: 4 },
  videoOk: { color: '#fff', fontSize: 13, fontWeight: '800' },
  input: { marginHorizontal: 16, height: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 13.5 },
  age: { color: colors.online, fontSize: 12, fontWeight: '800' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 16 },
  codeInput: { flex: 1, marginRight: 0, color: colors.text, fontSize: 14, letterSpacing: 1 },
  check: { height: 46, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.5)' },
  checkText: { color: colors.rose1, fontSize: 13, fontWeight: '800' },
  ok: { height: 46, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,224,143,0.1)', borderWidth: 1, borderColor: 'rgba(62,224,143,0.35)' },
  okText: { color: colors.online, fontSize: 12.5, fontWeight: '800' },
  err: { color: '#ff6b6b', fontSize: 12, marginHorizontal: 16, marginTop: 6 },
  hint: { color: colors.fine, fontSize: 11, marginHorizontal: 16, marginTop: 6 },
  need: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});

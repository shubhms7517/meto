import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { BigButton, HostHeader, s, Step } from './common';
import { acceptInvite, getHostMe } from '../../services/host';
import { ApiError } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'HostIntro'>;

const EARN = [
  { big: 'Per minute', small: 'video calls' },
  { big: 'Gifts', small: '& messages' },
  { big: 'UPI', small: 'withdraw' },
];

type Agency = { code: string; name: string };

// "Become a Host" (sirf agency link se): kis agency ne bulaya, kya milega, kya chahiye, niyam
export default function HostIntroScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const code = route.params?.invite;
  const [agency, setAgency] = useState<Agency | null>(null);
  const [fail, setFail] = useState<{ emoji: string; title: string; text: string } | null>(null);

  useEffect(() => {
    // Link se aaye → server ko batao (wahi ladki/ladka jaanchta hai). Me tab se aaye → yaad rakha hua invite
    const load = code ? acceptInvite(code) : getHostMe().then(h => h.invite);
    load
      .then(a => (a ? setAgency(a) : setFail({ emoji: '🔗', title: 'Invite link needed', text: 'Ask an agency for their Meto invite link to become a host.' })))
      .catch(e => {
        const c = e instanceof ApiError ? e.code : '';
        if (c === 'invite_female_only') setFail({ emoji: '🙅', title: 'This invite is only for women', text: 'Only women can become hosts on Meto. You can keep using the app as usual.' });
        else if (c === 'already_host') navigation.replace('HostStatus');
        else if (c === 'agency_not_found') setFail({ emoji: '🔗', title: 'Invalid invite link', text: 'This agency link is not valid anymore. Ask your agency for a new one.' });
        else setFail({ emoji: '⚠️', title: 'Something went wrong', text: (e as Error).message });
      });
  }, [code, navigation]);

  if (fail || !agency) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
        <HostHeader title="Host invite" top={insets.top} onBack={() => navigation.goBack()} />
        {!fail ? (
          <ActivityIndicator color={colors.rose1} style={st.loading} />
        ) : (
          <>
            <View style={st.fail}>
              <Text style={st.heroEmoji}>{fail.emoji}</Text>
              <Text style={st.failTitle}>{fail.title}</Text>
              <Text style={st.heroSub}>{fail.text}</Text>
            </View>
            <BigButton label="Explore Meto" onPress={() => navigation.goBack()} />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <HostHeader title="Host invite" top={insets.top} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={st.agency}>
          <LinearGradient colors={['#c9a6ff', '#4f2fb3']} style={st.agencyLogo}>
            <Text style={st.agencyStar}>⭐</Text>
          </LinearGradient>
          <View style={st.flex}>
            <Text style={st.agencyName}>{agency.name}</Text>
            <Text style={st.agencyCode}>Code {agency.code}</Text>
          </View>
          <Text style={st.verified}>✓ Verified</Text>
        </View>

        <LinearGradient colors={['rgba(255,95,143,0.28)', 'rgba(40,10,25,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
          <Text style={st.heroEmoji}>🎙️</Text>
          <Text style={st.heroTitle}>You're invited to be a Meto host</Text>
          <Text style={st.heroSub}>Get paid for every call minute, gift and message. Go online whenever you want and withdraw to UPI.</Text>
        </LinearGradient>

        <View style={st.earn}>
          {EARN.map(e => (
            <View key={e.big} style={st.earnItem}>
              <Text style={st.earnBig}>{e.big}</Text>
              <Text style={st.earnSmall}>{e.small}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Step n={1} title="3 photos + 30 sec live video" sub="Your own, real, clear face" />
          <Step n={2} title="Live selfie" sub="Must match your photos" />
          <Step n={3} title="Meto team review" sub="Usually within 24 hours" />
        </View>

        <View style={s.rules}>
          <Text style={s.rulesText}>
            <Text style={s.rulesBold}>Rules: </Text>
            women 18+ only · your own real photos · no nudity or sexual content · no asking for money or numbers outside Meto. Breaking rules = ban & earnings frozen.
          </Text>
        </View>

        <BigButton label="Apply now" onPress={() => navigation.replace('HostApply')} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={st.later}>
          <Text style={st.laterText}>Not now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  loading: { marginTop: 60 },
  flex: { flex: 1 },
  fail: { marginHorizontal: 16, marginTop: 40, padding: 20, borderRadius: 22, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  failTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  agency: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 10, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  agencyLogo: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  agencyStar: { fontSize: 19 },
  agencyName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  agencyCode: { color: colors.muted, fontSize: 11, marginTop: 1 },
  verified: { color: colors.online, fontSize: 11, fontWeight: '800' },
  later: { alignSelf: 'center', marginTop: 14, padding: 4 },
  laterText: { color: colors.muted, fontSize: 13.5 },
  hero: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.45)' },
  heroEmoji: { fontSize: 40 },
  heroTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  heroSub: { color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  earn: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  earnItem: { flex: 1, paddingVertical: 10, borderRadius: 16, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  earnBig: { color: colors.gold1, fontSize: 15, fontWeight: '800' },
  earnSmall: { color: colors.muted, fontSize: 10.5, marginTop: 2 },
});

import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

// Draft — app ke asli niyamon ke hisaab se. Play Store se pehle wakeel se jaanch karwani hai
const UPDATED = '13 Oct 2026';
const CONTACT = 'Me → Customer service → Chat with us';
const DOCS = {
  privacy: {
    title: 'Privacy policy',
    parts: [
      ['What we collect', 'Your phone number or email, profile details (name, gender, birthday, city, languages), photos and videos you upload, chats, who you call and for how long, gifts, purchases and device info needed for notifications.'],
      ['What we do not collect', 'We never record or store the video or audio of your calls.'],
      ['How we use it', 'To run Meto: show your profile, connect chats and calls, charge gems, pay host earnings, send notifications, and keep people safe (reports, blocks, fraud checks).'],
      ['Who can see what', 'Other users see your public profile, photos and online status. Private photos open only for people you have talked with. Hosts’ selfies, ID and payout details (UPI, PAN) are seen only by the Meto team.'],
      ['Services we use', 'Firebase (sign-in, notifications), Agora (live video calls) and Google Play (payments). They get only what they need to provide their service.'],
      ['How long we keep it', 'While your account is open. When you delete your account, your profile, photos and chats are removed. Payment and payout records are kept as long as the law requires.'],
      ['Your choices', 'Edit your profile anytime, turn notifications on or off in Settings, block or report anyone, and delete your account from Settings → Delete account.'],
      ['Contact', CONTACT],
    ],
  },
  terms: {
    title: 'Terms of service',
    parts: [
      ['Who can use Meto', 'You must be 18 or older. One account per person. Give true information about yourself.'],
      ['Gems', 'Gems are bought through Google Play and used for calls, gifts, paid messages and unlocking photos or videos. Gems have no cash value and cannot be transferred or exchanged for money.'],
      ['Calls', 'Video calls are charged per minute at the rate shown before you call or answer. Each minute is charged when it starts. If the host ends the call, unused time of the last minute comes back to you automatically. Match calls use the match rate shown on the Match screen.'],
      ['Messages and media', 'Your first messages with each host are free, then each message costs the gems shown in the chat. A host’s first photos and video are free; others unlock for the gems shown.'],
      ['VIP', 'VIP gives the benefits shown on the VIP page (like a call discount) for the time you bought.'],
      ['Refunds', 'Purchases follow Google Play’s refund rules. If you were charged wrongly, chat with us and we will check and return gems when it was our mistake.'],
      ['Behaviour', 'No nudity, sexual content, harassment, hate, scams, or asking for money, numbers or other apps. Do not record or share others’ calls or photos.'],
      ['Bans', 'We can warn, limit or ban accounts that break these rules. Gems in a banned account may be lost.'],
      ['Changes', 'We may update these terms. We will show the new date here, and big changes inside the app.'],
      ['Contact', CONTACT],
    ],
  },
  host: {
    title: 'Host rules',
    parts: [
      ['Who can be a host', 'Women 18+ only, invited by an approved agency, using their own real photos and videos. Your selfie must match your photos.'],
      ['On calls', 'Be respectful. No nudity or sexual content, no recording users, no rude or abusive talk. Users can report you; you can report or block them too.'],
      ['Money', 'Never ask users for money, phone numbers, UPI or other apps. All earnings are paid only through Meto withdrawals.'],
      ['Your rate', 'You choose your call rate (up to the limit shown). Users see it before they call. Match calls use the fixed match rate.'],
      ['Earnings', 'If the user ends a call you earn every started minute. If you end it, only full minutes count and the rest goes back to the user. You also earn from gifts, paid messages and unlocked photos or videos. Earnings are in gems; when you withdraw they change to beans and are paid to your UPI.'],
      ['Withdrawals', 'Minimum ₹500 to your own UPI, with your PAN. TDS (now 1%) is deducted as per law. Payouts usually reach within 48 hours.'],
      ['Breaking rules', 'Can lead to a warning, a ban and frozen earnings.'],
      ['Contact', CONTACT],
    ],
  },
} as const;

export default function LegalScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const doc = DOCS[route.params.kind];
  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>{doc.title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 30 }}>
        <Text style={st.updated}>Last updated {UPDATED}</Text>
        {doc.parts.map(([h, p]) => (
          <View key={h} style={{ marginTop: 14 }}>
            <Text style={st.h}>{h}</Text>
            <Text style={st.p}>{p}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  updated: { color: colors.fine, fontSize: 11.5, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  h: { color: colors.text, fontSize: 15, fontWeight: '800' },
  p: { color: colors.muted, fontSize: 13.5, lineHeight: 21, marginTop: 4 },
});

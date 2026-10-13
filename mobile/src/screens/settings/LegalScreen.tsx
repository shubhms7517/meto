import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

// ⚠️ Saadi likhai — asli text owner / lawyer dega (Play Store se pehle)
const DOCS = {
  privacy: {
    title: 'Privacy policy',
    parts: [
      ['What we collect', 'Phone number or email, profile details, photos and videos you upload, chats, and call records (we do not record call video).'],
      ['How we use it', 'To run Meto: show your profile, connect calls, process payments and payouts, and keep users safe.'],
      ['Hosts', 'Selfies, ID and payout details (UPI, PAN) are seen only by the Meto team.'],
      ['Your choices', 'You can edit your profile or delete your account anytime from Settings → Delete account.'],
      ['Contact', 'support@meto.app'],
    ],
  },
  terms: {
    title: 'Terms of service',
    parts: [
      ['Who can use Meto', 'You must be 18 or older.'],
      ['Gems', 'Gems are used for calls, gifts, messages and unlocking media. Gems are not refundable and have no cash value.'],
      ['Calls', 'Video calls are charged per minute at the rate shown before you call or answer.'],
      ['Behaviour', 'No nudity, sexual content, harassment, or asking for money outside Meto. Breaking rules can lead to a ban.'],
      ['Contact', 'support@meto.app'],
    ],
  },
  host: {
    title: 'Host rules',
    parts: [
      ['Who can be a host', 'Women 18+ only, using their own real photos and videos.'],
      ['On calls', 'No nudity or sexual content. Be respectful — users can report you.'],
      ['Money', 'Never ask users for money, phone numbers or other apps. Earnings are paid only through Meto withdrawals.'],
      ['Earnings', 'If the user ends a call you earn every started minute. If you end it, only full minutes count and the rest goes back to the user. 100 points = ₹1. Minimum withdrawal ₹500.'],
      ['Breaking rules', 'Can lead to a ban and frozen earnings.'],
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  h: { color: colors.text, fontSize: 15, fontWeight: '800' },
  p: { color: colors.muted, fontSize: 13.5, lineHeight: 21, marginTop: 4 },
});

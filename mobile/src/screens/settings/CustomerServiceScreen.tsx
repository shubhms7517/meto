import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerService'>;

// Abhi sirf dikhane ke liye: aam sawaal + "Chat with us" (support chat baad me)
const FAQ = [
  { q: 'How do I earn as a host?', a: 'You earn points for every call minute, gifts and paid messages. If the user ends the call you get every started minute; if you end it, only full minutes count. 100 points = ₹1.' },
  { q: 'When can I withdraw?', a: 'Once you have at least ₹500, you can withdraw to your UPI. Payouts usually reach within 48 hours.' },
  { q: 'Why did a call not earn?', a: 'Calls shorter than 1 minute do not earn points.' },
  { q: 'Someone is rude to me. What do I do?', a: 'Tap the 🛡️ shield during the call or the ⋯ menu in chat to report or block them. Blocking ends the call at once.' },
  { q: 'How do I change my photos?', a: 'Go to Me → Edit profile & photos. Your intro video can be changed from Me too.' },
];

export default function CustomerServiceScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>Customer service</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <LinearGradient colors={['rgba(255,95,143,0.22)', 'rgba(40,10,25,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
          <Text style={{ fontSize: 34 }}>🎧</Text>
          <Text style={st.heroTitle}>How can we help?</Text>
          <Text style={st.heroSub}>Our team usually replies within a few hours</Text>
        </LinearGradient>

        <Text style={st.sec}>Common questions</Text>
        <View style={st.card}>
          {FAQ.map((f, i) => (
            <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)} style={[st.row, i > 0 && st.line]}>
              <View style={st.qRow}>
                <Text style={st.q}>{f.q}</Text>
                <Text style={st.chev}>{open === i ? '−' : '+'}</Text>
              </View>
              {open === i && <Text style={st.a}>{f.a}</Text>}
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => Alert.alert('Customer service', 'Live chat with our team is coming soon.')}>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
            <Icon name="chat" size={18} color="#fff" />
            <Text style={st.btnText}>Chat with us</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  hero: { marginHorizontal: 16, padding: 18, borderRadius: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.4)' },
  heroTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 4 },
  heroSub: { color: colors.muted, fontSize: 12.5, marginTop: 4 },
  sec: { color: colors.muted, fontSize: 12.5, marginHorizontal: 18, marginTop: 18, marginBottom: 8 },
  card: { marginHorizontal: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { paddingHorizontal: 14, paddingVertical: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  q: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  chev: { color: colors.rose1, fontSize: 18, fontWeight: '700' },
  a: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  btn: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 18, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { deleteMyAccount } from '../../services/users';
import { signOut } from '../../services/auth';
import { useWallet } from '../../context/WalletContext';

type Props = NativeStackScreenProps<RootStackParamList, 'DeleteAccount'>;

// Account hamesha ke liye delete — "DELETE" likh kar pakka (Google Play ka niyam)
export default function DeleteAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { amHost } = useWallet();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = text.trim() === 'DELETE';

  const del = () =>
    Alert.alert('Delete account?', 'This is permanent and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteMyAccount();
            await signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
          } catch (e) {
            setBusy(false);
            Alert.alert('Delete account', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>Delete account</Text>
      </View>

      <View style={st.warn}>
        <Text style={st.warnText}>
          <Text style={st.b}>This can't be undone.</Text> Deleting your account will permanently remove:
        </Text>
        {['your profile, photos and videos', 'chats and call history', 'gems balance & VIP (no refund)', ...(amHost ? ['unpaid earnings — withdraw first'] : [])].map(t => (
          <Text key={t} style={st.li}>
            • {t}
          </Text>
        ))}
      </View>

      <Text style={st.lbl}>
        Type <Text style={{ color: colors.text, fontWeight: '800' }}>DELETE</Text> to confirm
      </Text>
      <TextInput value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor={colors.placeholder} style={st.input} />

      <Pressable onPress={del} disabled={!ok || busy} style={!ok && { opacity: 0.4 }}>
        <LinearGradient colors={['#ff5f7a', '#c0153f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Delete my account forever</Text>}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  warn: { marginHorizontal: 16, marginTop: 6, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,59,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,59,92,0.35)' },
  warnText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  b: { color: '#ff8a9e', fontWeight: '800' },
  li: { color: colors.muted, fontSize: 13, lineHeight: 20, marginLeft: 6, marginTop: 2 },
  lbl: { color: colors.muted, fontSize: 12.5, marginHorizontal: 18, marginTop: 18, marginBottom: 7 },
  input: { marginHorizontal: 16, height: 48, borderRadius: 14, paddingHorizontal: 14, color: colors.text, fontSize: 15, letterSpacing: 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,59,92,0.5)' },
  btn: { marginHorizontal: 16, marginTop: 16, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

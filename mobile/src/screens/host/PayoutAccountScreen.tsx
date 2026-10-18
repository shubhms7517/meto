import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getWithdrawInfo, savePayoutAccount } from '../../services/host';
import { HostHeader } from './common';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'PayoutAccount'>;

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Payout details: UPI + PAN (ek baar). Paisa sirf apne naam ke UPI pe
export default function PayoutAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [pan, setPan] = useState('');
  const [panName, setPanName] = useState('');
  const [hasPan, setHasPan] = useState(false); // pehle se saved — PAN dobara daalna padega (hum poora PAN nahi dikhate)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWithdrawInfo()
      .then(i => {
        if (!i.account) return;
        setUpiId(i.account.upiId);
        setUpiName(i.account.upiName);
        setPanName(i.account.panName);
        setHasPan(true);
      })
      .catch(() => {});
  }, []);

  const upiOk = UPI_RE.test(upiId.trim());
  const panOk = PAN_RE.test(pan.trim().toUpperCase());
  const ready = upiOk && panOk && upiName.trim().length >= 2 && panName.trim().length >= 2;

  const save = async () => {
    setSaving(true);
    try {
      await savePayoutAccount({ upiId: upiId.trim(), upiName: upiName.trim(), pan: pan.trim().toUpperCase(), panName: panName.trim() });
      navigation.goBack();
    } catch (e) {
      appAlert('Payout details', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <HostHeader title="Payout details" top={insets.top} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
          <View style={st.info}>
            <Text style={st.infoText}>
              Add these <Text style={st.b}>once</Text>. Money is sent only to a UPI in <Text style={st.b}>your own name</Text>. PAN is needed by law for payouts (TDS).
            </Text>
          </View>

          <Field label="UPI ID" value={upiId} onChange={setUpiId} placeholder="name@okaxis" ok={upiOk} autoCapitalize="none" />
          <Field label="Name (as in bank / UPI)" value={upiName} onChange={setUpiName} placeholder="Your full name" />
          <Field
            label={hasPan ? 'PAN number (enter again to change)' : 'PAN number'}
            value={pan}
            onChange={t => setPan(t.toUpperCase())}
            placeholder="ABCDE1234F"
            ok={panOk}
            autoCapitalize="characters"
            maxLength={10}
          />
          <Field label="Name on PAN" value={panName} onChange={setPanName} placeholder="As printed on PAN" />

          <Pressable onPress={save} disabled={!ready || saving} style={!ready && { opacity: 0.45 }}>
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Save &amp; continue</Text>}
            </LinearGradient>
          </Pressable>
          <Text style={st.small}>🔒 Only the Meto payouts team can see these details</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(p: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  ok?: boolean;
  autoCapitalize?: 'none' | 'characters' | 'words';
  maxLength?: number;
}) {
  return (
    <View style={st.fld}>
      <Text style={st.lbl}>{p.label}</Text>
      <View style={[st.input, p.ok && st.inputOk]}>
        <TextInput
          value={p.value}
          onChangeText={p.onChange}
          placeholder={p.placeholder}
          placeholderTextColor={colors.placeholder}
          autoCapitalize={p.autoCapitalize ?? 'words'}
          autoCorrect={false}
          maxLength={p.maxLength ?? 120}
          style={st.text}
        />
        {p.ok && <Text style={st.ok}>✓ Valid</Text>}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  info: { marginHorizontal: 16, marginTop: 4, marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(246,220,155,0.06)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.22)' },
  infoText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  b: { color: colors.gold1, fontWeight: '800' },
  fld: { marginHorizontal: 16, marginBottom: 12 },
  lbl: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  input: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  inputOk: { borderColor: 'rgba(62,224,143,0.5)' },
  text: { flex: 1, color: colors.text, fontSize: 14.5 },
  ok: { color: colors.online, fontSize: 11.5, fontWeight: '800' },
  btn: { marginHorizontal: 16, marginTop: 8, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  small: { color: colors.fine, fontSize: 11, textAlign: 'center', marginTop: 10 },
});

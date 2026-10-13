import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../../components/Screen';
import AuthHeader from '../../components/AuthHeader';
import Button from '../../components/Button';
import Glow from '../../components/Glow';
import Icon from '../../components/Icon';
import { colors, radius, type } from '../../theme';
import { sendOtp } from '../../services/auth';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Phone'>;

const { width } = Dimensions.get('window');

// "9876543210" → "98765 43210"
const formatPhone = (digits: string) =>
  digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;

export default function PhoneScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const valid = phone.length === 10;

  const onSend = async () => {
    setError('');
    setLoading(true);
    try {
      await sendOtp(phone);
      navigation.navigate('Otp', { phone });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      background={<Glow color={colors.rose2} size={width * 0.9} opacity={0.35} style={{ top: -width * 0.3, right: -width * 0.3 }} />}>
      <AuthHeader step={1} onBack={() => navigation.goBack()} />

      <Text style={type.title}>What's your{'\n'}phone number?</Text>
      <Text style={[type.sub, styles.sub]}>We'll send you a 6-digit code to verify it's really you.</Text>

      <Text style={[type.label, styles.label]}>Mobile number</Text>
      <View style={[styles.field, focused && styles.fieldFocus, !!error && styles.fieldError]}>
        <View style={styles.cc}>
          <Text style={styles.ccText}>🇮🇳 +91</Text>
          <Icon name="chevronDown" size={14} color={colors.muted} />
        </View>
        <TextInput
          value={formatPhone(phone)}
          onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          placeholder="Enter number"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.rose1}
          cursorColor={colors.rose1}
          autoFocus
          maxLength={11}
          style={styles.input}
        />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.note}>
        <Icon name="lock" size={16} color={colors.gold2} />
        <Text style={styles.noteText}>Your number is never shown on your profile.</Text>
      </View>

      <View style={styles.bottom}>
        <Button title="Send Code" disabled={!valid} loading={loading} onPress={onSend} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: 8 },
  label: { marginTop: 32, marginBottom: 8, marginLeft: 4 },
  field: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fieldFocus: { borderColor: colors.roseFocus },
  fieldError: { borderColor: '#ff6b6b' },
  cc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  ccText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  input: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500', letterSpacing: 1, padding: 0 },
  error: { color: '#ff8a8a', fontSize: 12, marginTop: 8, marginLeft: 4 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  noteText: { color: colors.muted, fontSize: 12, flex: 1 },
  bottom: { marginTop: 'auto' },
});

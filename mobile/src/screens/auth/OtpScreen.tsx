import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../../components/Screen';
import AuthHeader from '../../components/AuthHeader';
import Button from '../../components/Button';
import Glow from '../../components/Glow';
import { colors, radius, type } from '../../theme';
import { sendOtp, verifyOtp } from '../../services/auth';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

const LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions(); // har render pe asli chaudai (lock / rotate ke baad bhi sahi)
  const { phone } = route.params;
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (seconds === 0) return;
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const verify = async (value: string) => {
    setError('');
    setLoading(true);
    try {
      const { needsProfile } = await verifyOtp(value);
      navigation.reset({ index: 0, routes: [{ name: needsProfile ? 'ProfileSetup' : 'Main' }] });
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (digits.length === LENGTH) verify(digits);
  };

  const resend = async () => {
    setSeconds(RESEND_SECONDS);
    setCode('');
    setError('');
    try {
      await sendOtp(phone);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen
      background={<Glow color={colors.gold2} size={width * 0.9} opacity={0.2} style={{ top: -width * 0.25, left: -width * 0.35 }} />}>
      <AuthHeader step={2} onBack={() => navigation.goBack()} />

      <Text style={type.title}>Enter the code</Text>
      <Text style={[type.sub, styles.sub]}>
        Sent to <Text style={styles.bold}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text> ·{' '}
        <Text style={styles.edit} onPress={() => navigation.goBack()}>
          Edit
        </Text>
      </Text>

      <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const filled = i < code.length;
          const active = i === code.length;
          return (
            <View key={i} style={[styles.box, filled && styles.boxFilled, active && styles.boxActive]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>

      {/* Asli input chhupa hua hai, boxes sirf dikhane ke liye */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        autoFocus
        style={styles.hidden}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={[type.sub, styles.resend]}>
        {seconds > 0 ? (
          <>
            Didn't get it? Resend in <Text style={styles.timer}>00:{String(seconds).padStart(2, '0')}</Text>
          </>
        ) : (
          <>
            Didn't get it?{' '}
            <Text style={styles.edit} onPress={resend}>
              Resend code
            </Text>
          </>
        )}
      </Text>

      <View style={styles.bottom}>
        <Button title="Verify" disabled={code.length !== LENGTH} loading={loading} onPress={() => verify(code)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: 8 },
  bold: { color: colors.text, fontWeight: '600' },
  edit: { color: colors.rose1, fontWeight: '600' },
  boxes: { flexDirection: 'row', gap: 9, marginTop: 30 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: 'rgba(212,166,75,0.45)' },
  boxActive: { borderColor: 'rgba(255,95,143,0.7)', borderWidth: 1.5 },
  digit: { color: colors.text, fontSize: 22, fontWeight: '600' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  error: { color: '#ff8a8a', fontSize: 12, marginTop: 12, textAlign: 'center' },
  resend: { textAlign: 'center', marginTop: 26 },
  timer: { color: colors.gold1, fontWeight: '600' },
  bottom: { marginTop: 'auto' },
});

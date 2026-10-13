import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../../components/Screen';
import AuthHeader from '../../components/AuthHeader';
import Button from '../../components/Button';
import Glow from '../../components/Glow';
import Icon, { IconName } from '../../components/Icon';
import { colors, gradients, radius, type } from '../../theme';
import { Gender, saveProfile, signOut } from '../../services/auth';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileSetup'>;

const { width } = Dimensions.get('window');
const MIN_AGE = 18;

const GENDERS: { value: Gender; label: string; icon?: IconName }[] = [
  { value: 'male', label: 'Male', icon: 'male' },
  { value: 'female', label: 'Female', icon: 'female' },
  { value: 'other', label: 'Other' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

function ageOf(d: Date) {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const maxBirthday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d;
};

export default function ProfileSetupScreen({ navigation }: Props) {
  const [avatar, setAvatar] = useState<string>();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>();
  const [birthday, setBirthday] = useState<Date>();
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim().length >= 2 && !!gender && !!birthday && agreed;

  const pickAvatar = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
    const uri = res.assets?.[0]?.uri;
    if (uri) setAvatar(uri);
  };

  const pickBirthday = () => {
    const value = birthday ?? new Date(2000, 0, 1);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        maximumDate: maxBirthday(),
        onChange: (e, d) => e.type === 'set' && d && setBirthday(d),
      });
    } else {
      setShowIosPicker(true);
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await saveProfile({ name: name.trim(), gender: gender!, birthday: birthday!, avatarUri: avatar });
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      background={<Glow color={colors.rose2} size={width} opacity={0.3} style={{ top: -width * 0.4, left: width * 0.05 }} />}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Profile adhoori chhod ke peeche jaane ka matlab logout */}
        <AuthHeader
          step={3}
          onBack={async () => {
            await signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
          }}
        />
        <Text style={[type.title, styles.title]}>Create your profile</Text>

        <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
          <LinearGradient
            colors={[colors.gold1, colors.rose1, colors.rose2, colors.gold2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ring}>
            <View style={styles.avatarInner}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImg} />
              ) : (
                <Icon name="person" size={40} color="#5e4652" />
              )}
            </View>
          </LinearGradient>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
            <Icon name="plus" size={16} color="#fff" strokeWidth={3} />
          </LinearGradient>
        </Pressable>

        <Text style={[type.label, styles.label]}>Name</Text>
        <View style={[styles.field, nameFocused && styles.fieldFocus]}>
          <TextInput
            value={name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.rose1}
            cursorColor={colors.rose1}
            maxLength={24}
            style={styles.input}
          />
        </View>

        <Text style={[type.label, styles.label]}>Gender</Text>
        <View style={styles.chips}>
          {GENDERS.map(g => {
            const on = gender === g.value;
            const inner = (
              <>
                {g.icon && <Icon name={g.icon} size={16} color={on ? colors.text : colors.muted} />}
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
              </>
            );
            return (
              <Pressable key={g.value} onPress={() => setGender(g.value)} style={styles.chipWrap}>
                {on ? (
                  <LinearGradient
                    colors={['rgba(255,95,143,0.16)', 'rgba(216,27,92,0.06)']}
                    style={[styles.chip, styles.chipOn]}>
                    {inner}
                  </LinearGradient>
                ) : (
                  <View style={styles.chip}>{inner}</View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.label, styles.label]}>Birthday</Text>
        <Pressable onPress={pickBirthday} style={styles.field}>
          <Icon name="calendar" size={18} color={colors.muted} />
          <Text style={[styles.input, styles.dateText, !birthday && { color: colors.placeholder }]}>
            {birthday ? formatDate(birthday) : 'Select date'}
          </Text>
          {birthday && <Text style={styles.age}>{ageOf(birthday)} yrs</Text>}
        </Pressable>
        {showIosPicker && (
          <DateTimePicker
            value={birthday ?? new Date(2000, 0, 1)}
            mode="date"
            display="spinner"
            maximumDate={maxBirthday()}
            themeVariant="dark"
            onChange={(_, d) => d && setBirthday(d)}
          />
        )}

        <Pressable onPress={() => setAgreed(a => !a)} style={styles.check}>
          {agreed ? (
            <LinearGradient colors={gradients.gold} style={styles.box}>
              <Icon name="check" size={12} color={colors.goldText} strokeWidth={3.5} />
            </LinearGradient>
          ) : (
            <View style={[styles.box, styles.boxOff]} />
          )}
          <Text style={styles.checkText}>I confirm I am 18 or older and agree to the Community Guidelines.</Text>
        </Pressable>

        <View style={styles.bottom}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button variant="gold" title="Start Exploring" disabled={!canSubmit} loading={loading} onPress={onSubmit} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  title: { fontSize: 23, marginTop: -12 },
  avatarWrap: { alignSelf: 'center', marginTop: 18, marginBottom: 10 },
  ring: { width: 108, height: 108, borderRadius: 54, padding: 3 },
  avatarInner: {
    flex: 1,
    borderRadius: 54,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  plus: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: 14, marginBottom: 8, marginLeft: 4 },
  field: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldFocus: { borderColor: colors.roseFocus },
  input: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500', padding: 0 },
  dateText: { flex: 1 },
  age: { color: colors.gold1, fontSize: 12 },
  chips: { flexDirection: 'row', gap: 10 },
  chipWrap: { flex: 1 },
  chip: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chipOn: { borderColor: 'rgba(255,95,143,0.55)' },
  chipText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: colors.text },
  check: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'flex-start' },
  box: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOff: { borderWidth: 1.5, borderColor: colors.muted },
  checkText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  bottom: { marginTop: 'auto', paddingTop: 24 },
  error: { color: '#ff8a8a', fontSize: 12, textAlign: 'center', marginBottom: 10 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { deletePhoto, getMyProfile, LANGUAGES, type Me, type MyPhoto, updateProfile, uploadAvatar, uploadPhoto } from '../../services/users';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

const MAX_PHOTOS = 9;
const MAX_LANGS = 5;

// Edit profile: photo, naam, bio, shehar, bhashayein, photos. Gender / umar lock (badal nahi sakte)
export default function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [langs, setLangs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'avatar' | 'photo' | null>(null);

  const load = async () => {
    const m = await getMyProfile();
    setMe(m);
    return m;
  };

  useEffect(() => {
    load()
      .then(m => {
        setName(m.name ?? '');
        setBio(m.bio ?? '');
        setCity(m.city ?? '');
        setLangs(m.languages ?? []);
      })
      .catch(e => Alert.alert('Profile', (e as Error).message));
  }, []);

  const pick = async () => (await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 })).assets?.[0]?.uri;

  const changeAvatar = async () => {
    const uri = await pick();
    if (!uri) return;
    setBusy('avatar');
    try {
      await uploadAvatar(uri);
      await load();
    } catch (e) {
      Alert.alert('Photo', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = async () => {
    const uri = await pick();
    if (!uri) return;
    setBusy('photo');
    try {
      await uploadPhoto(uri, false);
      await load();
    } catch (e) {
      Alert.alert('Photo', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = (p: MyPhoto) =>
    Alert.alert('Delete photo?', 'This photo will be removed from your profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePhoto(p.id).then(load).catch(e => Alert.alert('Photo', (e as Error).message)) },
    ]);

  const toggleLang = (l: string) =>
    setLangs(x => (x.includes(l) ? x.filter(y => y !== l) : x.length >= MAX_LANGS ? x : [...x, l]));

  const save = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Name', 'Name must be at least 2 characters');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), bio: bio.trim(), city: city.trim(), languages: langs });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>Edit profile</Text>
        <Pressable onPress={save} disabled={saving || !me} hitSlop={8}>
          {saving ? <ActivityIndicator color={colors.rose1} /> : <Text style={st.save}>Save</Text>}
        </Pressable>
      </View>

      {!me ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
            <Pressable onPress={changeAvatar} style={st.avatarWrap}>
              <LinearGradient colors={[colors.gold1, colors.rose1, colors.gold2]} style={st.ring}>
                <Avatar uri={me.avatarUrl} seed={me.id} style={st.avatar} iconScale={0.85} />
              </LinearGradient>
              <View style={st.camBadge}>{busy === 'avatar' ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="edit" size={13} color="#fff" strokeWidth={2.5} />}</View>
              <Text style={st.change}>Change photo</Text>
            </Pressable>

            <Text style={st.lbl}>Name</Text>
            <TextInput value={name} onChangeText={setName} maxLength={24} style={st.input} placeholderTextColor={colors.placeholder} placeholder="Your name" />

            <Text style={st.lbl}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={300}
              multiline
              style={[st.input, st.bio]}
              placeholderTextColor={colors.placeholder}
              placeholder="A few words about you"
            />
            <Text style={st.count}>{bio.length}/300</Text>

            <Text style={st.lbl}>City</Text>
            <TextInput value={city} onChangeText={setCity} maxLength={60} style={st.input} placeholderTextColor={colors.placeholder} placeholder="Your city" />

            <Text style={st.lbl}>
              Languages · {langs.length}/{MAX_LANGS}
            </Text>
            <View style={st.langs}>
              {LANGUAGES.map(l => {
                const on = langs.includes(l);
                return (
                  <Pressable key={l} onPress={() => toggleLang(l)}>
                    {on ? (
                      <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.lang}>
                        <Text style={[st.langText, { color: '#fff' }]}>{l}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[st.lang, st.langOff]}>
                        <Text style={st.langText}>{l}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={st.lbl}>Photos · hold to delete</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.photos}>
              {me.photos.length < MAX_PHOTOS && (
                <Pressable onPress={addPhoto} disabled={!!busy} style={[st.photo, st.add]}>
                  {busy === 'photo' ? <ActivityIndicator color={colors.rose1} /> : <Icon name="plus" size={22} color={colors.rose1} strokeWidth={2.6} />}
                </Pressable>
              )}
              {me.photos.map(p => (
                <Pressable key={p.id} onLongPress={() => removePhoto(p)} style={st.photo}>
                  <Image source={{ uri: p.url }} style={st.fill} />
                </Pressable>
              ))}
            </ScrollView>

            <View style={st.locked}>
              <Icon name="lock" size={14} color={colors.muted} />
              <Text style={st.lockedText}>
                Gender and date of birth can't be changed{me.age ? ` · ${me.age} yrs` : ''}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '700' },
  save: { color: colors.rose1, fontSize: 15, fontWeight: '800' },
  avatarWrap: { alignItems: 'center', marginTop: 6 },
  ring: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  camBadge: { position: 'absolute', top: 76, right: '36%', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose2, borderWidth: 2, borderColor: colors.bg },
  change: { color: colors.rose1, fontSize: 13, fontWeight: '700', marginTop: 8 },
  lbl: { color: colors.muted, fontSize: 12, marginHorizontal: 18, marginTop: 16, marginBottom: 6 },
  input: { marginHorizontal: 16, minHeight: 46, borderRadius: 14, paddingHorizontal: 14, color: colors.text, fontSize: 14.5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bio: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  count: { color: colors.fine, fontSize: 11, textAlign: 'right', marginHorizontal: 18, marginTop: 4 },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16 },
  lang: { paddingHorizontal: 13, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  langOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  langText: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
  photos: { paddingHorizontal: 16, gap: 8 },
  photo: { width: 84, height: 108, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  fill: { width: '100%', height: '100%' },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,95,143,0.5)' },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, marginTop: 20 },
  lockedText: { color: colors.muted, fontSize: 12 },
});

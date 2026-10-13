import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Keyboard, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Icon, { IconName } from '../../components/Icon';
import { colors } from '../../theme';
import { postStatus } from '../../services/status';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddStatus'>;
type Who = 'everyone' | 'followers';

const WHO: { key: Who; label: string; icon: IconName }[] = [
  { key: 'everyone', label: 'Everyone', icon: 'globe' },
  { key: 'followers', label: 'Followers only', icon: 'user' },
];

export default function AddStatusScreen({ navigation, route }: Props) {
  const { uri } = route.params;
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [who, setWho] = useState<Who>('everyone');
  const [loading, setLoading] = useState(false);
  const [kb, setKb] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e =>
      setKb(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const share = async () => {
    setLoading(true);
    try {
      await postStatus(uri, caption.trim(), who);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not share', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent', 'transparent', 'rgba(18,7,13,0.95)']} locations={[0, 0.2, 0.55, 0.85]} style={StyleSheet.absoluteFill} />

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.glass} hitSlop={8}>
          <Icon name="plus" size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title}>New status</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.compose, { paddingBottom: kb ? kb + 12 : insets.bottom + 18 }]}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption…"
          placeholderTextColor="rgba(255,255,255,0.6)"
          selectionColor={colors.rose1}
          cursorColor={colors.rose1}
          maxLength={200}
          style={styles.input}
        />
        <View style={styles.who}>
          {WHO.map(w => (
            <Pressable key={w.key} onPress={() => setWho(w.key)} style={[styles.whoItem, who === w.key && styles.whoOn]}>
              <Icon name={w.icon} size={15} color={who === w.key ? colors.text : colors.muted} />
              <Text style={[styles.whoText, who === w.key && { color: colors.text }]}>{w.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Share status" icon={<Icon name="send" size={18} color="#fff" />} loading={loading} onPress={share} style={{ marginTop: 12 }} />
        <Text style={styles.rules}>Disappears after 24 hours · Follow the community guidelines</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // "+" ko 45° ghuma ke "×"
  glass: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', transform: [{ rotate: '45deg' }] },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' },
  compose: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  input: { height: 50, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 14, paddingHorizontal: 16 },
  who: { flexDirection: 'row', gap: 8, marginTop: 12 },
  whoItem: { flex: 1, height: 42, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  whoOn: { borderColor: 'rgba(255,95,143,0.6)', backgroundColor: 'rgba(255,95,143,0.14)' },
  whoText: { color: colors.muted, fontSize: 12.5, fontWeight: '500' },
  rules: { color: colors.fine, fontSize: 10.5, textAlign: 'center', marginTop: 10 },
});

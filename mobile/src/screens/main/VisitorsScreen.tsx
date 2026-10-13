import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getVisitors, timeAgo, type Visitor } from '../../services/users';
import { useCall } from '../../context/CallContext';
import { useWallet } from '../../context/WalletContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Visitors'>;

const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// Kisne meri profile dekhi — din ke hisaab se, chat / call ke button
export default function VisitorsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { placeCall } = useCall();
  const { amHost, rateFor } = useWallet();
  const [items, setItems] = useState<Visitor[] | null>(null);

  useEffect(() => {
    getVisitors()
      .then(r => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  const sections = (items ?? []).reduce<{ title: string; key: string; data: Visitor[] }[]>((acc, v) => {
    const k = dayKey(v.lastAt);
    const last = acc[acc.length - 1];
    if (last && last.key === k) last.data.push(v);
    else acc.push({ title: dayLabel(v.lastAt), key: k, data: [v] });
    return acc;
  }, []);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>Visitors</Text>
      </View>
      {!items ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 50 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={v => String(v.user.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <Text style={st.total}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{items.length}</Text> {items.length === 1 ? 'person' : 'people'} viewed your profile
            </Text>
          }
          renderSectionHeader={({ section }) => <Text style={st.day}>{section.title}</Text>}
          renderItem={({ item: v }) => {
            // Call sirf user ↔ host
            const canCall = !!v.user.isHost !== amHost;
            return (
              <Pressable onPress={() => navigation.navigate('Profile', { id: v.user.id, name: v.user.name })} style={st.row}>
                <View>
                  <Avatar uri={v.user.avatarUrl} seed={v.user.id} style={st.av} iconScale={0.9} />
                  {v.user.online && <View style={st.online} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {v.user.name}, {v.user.age}
                    {v.isNew && <Text style={{ color: colors.rose1 }}> ●</Text>}
                  </Text>
                  <Text style={st.sub}>
                    Viewed {timeAgo(v.lastAt)} ago{v.count > 1 ? ` · ${v.count} times` : ''}
                    {v.user.isHost && !amHost && !!v.user.rate && <Text style={st.rate}> · 💎 {rateFor(v.user.rate).toLocaleString('en-IN')}/min</Text>}
                  </Text>
                </View>
                <Pressable onPress={() => navigation.navigate('Chat', { id: v.user.id, name: v.user.name })} hitSlop={6} style={st.chatBtn}>
                  <Icon name="chat" size={17} />
                </Pressable>
                {canCall && (
                  <Pressable onPress={() => placeCall(v.user)} hitSlop={6}>
                    <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.callBtn}>
                      <Icon name="videoFill" size={18} color="#fff" />
                    </LinearGradient>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={st.empty}>No visitors yet. Add photos to get noticed!</Text>}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  total: { color: colors.muted, fontSize: 12.5, marginHorizontal: 18, marginTop: 4 },
  day: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginHorizontal: 18, marginTop: 14, marginBottom: 2, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  av: { width: 46, height: 46, borderRadius: 23 },
  online: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.bg },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  rate: { color: colors.gold1, fontWeight: '700' },
  chatBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  callBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.fine, textAlign: 'center', marginTop: 40, fontSize: 13 },
});

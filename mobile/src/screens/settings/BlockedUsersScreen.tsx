import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import { BlockedUser, getBlocked, timeAgo, unblockUser } from '../../services/users';
import { useChat } from '../../context/ChatContext';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { refresh } = useChat();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => getBlocked().then(r => setUsers(r.users)).catch(() => setUsers([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const unblock = (u: BlockedUser) =>
    Alert.alert(`Unblock ${u.name ?? 'user'}?`, 'They will be able to see your profile and message you again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusy(u.id);
          try {
            await unblockUser(u.id);
            setUsers(list => list?.filter(x => x.id !== u.id) ?? list);
            refresh();
          } catch (e) {
            Alert.alert('Could not unblock', (e as Error).message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={styles.title}>Blocked users</Text>
      </View>

      {!users ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 20 }}
          ListHeaderComponent={
            users.length ? <Text style={styles.hint}>Blocked people can’t see your profile or message you. They aren’t notified.</Text> : undefined
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Avatar uri={item.avatarUrl} seed={item.id} style={styles.av} iconScale={0.9} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name ?? 'User'}</Text>
                <Text style={styles.sub}>Blocked {timeAgo(item.blockedAt)} ago</Text>
              </View>
              <Pressable onPress={() => unblock(item)} disabled={busy === item.id} style={styles.btn}>
                {busy === item.id ? <ActivityIndicator color={colors.rose1} size="small" /> : <Text style={styles.btnText}>Unblock</Text>}
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIc}>
                <Icon name="lock" size={26} color={colors.rose1} />
              </View>
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptyText}>You can block anyone from their profile or chat using the ⋯ menu.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.fine, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  av: { width: 48, height: 48, borderRadius: 24 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.fine, fontSize: 11.5, marginTop: 2 },
  btn: { height: 36, minWidth: 90, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.5)', backgroundColor: 'rgba(255,95,143,0.1)' },
  btnText: { color: colors.rose1, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIc: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,143,0.12)', marginBottom: 14 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});

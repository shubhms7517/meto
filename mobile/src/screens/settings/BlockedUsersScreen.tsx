import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import { BlockedUser, getBlocked, timeAgo, unblockUser } from '../../services/users';
import { useChat } from '../../context/ChatContext';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, ErrorState, refreshControl, SkeletonList } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { refresh } = useChat();
  const L = useLoad(() => getBlocked().then(r => r.users));
  const users = L.data;
  const setUsers = L.setData;
  const [busy, setBusy] = useState<number | null>(null);


  const unblock = (u: BlockedUser) =>
    appAlert(`Unblock ${u.name ?? 'user'}?`, 'They will be able to see your profile and message you again.', [
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
            appAlert('Could not unblock', (e as Error).message);
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

      {L.failed ? (
        <ErrorState onRetry={L.retry} />
      ) : !users ? (
        <SkeletonList rows={4} />
      ) : (
        <FlatList
          data={users}
          refreshControl={refreshControl(L.refreshing, L.refresh)}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 20 }}
          ListHeaderComponent={
            users.length ? <Text style={styles.hint}>Blocked people can’t see your profile or message you. They aren’t notified.</Text> : undefined
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Avatar uri={item.avatarUrl} seed={item.id} style={styles.av} iconScale={0.9} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name ?? 'User'}
                </Text>
                <Text style={styles.sub}>Blocked {timeAgo(item.blockedAt)} ago</Text>
              </View>
              <Pressable onPress={() => unblock(item)} disabled={busy === item.id} style={styles.btn}>
                {busy === item.id ? <ActivityIndicator color={colors.rose1} size="small" /> : <Text style={styles.btnText}>Unblock</Text>}
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="🛡️" title="No blocked users" text="You can block anyone from their profile or chat using the ⋯ menu." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  hint: { color: colors.fine, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  av: { width: 48, height: 48, borderRadius: 24 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.fine, fontSize: 11.5, marginTop: 2 },
  btn: { height: 36, minWidth: 90, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,95,143,0.5)', backgroundColor: 'rgba(255,95,143,0.1)' },
  btnText: { color: colors.rose1, fontSize: 13, fontWeight: '700' },
});

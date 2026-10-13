import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Avatar from './Avatar';
import Icon from './Icon';
import { colors, gradients } from '../theme';
import type { StatusFeed, StatusPerson } from '../services/status';

type Props = {
  feed: StatusFeed & { me?: { id: number; avatarUrl: string | null } };
  onAdd: () => void;
  onOpenMine: () => void;
  onOpen: (p: StatusPerson) => void;
};

const RING_NEW = [colors.gold1, colors.rose1, colors.rose2, colors.gold2];

// Discover ki "Favourites" row: rose-gold ring = naya status, grey = dekh liya, ring nahi = status nahi, green dot = online
export default function StatusRail({ feed, onAdd, onOpenMine, onOpen }: Props) {
  const hasMine = feed.mine.length > 0;
  return (
    <View>
      <Text style={styles.title}>Favourites</Text>
      <FlatList
        horizontal
        data={feed.people}
        keyExtractor={p => String(p.user.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        ListHeaderComponent={
          <Pressable onPress={hasMine ? onOpenMine : onAdd} onLongPress={onAdd} style={styles.item}>
            <Ring kind={hasMine ? 'seen' : 'none'}>
              <Avatar uri={feed.me?.avatarUrl} seed={feed.me?.id ?? 0} style={styles.av} iconScale={0.9} />
            </Ring>
            <Pressable onPress={onAdd} hitSlop={8} style={styles.plusWrap}>
              <LinearGradient colors={gradients.rose} style={styles.plus}>
                <Icon name="plus" size={11} color="#fff" strokeWidth={3} />
              </LinearGradient>
            </Pressable>
            <Text style={[styles.name, styles.meName]} numberOfLines={1}>
              My status
            </Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={styles.item}>
            <Ring kind={item.statuses.length === 0 ? 'none' : item.hasUnseen ? 'new' : 'seen'}>
              <Avatar uri={item.user.avatarUrl} seed={item.user.id} style={styles.av} iconScale={0.9} />
            </Ring>
            {item.user.online && <View style={styles.dot} />}
            <Text style={styles.name} numberOfLines={1}>
              {item.user.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function Ring({ kind, children }: { kind: 'new' | 'seen' | 'none'; children: React.ReactNode }) {
  if (kind === 'new') {
    return (
      <LinearGradient colors={RING_NEW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
        <View style={styles.inner}>{children}</View>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.ring, kind === 'seen' ? styles.ringSeen : styles.ringNone]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  rail: { paddingHorizontal: 20, gap: 14 },
  item: { alignItems: 'center', width: 64 },
  ring: { width: 62, height: 62, borderRadius: 31, padding: 2.5 },
  ringSeen: { backgroundColor: '#4a3540' },
  ringNone: { padding: 0 },
  inner: { flex: 1, borderRadius: 30, borderWidth: 2.5, borderColor: colors.bg, overflow: 'hidden' },
  av: { flex: 1 },
  dot: { position: 'absolute', top: 46, right: 3, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.bg },
  plusWrap: { position: 'absolute', top: 42, right: 0 },
  plus: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.bg },
  name: { color: colors.muted, fontSize: 11, marginTop: 6 },
  meName: { color: colors.text, fontWeight: '500' },
});

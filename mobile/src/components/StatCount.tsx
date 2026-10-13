import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

// Me screen ki ginti (Following / Followers / Visitors). badge = naye (laal "+5")
export default function StatCount({ value, label, badge, gold, onPress }: { value: number | undefined; label: string; badge?: number; gold?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={st.stat}>
      <View>
        <Text style={[st.num, gold && { color: colors.gold1 }]}>{value ?? '—'}</Text>
        {!!badge && (
          <View style={st.badge}>
            <Text style={st.badgeText}>+{badge > 99 ? '99' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={st.lbl}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  num: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  lbl: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  badge: { position: 'absolute', top: -7, right: -22, paddingHorizontal: 5, height: 16, borderRadius: 8, justifyContent: 'center', backgroundColor: colors.rose1 },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
});

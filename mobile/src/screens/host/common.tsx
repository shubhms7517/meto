import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';

// Host screens ka header: back + title
export function HostHeader({ title, top, onBack }: { title: string; top: number; onBack: () => void }) {
  return (
    <View style={[s.header, { paddingTop: top + 8 }]}>
      <Pressable onPress={onBack} hitSlop={10} style={s.back}>
        <Icon name="back" size={20} />
      </Pressable>
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

// Ek kadam ki line (number / ✓, title, chhota text, daayein status)
export function Step({ n, title, sub, done, right }: { n: number; title: string; sub?: string; done?: boolean; right?: string }) {
  return (
    <View style={s.step}>
      {done ? (
        <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.num}>
          <Text style={[s.numText, { color: '#fff' }]}>✓</Text>
        </LinearGradient>
      ) : (
        <View style={[s.num, s.numOff]}>
          <Text style={s.numText}>{n}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        {!!sub && <Text style={s.stepSub}>{sub}</Text>}
      </View>
      {!!right && <Text style={s.right}>{right}</Text>}
    </View>
  );
}

// Bada gulabi button
export function BigButton({ label, onPress, disabled, gold }: { label: string; onPress: () => void; disabled?: boolean; gold?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [disabled && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}>
      <LinearGradient colors={gold ? gradients.gold : gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
        <Text style={[s.btnText, gold && { color: colors.goldText }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numOff: { backgroundColor: 'rgba(255,95,143,0.16)' },
  numText: { color: colors.rose1, fontSize: 12, fontWeight: '800' },
  stepTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  stepSub: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
  right: { color: colors.gold1, fontSize: 11.5, fontWeight: '700' },
  rules: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,59,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,59,92,0.3)' },
  rulesText: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  rulesBold: { color: '#ff8a9e', fontWeight: '800' },
  btn: { height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 14 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  label: { color: colors.muted, fontSize: 12, marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
});

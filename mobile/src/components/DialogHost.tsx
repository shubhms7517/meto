import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../theme';
import { closeDialog, subscribeDialogs, type Dialog, type DialogButton } from '../lib/dialog';
import { tap } from '../lib/haptics';

const ICON_BG: Record<Dialog['tone'], object> = {
  danger: { backgroundColor: 'rgba(255,77,94,0.14)', borderColor: 'rgba(255,77,94,0.35)' },
  gold: { backgroundColor: 'rgba(246,220,155,0.1)', borderColor: 'rgba(246,220,155,0.35)' },
  rose: { backgroundColor: 'rgba(255,95,143,0.12)', borderColor: 'rgba(255,95,143,0.3)' },
};
const MAIN: Record<Dialog['tone'], string[]> = {
  danger: ['#ff5f7a', '#c0153f'],
  gold: ['#fff4d6', '#e6bf6a'],
  rose: gradients.rose,
};

// Poori app ka ek popup (App.tsx me ek baar). Ek ke baad ek dikhta hai
export default function DialogHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);
  const d = queue[0];
  if (!d) return null;

  // Cancel wala button halka, baaki me se aakhri wala mukhya (rang wala)
  const cancel = d.buttons.find(b => b.style === 'cancel');
  const actions = d.buttons.filter(b => b !== cancel);
  const ordered: DialogButton[] = cancel ? [cancel, ...actions] : actions;
  const stacked = ordered.length > 2 || ordered.some(b => (b.text ?? '').length > 14);
  const main = actions[actions.length - 1];

  const press = (b: DialogButton) => {
    tap();
    closeDialog(d.id);
    b.onPress?.();
  };
  const dismiss = () => {
    closeDialog(d.id);
    cancel?.onPress?.();
  };

  const button = (b: DialogButton, i: number) => {
    const isMain = b === main;
    const label = <Text style={[st.btnText, isMain && d.tone === 'gold' && st.goldText]}>{b.text ?? 'OK'}</Text>;
    return (
      <Pressable key={i} onPress={() => press(b)} style={({ pressed }) => [stacked ? st.full : st.half, pressed && st.pressed]}>
        {isMain ? (
          <LinearGradient colors={MAIN[d.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.btn}>
            {label}
          </LinearGradient>
        ) : (
          <View style={[st.btn, st.ghost]}>{label}</View>
        )}
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={st.dim}>
        <View style={st.card}>
          <View style={[st.icon, ICON_BG[d.tone]]}>
            <Text style={st.iconText}>{d.icon}</Text>
          </View>
          <Text style={st.title}>{d.title}</Text>
          {!!d.message && <Text style={st.msg}>{d.message}</Text>}
          <View style={stacked ? st.col : st.row}>{(stacked ? [...actions, ...(cancel ? [cancel] : [])] : ordered).map(button)}</View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  card: { width: '100%', maxWidth: 420, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, borderRadius: 24, alignItems: 'center', backgroundColor: '#1f1418', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 10 },
  iconText: { fontSize: 24 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  msg: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  col: { gap: 8, marginTop: 16, alignSelf: 'stretch' },
  half: { flex: 1 },
  full: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  btn: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.07)' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  goldText: { color: colors.goldText },
});

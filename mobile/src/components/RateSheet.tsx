import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../theme';

type Props = {
  visible: boolean;
  value: number;
  min: number;
  max: number; // isse upar 🔒 (host level se khulega)
  step: number;
  pointsPerInr: number;
  onClose: () => void;
  onSave: (rate: number) => Promise<void>;
};

const fmt = (n: number) => n.toLocaleString('en-IN');

// Host apna rate: − / + (step) ya bar pe ungli — min se max tak
export default function RateSheet({ visible, value, min, max, step, pointsPerInr, onClose, onSave }: Props) {
  const [rate, setRate] = useState(value);
  const [w, setW] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setRate(Math.min(max, Math.max(min, value)));
  }, [visible, value, min, max]);

  // Bar pe max (3,000) beech me — aage ka aadha hissa 🔒 (host level se khulega), thumb wahan nahi jaata
  const top = max + (max - min);
  const [hitLock, setHitLock] = useState(false);
  const clamp = (r: number) => Math.min(max, Math.max(min, Math.round(r / step) * step));
  const fromX = (x: number) => {
    const r = min + (Math.max(0, Math.min(w, x)) / w) * (top - min);
    setHitLock(r > max + step / 2);
    setRate(clamp(r));
  };
  const pct = ((rate - min) / (top - min)) * 100;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(rate);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={st.dim} onPress={onClose} />
      <View style={st.sheet}>
        <Text style={st.title}>Set your call rate</Text>
        <Text style={st.sub}>
          Users will see this rate · {fmt(min)} to {fmt(max)}
        </Text>

        <View style={st.stepRow}>
          <Pressable onPress={() => setRate(clamp(rate - step))} disabled={rate <= min} hitSlop={8} style={[st.stepBtn, rate <= min && st.off]}>
            <Text style={st.stepText}>−</Text>
          </Pressable>
          <View style={st.valBox}>
            <Text style={st.val}>{fmt(rate)}</Text>
            <Text style={st.unit}>gems / min</Text>
          </View>
          <Pressable onPress={() => setRate(clamp(rate + step))} disabled={rate >= max} hitSlop={8} style={[st.stepBtn, rate >= max && st.off]}>
            <Text style={st.stepText}>+</Text>
          </Pressable>
        </View>

        <View
          style={st.track}
          onLayout={e => setW(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={e => fromX(e.nativeEvent.locationX)}
          onResponderMove={e => fromX(e.nativeEvent.locationX)}>
          <View style={st.bar}>
            <LinearGradient colors={[colors.rose1, colors.gold1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[st.fill, { width: `${pct}%` }]} />
            <View style={st.lockZone} />
          </View>
          <View pointerEvents="none" style={st.lockMark} />
          <View pointerEvents="none" style={[st.thumb, { left: `${pct}%` }]} />
        </View>
        <View style={st.scale}>
          <Text style={[st.scaleText, st.scaleSide]}>{fmt(min)}</Text>
          <Text style={[st.scaleText, st.scaleMid]}>{fmt(max)}</Text>
          <Text style={[st.scaleText, st.scaleSide, st.scaleLock]}>🔒 {fmt(top)}</Text>
        </View>
        <Text style={[st.lock, hitLock && st.lockHit]}>🔒 Above {fmt(max)} unlocks at a higher host level</Text>

        <Text style={st.earn}>
          You earn <Text style={st.earnVal}>₹{fmt(Math.round(rate / Math.max(1, pointsPerInr)))} / min</Text> ({fmt(rate)} points)
        </Text>

        <Pressable onPress={save} disabled={saving || rate === value}>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[st.save, rate === value && st.off]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.saveText}>Save rate</Text>}
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: '#1d1418', borderTopWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 18 },
  stepBtn: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  stepText: { color: colors.text, fontSize: 24, fontWeight: '800' },
  off: { opacity: 0.35 },
  valBox: { minWidth: 130, alignItems: 'center' },
  val: { color: colors.gold1, fontSize: 36, fontWeight: '800' },
  unit: { color: colors.muted, fontSize: 11.5 },
  track: { height: 34, justifyContent: 'center', marginTop: 14, marginHorizontal: 8 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  lockZone: { position: 'absolute', left: '50%', right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,138,158,0.18)' },
  lockMark: { position: 'absolute', left: '50%', width: 2, height: 16, marginLeft: -1, borderRadius: 1, backgroundColor: 'rgba(255,138,158,0.7)' },
  thumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: '#fff' },
  scale: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 4 },
  scaleSide: { flex: 1 },
  scaleMid: { textAlign: 'center' },
  scaleLock: { textAlign: 'right', color: '#ff8a9e' },
  scaleText: { color: colors.fine, fontSize: 11 },
  lock: { color: colors.fine, fontSize: 11, textAlign: 'center', marginTop: 6 },
  lockHit: { color: '#ff8a9e', fontWeight: '700' },
  earn: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 14 },
  earnVal: { color: colors.online, fontWeight: '700' },
  save: { height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

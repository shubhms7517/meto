import React, { useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors, gradients } from '../theme';
import { AGE_MAX, AGE_MIN, DEFAULT_FILTER, LANGUAGES, type DiscoverFilter } from '../services/users';

const THUMB = 26;

// Do knob wala umar slider (18 … 60+)
function AgeRange({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const [w, setW] = useState(0);
  const span = AGE_MAX - AGE_MIN;
  const vals = useRef({ min, max });
  vals.current = { min, max };
  const width = useRef(0);

  const toX = (v: number) => ((v - AGE_MIN) / span) * Math.max(0, w - THUMB);
  const fromX = (x: number) => Math.round(AGE_MIN + (Math.max(0, Math.min(x, width.current - THUMB)) / Math.max(1, width.current - THUMB)) * span);

  const make = (which: 'min' | 'max') => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const v = vals.current[which];
        startX = ((v - AGE_MIN) / span) * Math.max(0, width.current - THUMB);
      },
      onPanResponderMove: (_e, g) => {
        const v = fromX(startX + g.dx);
        const { min: lo, max: hi } = vals.current;
        // Dono knob kam se kam 2 saal door
        if (which === 'min') onChange(Math.min(v, hi - 2), hi);
        else onChange(lo, Math.max(v, lo + 2));
      },
    });
  };
  const minPan = useRef(make('min')).current;
  const maxPan = useRef(make('max')).current;

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
    setW(e.nativeEvent.layout.width);
  };

  const a = toX(min);
  const b = toX(max);
  return (
    <View style={styles.range} onLayout={onLayout}>
      <View style={styles.rTrack} />
      <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.rSel, { left: a + THUMB / 2, width: Math.max(0, b - a) }]} />
      <View {...minPan.panHandlers} hitSlop={14} style={[styles.thumb, { left: a }]} />
      <View {...maxPan.panHandlers} hitSlop={14} style={[styles.thumb, { left: b }]} />
    </View>
  );
}

type Props = { value: DiscoverFilter; onApply: (f: DiscoverFilter) => void; onClose: () => void };

// Discover filter: umar, bhasha (koi bhi ek bole), sirf online (Discover me sirf hosts — gender ki zaroorat nahi)
export default function FilterSheet({ value, onApply, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<DiscoverFilter>(value);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.top}>
          <Text style={styles.title}>Filter</Text>
          <Pressable onPress={() => setF(DEFAULT_FILTER)} hitSlop={10}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.ageRow}>
          <Text style={styles.lbl}>Age</Text>
          <Text style={styles.ageVal}>
            {f.minAge} – {f.maxAge >= AGE_MAX ? `${AGE_MAX}+` : f.maxAge}
          </Text>
        </View>
        <AgeRange min={f.minAge} max={f.maxAge} onChange={(minAge, maxAge) => setF(x => ({ ...x, minAge, maxAge }))} />

        <Text style={[styles.lbl, styles.langLbl]}>Speaks</Text>
        <View style={styles.langs}>
          {LANGUAGES.map(l => {
            const on = f.langs.includes(l);
            return (
              <Pressable
                key={l}
                onPress={() => setF(x => ({ ...x, langs: on ? x.langs.filter(y => y !== l) : [...x.langs, l] }))}
                style={[styles.lang, on && styles.langOn]}>
                <Text style={[styles.langText, on && styles.langTextOn]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => setF(x => ({ ...x, online: !x.online }))} style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Online now only</Text>
            <Text style={styles.toggleSub}>People you can video call right away</Text>
          </View>
          {f.online ? (
            <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.switch}>
              <View style={[styles.knob, { alignSelf: 'flex-end' }]} />
            </LinearGradient>
          ) : (
            <View style={[styles.switch, styles.switchOff]}>
              <View style={styles.knob} />
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            onApply(f);
            onClose();
          }}>
          <LinearGradient colors={gradients.rose} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
            <Text style={styles.btnText}>Show results</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  langLbl: { marginTop: 18 },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  lang: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 13, backgroundColor: '#241c20', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  langOn: { borderColor: colors.rose1, backgroundColor: 'rgba(255,95,143,0.15)' },
  langText: { color: colors.muted, fontSize: 12.5 },
  langTextOn: { color: colors.text, fontWeight: '700' },
  sheet: { backgroundColor: '#1a0b13', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  reset: { color: colors.rose1, fontSize: 14, fontWeight: '600' },
  lbl: { color: colors.muted, fontSize: 12.5, marginTop: 12, marginBottom: 8 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segText: { color: colors.muted, fontSize: 13.5, fontWeight: '600' },
  ageRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  ageVal: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  range: { height: 36, justifyContent: 'center', marginHorizontal: 2 },
  rTrack: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  rSel: { position: 'absolute', height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#fff', borderWidth: 3, borderColor: colors.rose1, elevation: 4, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toggleTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  toggleSub: { color: colors.fine, fontSize: 11.5, marginTop: 1 },
  switch: { width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchOff: { backgroundColor: 'rgba(255,255,255,0.14)' },
  knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff' },
  btn: { height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
});

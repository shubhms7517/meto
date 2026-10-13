import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './Button';
import Icon from './Icon';
import { colors, gradients } from '../theme';
import { REPORT_REASONS, ReportReason } from '../services/users';

type Props = {
  visible: boolean;
  name: string;
  onClose: () => void;
  onSubmit: (r: { reason: ReportReason; details: string; block: boolean }) => Promise<void>;
};

// Neeche se khulne wala report panel
export default function ReportSheet({ visible, name, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Har baar khulne pe saaf form
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setBlock(true);
      setError('');
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit({ reason, details: details.trim(), block });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={styles.flagIc}>
              <Icon name="shield" size={20} color="#ff8a8a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Report {name}</Text>
              <Text style={styles.sub}>Your report is anonymous. Our team will review it.</Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map(r => {
              const on = reason === r.key;
              return (
                <Pressable key={r.key} onPress={() => setReason(r.key)} style={[styles.row, on && styles.rowOn]}>
                  <Text style={styles.emoji}>{r.icon}</Text>
                  <Text style={[styles.rowText, on && { color: colors.text }]}>{r.label}</Text>
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                </Pressable>
              );
            })}

            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Add details (optional)"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.rose1}
              multiline
              maxLength={500}
              style={styles.input}
            />

            <Pressable onPress={() => setBlock(b => !b)} style={styles.blockRow}>
              {block ? (
                <LinearGradient colors={gradients.rose} style={styles.box}>
                  <Icon name="check" size={12} color="#fff" strokeWidth={3.5} />
                </LinearGradient>
              ) : (
                <View style={[styles.box, styles.boxOff]} />
              )}
              <Text style={styles.blockText}>Also block {name}</Text>
            </Pressable>
          </ScrollView>

          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button title="Submit report" disabled={!reason} loading={loading} onPress={submit} style={{ marginTop: 12 }} />
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a0b13',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  flagIc: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,107,107,0.12)' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sub: { color: colors.fine, fontSize: 11.5, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  rowOn: { borderColor: 'rgba(255,95,143,0.6)', backgroundColor: 'rgba(255,95,143,0.1)' },
  emoji: { fontSize: 18 },
  rowText: { flex: 1, color: colors.muted, fontSize: 13.5, fontWeight: '500' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.fine, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.rose1 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rose1 },
  input: {
    minHeight: 70,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 13.5,
    padding: 12,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  box: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  boxOff: { borderWidth: 1.5, borderColor: colors.muted },
  blockText: { color: colors.text, fontSize: 13.5 },
  error: { color: '#ff8a8a', fontSize: 12, marginTop: 10, textAlign: 'center' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
});

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { IconName } from './Icon';
import { colors } from '../theme';

export type SheetAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean };

type Props = { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void };

// ⋯ menu (Android Alert me sirf 3 button aate hain, isliye apna)
export default function ActionSheet({ visible, title, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        {!!title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.group}>
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                // Sheet band hone ke baad action (doosra modal khul sake)
                setTimeout(a.onPress, 250);
              }}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
              <View style={[styles.ic, a.danger && styles.icDanger]}>
                <Icon name={a.icon} size={18} color={a.danger ? '#ff8a8a' : colors.text} />
              </View>
              <Text style={[styles.label, a.danger && { color: '#ff8a8a' }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a0b13',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 12 },
  title: { color: colors.muted, fontSize: 12.5, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  group: { borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  ic: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  icDanger: { backgroundColor: 'rgba(255,107,107,0.12)' },
  label: { color: colors.text, fontSize: 14.5, fontWeight: '500' },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: 8, borderRadius: 18, backgroundColor: colors.surface },
  cancelText: { color: colors.muted, fontSize: 14.5, fontWeight: '600' },
});

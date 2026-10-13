import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';
import { colors, gradients, radius } from '../theme';

type Props = { onBack: () => void; step: number; totalSteps?: number };

// Back button + step progress bars
export default function AuthHeader({ onBack, step, totalSteps = 3 }: Props) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
        <Icon name="back" size={18} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.steps}>
        {Array.from({ length: totalSteps }, (_, i) =>
          i < step ? (
            <LinearGradient
              key={i}
              colors={gradients.rose}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.bar, styles.barOn]}
            />
          ) : (
            <View key={i} style={styles.bar} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  back: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: { marginLeft: 'auto', flexDirection: 'row', gap: 6 },
  bar: { width: 18, height: 5, borderRadius: 3, backgroundColor: colors.surface2 },
  barOn: { width: 28 },
});

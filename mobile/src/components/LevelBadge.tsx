import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

// Level ke hisaab se badge ka rang: 0 grey, 1-4 rose, 5-9 silver, 10-13 gold, 14-15 royal
export function tierColors(level: number): { colors: string[]; text: string } {
  if (level >= 14) return { colors: ['#e9c8ff', '#9b5cf6', '#5b21b6'], text: '#fff' };
  if (level >= 10) return { colors: ['#fff4d6', '#f3d488', '#d4a64b'], text: '#3a2508' };
  if (level >= 5) return { colors: ['#f4f4fa', '#c9c9d8', '#8a8aa0'], text: '#222230' };
  if (level >= 1) return { colors: ['#ff9ab8', '#ff5f8f', '#b3245a'], text: '#fff' };
  return { colors: ['#6a5a62', '#4a3c43', '#2e252a'], text: '#e8dde2' };
}

// Heere jaisa (45° ghooma) badge — beech me level number
export default function LevelBadge({ level, size = 110 }: { level: number; size?: number }) {
  const t = tierColors(level);
  const box = size * 0.72;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient
        colors={t.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.diamond, { width: box, height: box, borderRadius: box * 0.3 }]}
      />
      <Text style={[styles.lv, { color: t.text, fontSize: size * 0.11 }]}>Lv.</Text>
      <Text style={[styles.num, { color: t.text, fontSize: size * 0.28, lineHeight: size * 0.32 }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  diamond: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#ff5f8f',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 10,
  },
  num: { fontWeight: '800' },
  lv: { fontWeight: '800', opacity: 0.85, marginBottom: -2 },
});

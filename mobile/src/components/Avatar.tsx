import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';

// Photo na ho to har user ka apna fixed gradient (ID se)
const PALETTES: [string, string, string][] = [
  ['#ff9bbb', '#a3164a', '#5c0c2c'],
  ['#f6dc9b', '#a87a2a', '#5e4012'],
  ['#c9a0ff', '#6a2bb0', '#3c1470'],
  ['#ffb08f', '#c2402a', '#6d1c10'],
  ['#8fd3ff', '#2a5bb0', '#13306b'],
  ['#9ff0d0', '#1f8a6a', '#0d4535'],
];

type Props = {
  uri: string | null | undefined;
  seed: number;
  style?: StyleProp<ViewStyle>;
  iconScale?: number; // silhouette kitna bada (0-1)
};

// Parent ka size lekar bharta hai (absoluteFill ya width/height style se)
export default function Avatar({ uri, seed, style, iconScale = 0.8 }: Props) {
  const [from, to, ink] = PALETTES[Math.abs(seed) % PALETTES.length];
  return (
    <View style={[styles.wrap, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[from, to]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill}>
          <PlaceholderPerson color={ink} scale={iconScale} />
        </LinearGradient>
      )}
    </View>
  );
}

function PlaceholderPerson({ color, scale }: { color: string; scale: number }) {
  const [w, setW] = React.useState(0);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <View style={[styles.person, { opacity: 0.85 }]}>
          <Icon name="person" size={w * scale} color={color} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#1e0f17' },
  person: { position: 'absolute', bottom: '-6%', alignSelf: 'center' },
});

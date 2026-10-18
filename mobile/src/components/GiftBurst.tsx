import React, { useEffect, useRef, useState } from 'react';
import { RNSvgaPlayer } from 'rn-newarch-svga-player';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Coin from './Coin';
import { colors } from '../theme';
import type { GiftBody } from '../services/gifts';

export type Burst = { key: number; gift: GiftBody; text: string };

const SPARKS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

// Gift ki SVGA animation poori screen pe (admin panel se upload). Khatam / error → band
function SvgaBurst({ burst, onDone, onFail }: { burst: Burst; onDone: () => void; onFail: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 15_000); // animation kabhi khatam na bole to bhi band
    return () => clearTimeout(t);
  }, [burst.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <RNSvgaPlayer key={burst.key} source={burst.gift.svgaUrl!} loops={1} clearsAfterStop onFinished={onDone} onError={onFail} style={styles.svga} />
      <View style={[styles.label, styles.svgaLabel]}>
        <Text style={styles.labelText}>{burst.text} </Text>
        <Text style={[styles.labelText, styles.giftName]}>{burst.gift.name}</Text>
        {burst.gift.qty > 1 && <Text style={[styles.labelText, styles.giftName]}> ×{burst.gift.qty}</Text>}
        <Text style={styles.dot}> · </Text>
        <Coin size={14} />
        <Text style={[styles.labelText, styles.gold]}> {burst.gift.total.toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
}

// Bada gift beech screen pe. SVGA ho to wahi, warna emoji: pop → halka hilna → upar uthke gayab (dono taraf dikhta hai)
export default function GiftBurst({ burst, onDone }: { burst: Burst | null; onDone: () => void }) {
  const [svgaFailed, setSvgaFailed] = useState<number | null>(null);
  if (burst?.gift.svgaUrl && svgaFailed !== burst.key) return <SvgaBurst burst={burst} onDone={onDone} onFail={() => setSvgaFailed(burst.key)} />;
  return <EmojiBurst burst={burst} onDone={onDone} />;
}

function EmojiBurst({ burst, onDone }: { burst: Burst | null; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current; // 0 → 1 poori zindagi
  const pop = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!burst) return;
    t.setValue(0);
    pop.setValue(0);
    spark.setValue(0);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.timing(spark, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [burst?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!burst) return null;
  const opacity = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });
  const rise = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0, -10, -60] });
  const wobble = t.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ['0deg', '-8deg', '7deg', '-5deg', '3deg', '0deg'] });
  const sOpacity = spark.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={{ alignItems: 'center', opacity, transform: [{ translateY: rise }] }}>
        <View style={styles.center}>
          <Animated.View style={[styles.glow, { transform: [{ scale: pop }] }]} />
          {SPARKS.map((a, i) => (
            <Animated.View
              key={i}
              style={[
                styles.spark,
                {
                  opacity: sOpacity,
                  transform: [
                    { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 110] }) },
                    { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 110] }) },
                  ],
                },
              ]}
            />
          ))}
          <Animated.Text style={[styles.emoji, { transform: [{ scale: pop }, { rotate: wobble }] }]}>{burst.gift.icon}</Animated.Text>
          {burst.gift.qty > 1 && (
            <Animated.Text style={[styles.qty, { transform: [{ scale: pop }] }]}>×{burst.gift.qty}</Animated.Text>
          )}
        </View>
        <View style={styles.label}>
          <Text style={styles.labelText}>{burst.text} </Text>
          <Text style={[styles.labelText, { color: colors.gold1, fontWeight: '700' }]}>{burst.gift.name}</Text>
          <Text style={styles.dot}> · </Text>
          <Coin size={14} />
          <Text style={[styles.labelText, { color: colors.gold1 }]}> {burst.gift.total.toLocaleString('en-IN')}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 50, elevation: 50 },
  center: { width: 220, height: 200, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(246,220,155,0.22)' },
  spark: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold1, shadowColor: colors.gold1, shadowOpacity: 1, shadowRadius: 6 },
  emoji: { fontSize: 104, lineHeight: 124, textShadowColor: 'rgba(246,220,155,0.8)', textShadowRadius: 24 },
  qty: { position: 'absolute', right: 18, bottom: 22, color: colors.gold1, fontSize: 30, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  label: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(246,220,155,0.5)' },
  labelText: { color: '#fff', fontSize: 13 },
  dot: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  svga: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  svgaLabel: { position: 'absolute', bottom: '18%' },
  giftName: { color: colors.gold1, fontWeight: '700' },
  gold: { color: colors.gold1 },
});

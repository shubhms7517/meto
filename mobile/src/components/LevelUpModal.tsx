import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import LevelBadge from './LevelBadge';
import Coin from './Coin';
import { colors } from '../theme';

// Gems kharch karte karte level badha — chhota jashn
export default function LevelUpModal({ level, reward, onClose }: { level: number; reward: number; onClose: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.kick}>LEVEL UP!</Text>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <LevelBadge level={level} size={120} />
          </Animated.View>
          <Text style={styles.title}>You reached Lv.{level}</Text>
          {reward > 0 ? (
            <View style={styles.reward}>
              <Coin size={20} />
              <Text style={styles.rewardText}> +{reward.toLocaleString('en-IN')} gems added</Text>
            </View>
          ) : (
            <Text style={styles.sub}>Recharge more to reach the next level</Text>
          )}
          <LinearGradient colors={['#fff4d6', '#f3d488', '#d9ae55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
            <Text style={styles.btnText}>Nice!</Text>
          </LinearGradient>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 28, padding: 22, backgroundColor: '#1d0914', borderWidth: 1, borderColor: 'rgba(255,95,143,0.45)' },
  kick: { color: colors.gold1, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 10 },
  sub: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  reward: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(212,166,75,0.14)' },
  rewardText: { color: colors.gold1, fontSize: 14, fontWeight: '800' },
  btn: { alignSelf: 'stretch', height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.goldText, fontSize: 15, fontWeight: '800' },
});

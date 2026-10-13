import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Coin from './Coin';
import { colors } from '../theme';

type Props = { balance: number; onPress?: () => void };

export default function CoinChip({ balance, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Coin size={22} />
      <Text style={styles.text}>{balance.toLocaleString('en-IN')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(212,166,75,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.28)',
  },
  text: { color: colors.gold1, fontSize: 13, fontWeight: '600' },
});

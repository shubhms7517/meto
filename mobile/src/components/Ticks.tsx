import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ChatMessage } from '../services/chat';

const BLUE = '#6fd3ff';

// ⏱ bhej raha · ✓ server pe · ✓✓ grey pahuncha · ✓✓ blue padh liya · ! fail
export default function Ticks({ m, color = 'rgba(255,255,255,0.75)', size = 15 }: { m: ChatMessage; color?: string; size?: number }) {
  if (m.failed) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} fill="#ff6b6b" />
        <Path d="M12 7v6M12 16.5v.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  if (m.pending) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={12} r={8} />
        <Path d="M12 8v4l2.5 2" />
      </Svg>
    );
  }
  const double = !!m.deliveredAt || !!m.readAt;
  const c = m.readAt ? BLUE : color;
  return (
    <Svg width={size + 3} height={size} viewBox="0 0 26 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {double ? <Path d="M2 13l4 4 8-9M11 16l1 1 9-10" /> : <Path d="M5 13l4 4 10-11" />}
    </Svg>
  );
}

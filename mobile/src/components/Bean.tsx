import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

// Orange bean — sirf withdraw (beans) ke liye. Gems ka icon Coin hai, dono alag dikhne chahiye.
export const BEAN_COLOR = '#ffab5e';

export default function Bean({ size = 18 }: { size?: number }) {
  const id = useId();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffd08a" />
          <Stop offset="1" stopColor="#d9741f" />
        </LinearGradient>
      </Defs>
      <Path
        d="M7.5 3.5c3-1.6 6.4-.6 7.4 2 .8 2 2.6 2.3 4.2 3.6 2.6 2.1 2.2 6.6-1.1 9.2-3.6 2.8-9.6 3-13 .2C2 16.3 1.6 12 3.2 8.6 4.2 6.4 5.5 4.6 7.5 3.5z"
        fill={`url(#${id})`}
      />
      <Path d="M9 6.6c1.8-.6 3.4.2 3.9 1.5" stroke="#fff3dc" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.85} />
      <Path d="M12.6 12.4c1.6 1.6 1.2 4-1 5.2" stroke="#8a3f0c" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
    </Svg>
  );
}

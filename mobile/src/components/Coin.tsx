import React, { useId } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

// Gold "M" coin
export default function Coin({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id={id} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#fff3c8" />
          <Stop offset="0.6" stopColor={colors.gold2} />
          <Stop offset="1" stopColor="#9c7426" />
        </RadialGradient>
      </Defs>
      <Circle cx={12} cy={12} r={12} fill={`url(#${id})`} />
      <SvgText x={12} y={16.2} textAnchor="middle" fontSize={11.5} fontWeight="800" fill={colors.goldText}>
        M
      </SvgText>
    </Svg>
  );
}

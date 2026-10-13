import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

type Props = { size?: number; text?: string };

// Gold gradient italic logo text
export default function Wordmark({ size = 48, text = 'Meto' }: Props) {
  // Italic text right side me bahar nikalta hai, isliye extra jagah
  const width = size * text.length * 0.62 + size * 0.3;
  const height = size * 1.3;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="wm" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.gold1} />
          <Stop offset="1" stopColor={colors.gold2} />
        </LinearGradient>
      </Defs>
      <SvgText
        x={width / 2}
        y={size}
        textAnchor="middle"
        fontSize={size}
        fontWeight="700"
        fontStyle="italic"
        fontFamily="serif"
        fill="url(#wm)">
        {text}
      </SvgText>
    </Svg>
  );
}

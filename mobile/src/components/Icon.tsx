import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

// Line icons: har icon ke SVG elements (stroke se bante hain)
const LINE = {
  back: [<Path key="a" d="M15 5l-7 7 7 7" />],
  chevron: [<Path key="a" d="M9 6l6 6-6 6" />],
  chevronDown: [<Path key="a" d="M6 9l6 6 6-6" />],
  phone: [<Rect key="a" x={6} y={2} width={12} height={20} rx={3} />, <Path key="b" d="M11 18h2" />],
  shield: [<Path key="a" d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />, <Path key="b" d="M8.5 12l2.5 2.5 4.5-5" />],
  lock: [<Rect key="a" x={4} y={10} width={16} height={11} rx={3} />, <Path key="b" d="M8 10V7a4 4 0 018 0v3" />],
  video: [<Rect key="a" x={2} y={6} width={14} height={12} rx={3} />, <Path key="b" d="M16 10l6-3v10l-6-3" />],
  calendar: [<Rect key="a" x={3} y={5} width={18} height={16} rx={3} />, <Path key="b" d="M3 10h18M8 3v4M16 3v4" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  check: [<Path key="a" d="M5 12l5 5 9-10" />],
  male: [<Circle key="a" cx={10} cy={14} r={6} />, <Path key="b" d="M14.5 9.5L20 4M15 4h5v5" />],
  female: [<Circle key="a" cx={12} cy={9} r={6} />, <Path key="b" d="M12 15v7M9 19h6" />],
  heartOutline: [<Path key="a" d="M12 20.5s-7.5-4.6-9.6-9.3C.9 7.8 3 4 6.8 4c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3C21 4 23.1 7.8 21.6 11.2 19.5 15.9 12 20.5 12 20.5z" />],
  chat: [<Path key="a" d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />],
  compass: [<Circle key="a" cx={12} cy={12} r={9} />, <Path key="b" d="M15.5 8.5l-2 5-5 2 2-5z" />],
  user: [<Circle key="a" cx={12} cy={8} r={4} />, <Path key="b" d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />],
  bell: [<Path key="a" d="M6 16V11a6 6 0 0112 0v5l2 2H4z" />, <Path key="b" d="M10 21h4" />],
  filter: [<Path key="a" d="M4 6h16M7 12h10M10 18h4" />],
  pin: [<Path key="a" d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />, <Circle key="b" cx={12} cy={9.5} r={2.5} />],
  globe: [<Circle key="a" cx={12} cy={12} r={9} />, <Path key="b" d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />],
  edit: [<Path key="a" d="M4 20h4L19 9l-4-4L4 16z" />],
  copy: [<Rect key="a" x={8} y={8} width={12} height={12} rx={3} />, <Path key="b" d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />],
  settings: [
    <Circle key="a" cx={12} cy={12} r={3} />,
    <Path
      key="b"
      d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
    />,
  ],
  crown: [<Path key="a" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />],
  gift: [<Rect key="a" x={3} y={9} width={18} height={12} rx={2} />, <Path key="b" d="M12 9v12M3 13h18M12 9C10 5 6 5 7 8M12 9c2-4 6-4 5-1" />],
  trend: [<Path key="a" d="M3 17l6-6 4 4 8-8M15 7h6v6" />],
  support: [<Path key="a" d="M4 13a8 8 0 0116 0v4a2 2 0 01-2 2h-2v-6h4M4 13h4v6H6a2 2 0 01-2-2z" />],
  quote: [<Path key="a" d="M4 6h16v10H9l-5 4z" />],
  image: [<Rect key="a" x={3} y={4} width={18} height={16} rx={3} />, <Circle key="b" cx={9} cy={10} r={2} />, <Path key="c" d="M21 16l-5-5-9 9" />],
  send: [<Path key="a" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />],
  mic: [<Rect key="a" x={9} y={2} width={6} height={12} rx={3} />, <Path key="b" d="M5 11a7 7 0 0014 0M12 18v4" />],
  micOff: [<Path key="a" d="M3 3l18 18M9 9v2a3 3 0 005 2.2M15 9.3V5a3 3 0 00-5.8-1M5 11a7 7 0 0011 5.7M19 11a7 7 0 01-.6 2.8M12 18v4" />],
  videoOff: [<Path key="a" d="M16 10l6-3v10l-6-3M3 3l18 18M14 18H5a3 3 0 01-3-3V9a3 3 0 012-2.8" />],
  flip: [<Path key="a" d="M3 8h14l-3-3M21 16H7l3 3" />],
  speaker: [<Path key="a" d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M19 6a8 8 0 010 12" />],
  phoneCall: [<Path key="a" d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />],
  clock: [<Circle key="a" cx={12} cy={12} r={9} />, <Path key="b" d="M12 7v5l3 2" />],
  logout: [<Path key="a" d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />],
};

export type IconName = keyof typeof LINE | 'heart' | 'videoFill' | 'google' | 'person' | 'verified' | 'more';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export default function Icon({ name, size = 20, color = colors.text, strokeWidth = 2 }: Props) {
  switch (name) {
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path fill={color} d="M12 20.5s-7.5-4.6-9.6-9.3C.9 7.8 3 4 6.8 4c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3C21 4 23.1 7.8 21.6 11.2 19.5 15.9 12 20.5 12 20.5z" />
        </Svg>
      );
    case 'videoFill':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={2} y={6} width={13.5} height={12} rx={3.2} fill={color} />
          <Path fill={color} d="M17 10.2l4.2-2.6c.6-.4 1.3 0 1.3.7v7.4c0 .7-.7 1.1-1.3.7L17 13.8z" />
        </Svg>
      );
    case 'person':
      return (
        <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
          <Circle cx={50} cy={38} r={22} fill={color} />
          <Path fill={color} d="M8 120c0-26 19-44 42-44s42 18 42 44z" />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={5} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={19} cy={12} r={1.6} fill={color} />
        </Svg>
      );
    case 'verified':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path fill="#4ea7ff" d="M12 1.8l2.3 1.7 2.8-.2 1 2.6 2.4 1.5-.6 2.8 1.2 2.6-2 2 .1 2.8-2.7.8-1.4 2.5-2.8-.6-2.4 1.5-2.1-1.9-2.8-.1-.8-2.7-2.4-1.5.7-2.8-1.1-2.6 2-2-.1-2.8 2.7-.8 1.4-2.5 2.8.6z" />
          <Path stroke="#fff" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" d="M8 12.2l2.7 2.6L16.2 9" />
        </Svg>
      );
    case 'google':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
          <Path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" />
          <Path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2z" />
          <Path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
        </Svg>
      );
    default:
      return (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round">
          {LINE[name]}
        </Svg>
      );
  }
}

export const colors = {
  bg: '#12070d',
  surface: '#1e0f17',
  surface2: '#2a1520',
  border: 'rgba(255,255,255,0.08)',
  text: '#fbf3f6',
  muted: '#b39aa6',
  placeholder: '#6f5864',
  fine: '#7d6571',

  rose1: '#ff5f8f',
  rose2: '#d81b5c',
  rose3: '#8e0f3c',
  gold1: '#f6dc9b',
  gold2: '#d4a64b',
  goldText: '#3a2508',

  online: '#3ee08f',
  roseFocus: 'rgba(255,95,143,0.6)',
};

export const gradients = {
  rose: [colors.rose1, colors.rose2],
  roseDeep: [colors.rose1, colors.rose2, colors.rose3],
  gold: [colors.gold1, colors.gold2],
};

export const radius = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
};

export const spacing = {
  screen: 24,
};

export const type = {
  title: { fontSize: 26, fontWeight: '700' as const, lineHeight: 32, letterSpacing: -0.3, color: colors.text },
  sub: { fontSize: 13.5, lineHeight: 21, color: colors.muted },
  label: { fontSize: 12, fontWeight: '500' as const, color: colors.muted },
  button: { fontSize: 15, fontWeight: '600' as const },
};

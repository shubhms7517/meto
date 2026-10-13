// Daam ek jagah
export const CALL_RATE = 1000; // gems per minute (Vato jaisa paimana)
export const VIP_CALL_RATE = 900; // VIP: video / match call 10% sasti (Vato jaisa)
export const VIP_RECHARGE_BONUS = 0; // Vato me recharge bonus nahi

export const callRateFor = (u: { isVip: boolean }) => (u.isVip ? VIP_CALL_RATE : CALL_RATE);

// VIP plans (Vato jaisa) — lete hi bonus gems
export const VIP_PLANS = [
  { id: 'vip_1m', months: 1, priceInr: 899, bonusGems: 25000 },
  { id: 'vip_3m', months: 3, priceInr: 1699, bonusGems: 5200 },
  { id: 'vip_12m', months: 12, priceInr: 4599, bonusGems: 180000 },
] as const;

// Daily check-in: 7 din ka chakkar
export const CHECKIN_REWARDS = [100, 100, 200, 200, 300, 300, 600];

// Level (bilkul Vato jaisa): kul kitne gems RECHARGE kiye — Lv.0 se shuru, har naye level pe free gems inaam
export const LEVELS = [
  { level: 0, xp: 0, reward: 0 },
  { level: 1, xp: 5000, reward: 0 },
  { level: 2, xp: 10000, reward: 200 },
  { level: 3, xp: 20000, reward: 300 },
  { level: 4, xp: 40000, reward: 500 },
  { level: 5, xp: 80000, reward: 800 },
  { level: 6, xp: 160000, reward: 1000 },
  { level: 7, xp: 300000, reward: 1500 },
  { level: 8, xp: 600000, reward: 2500 },
  { level: 9, xp: 1200000, reward: 4000 },
  { level: 10, xp: 2500000, reward: 6000 },
  { level: 11, xp: 5000000, reward: 10000 },
  { level: 12, xp: 10000000, reward: 15000 },
  { level: 13, xp: 20000000, reward: 25000 },
  { level: 14, xp: 40000000, reward: 40000 },
  { level: 15, xp: 80000000, reward: 60000 },
] as const;

export const levelForXp = (xp: number) => [...LEVELS].reverse().find(l => xp >= l.xp)!.level;

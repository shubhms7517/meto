import { api, jsonBody } from './api';

/* ---------- VIP ---------- */
export type VipPlan = { id: string; months: number; priceInr: number; bonusGems: number; perWeek: number };
export type VipInfo = { isVip: boolean; vipUntil: string | null; plans: VipPlan[] };

export const getVip = () => api<VipInfo>('/api/rewards/vip');

// Development: test purchase. Release me Google Play subscription token.
export const buyVip = (planId: string) =>
  api<VipInfo>('/api/rewards/vip/purchase', {
    method: 'POST',
    ...jsonBody({ planId, provider: 'dev', token: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` }),
  });

export const vipDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- Daily check-in ---------- */
export type CheckIn = { day: number; claimedToday: boolean; streak: number; isVip: boolean; rewards: number[] };
export const getCheckIn = () => api<CheckIn>('/api/rewards/checkin');
export const claimCheckIn = () => api<CheckIn & { reward: number; balance: number }>('/api/rewards/checkin', { method: 'POST' });

/* ---------- Level ---------- */
// Level (Vato jaisa): kul recharge kiye gems se. Har naye level pe free gems.
export type LevelTier = { level: number; xp: number; reward: number };
export type LevelInfo = { level: number; xp: number; levelXp: number; nextXp: number | null; nextReward: number | null; tiers: LevelTier[] };
export const getLevel = () => api<LevelInfo>('/api/rewards/level');

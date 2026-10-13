import { api, jsonBody } from './api';
import { finishPlayPurchase, playPurchase } from './billing';
import { IS_TEST_PAYMENTS } from './wallet';

/* ---------- VIP ---------- */
export type VipPlan = { id: string; months: number; priceInr: number; bonusGems: number; perWeek: number };
export type VipInfo = { isVip: boolean; vipUntil: string | null; plans: VipPlan[] };

export const getVip = () => api<VipInfo>('/api/rewards/vip');

const sendVip = (planId: string, provider: 'dev' | 'google', token: string) =>
  api<VipInfo>('/api/rewards/vip/purchase', { method: 'POST', ...jsonBody({ planId, provider, token }) });

// VIP: development me test purchase, release me Google Play (plan id = Play product id)
export async function buyVip(planId: string): Promise<VipInfo> {
  if (IS_TEST_PAYMENTS) return sendVip(planId, 'dev', `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  const p = await playPurchase(planId);
  const r = await sendVip(planId, 'google', p.purchaseToken!);
  await finishPlayPurchase(p);
  return r;
}

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

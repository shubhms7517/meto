import { api, jsonBody } from './api';
import { finishPlayPurchase, playPurchase, recoverPlayPurchases } from './billing';

export type Pack = {
  id: string;
  gems: number;
  bonus: number;
  firstBonus: number; // pehli recharge pe extra (warna 0)
  vipBonus: number; // VIP: +10%
  total: number;
  priceInr: number;
  bonusPct: number;
  tag: 'once' | 'popular' | 'best' | null; // once = naye user ka offer
};

export type WalletSummary = { balance: number; callRate: number; vipCallDiscountPct?: number; isVip: boolean; isHost?: boolean; hostRate?: number | null; firstRechargeAvailable: boolean; packs: Pack[] };

export type TxKind = 'recharge' | 'bonus' | 'call' | 'gift' | 'checkin' | 'refund' | 'admin' | 'message' | 'unlock';
export type WalletTx = {
  id: number;
  kind: TxKind;
  amount: number;
  balanceAfter: number;
  title: string;
  subtitle: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
};

export type HistoryFilter = 'all' | 'added' | 'spent';
export type HistoryPage = { items: WalletTx[]; nextBefore: number | null; month: { added: number; spent: number } };

export const getWallet = () => api<WalletSummary>('/api/wallet');

export const getHistory = (filter: HistoryFilter, before?: number | null) =>
  api<HistoryPage>(`/api/wallet/history?filter=${filter}${before ? `&before=${before}` : ''}`);

// Development: asli payment nahi, server test purchase maanta hai. Release: Google Play
export const IS_TEST_PAYMENTS = __DEV__;

type PackResult = { balance: number; tx: WalletTx; duplicate: boolean };
const sendPack = (packId: string, provider: 'dev' | 'google', token: string) =>
  api<PackResult>('/api/wallet/purchase', { method: 'POST', ...jsonBody({ packId, provider, token }) });

// Gems kharidna: Play pe payment → server token jaanch ke gems deta hai → Play purchase poora
export async function buyPack(packId: string): Promise<PackResult> {
  if (IS_TEST_PAYMENTS) return sendPack(packId, 'dev', `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  const p = await playPurchase(packId);
  const r = await sendPack(packId, 'google', p.purchaseToken!);
  await finishPlayPurchase(p);
  return r;
}

// Pichhli baar payment ke beech app band hui ho to bache gems / VIP de do
export function recoverPurchases() {
  if (IS_TEST_PAYMENTS) return;
  recoverPlayPurchases((sku, token) =>
    sku.startsWith('vip_')
      ? api('/api/rewards/vip/purchase', { method: 'POST', ...jsonBody({ planId: sku, provider: 'google', token }) })
      : sendPack(sku, 'google', token),
  ).catch(() => {});
}

export const fmt = (n: number) => n.toLocaleString('en-IN');

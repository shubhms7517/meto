import { api, jsonBody } from './api';

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

// Development: asli payment nahi, server test purchase maanta hai.
// Release me yahan Google Play Billing ka purchase token jayega.
export const IS_TEST_PAYMENTS = __DEV__;

export function buyPack(packId: string) {
  const token = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return api<{ balance: number; tx: WalletTx; duplicate: boolean }>(
    '/api/wallet/purchase',
    { method: 'POST', ...jsonBody({ packId, provider: 'dev', token }) },
  );
}

export const fmt = (n: number) => n.toLocaleString('en-IN');

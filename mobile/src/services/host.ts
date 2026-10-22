import { api, jsonBody } from './api';

export type HostStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// Host ko sirf gems dikhte hain (₹ / rate nahi). Beans sirf Withdraw pe.
export type HostToday = { gems: number; calls: number; minutes: number };

export type HostSummary = {
  role: 'user' | 'host';
  today: HostToday | null; // sirf host
  canApply: boolean; // sirf agency link wali ladki — "Become a host" dikhana hai ya nahi
  invite: { code: string; name: string } | null; // kis agency ke link se aayi
  application: { status: HostStatus; rejectReason: string | null; agency: { code: string; name: string } | null; reviewedAt: string | null } | null;
  rate: number | null;
  rates: number[]; // jaldi chunne ke chips
  rateMin: number; // is host ki range (Meto team ki di hui, warna Settings wali)
  rateMax: number; // sabse zyada rate
  rateOwnRange?: boolean; // true = Meto team ne is host ki range set ki
  rateStep: number;
  available: boolean;
  gems: number; // balance (gems)
  totalEarned: number;
  media?: { freePhotos: number; photoPrice: number; freeVideos: number; videoPrice: number; maxVideos: number };
};

export const getHostMe = () => api<HostSummary>('/api/host/me');

export const checkAgency = (code: string) => api<{ code: string; name: string }>(`/api/host/agency/${encodeURIComponent(code.trim())}`);

export type HostApplication = { photos: string[]; video: string; selfies: string[] };

// Agency link khula → server yaad rakhta hai (sirf ladki)
export const acceptInvite = (code: string) => api<{ code: string; name: string }>('/api/host/invite', { method: 'POST', ...jsonBody({ code }) });

const ext = (uri: string, fallback: string) => uri.split('?')[0].split('.').pop()?.toLowerCase() || fallback;

// Saari files ek saath (multipart) — server private folder me rakhta hai
export async function applyForHost(a: HostApplication): Promise<HostSummary> {
  const form = new FormData();
  a.photos.forEach((uri, i) => {
    const e = ext(uri, 'jpg');
    form.append('photo', { uri, name: `photo${i}.${e}`, type: e === 'png' ? 'image/png' : 'image/jpeg' } as unknown as Blob);
  });
  a.selfies.forEach((uri, i) => form.append('selfie', { uri, name: `selfie${i}.jpg`, type: 'image/jpeg' } as unknown as Blob));
  form.append('video', { uri: a.video, name: 'intro.mp4', type: 'video/mp4' } as unknown as Blob);
  return api<HostSummary>('/api/host/apply', { method: 'POST', body: form });
}

export const setHostRate = (rate: number) => api<HostSummary>('/api/host/me', { method: 'PATCH', ...jsonBody({ rate }) });

export type HostTxKind = 'call' | 'gift' | 'message' | 'withdraw' | 'refund' | 'admin' | 'unlock';
export type HostTx = { id: number; kind: HostTxKind; gems: number; title: string; subtitle: string | null; createdAt: string };
export type EarningsPage = { items: HostTx[]; nextBefore: number | null; totals: { call: number; gift: number; message: number } };

export const getEarnings = (kind: 'all' | 'call' | 'gift' | 'message', before?: number | null) =>
  api<EarningsPage>(`/api/host/earnings?kind=${kind}${before ? `&before=${before}` : ''}`);

export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/* ---------------- Withdraw (UPI) ---------------- */
export type PayoutAccount = { upiId: string; upiName: string; panMasked: string; panName: string };
// Withdraw sirf beans me — ₹ / TDS host ko nahi dikhte (Meto team admin ke rate se bhejti hai)
export type Withdrawal = {
  id: number;
  beans: number;
  upiId: string;
  status: 'pending' | 'paid' | 'rejected';
  utr: string | null;
  reason: string | null;
  paidAt: string | null;
  createdAt: string;
};
export type WithdrawInfo = {
  beans: number; // kitne beans nikal sakti hai
  minBeans: number;
  account: PayoutAccount | null;
  pending: Withdrawal | null;
};

export const getWithdrawInfo = () => api<WithdrawInfo>('/api/host/withdraw');
export const savePayoutAccount = (p: { upiId: string; upiName: string; pan: string; panName: string }) =>
  api<{ account: PayoutAccount }>('/api/host/payout-account', { method: 'PUT', ...jsonBody(p) });
export const requestWithdraw = (beans: number) =>
  api<{ withdrawal: Withdrawal }>('/api/host/withdrawals', { method: 'POST', ...jsonBody({ beans }) });
export const getWithdrawals = () => api<{ items: Withdrawal[] }>('/api/host/withdrawals');


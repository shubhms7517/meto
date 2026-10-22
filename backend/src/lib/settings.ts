import { AppSetting } from '../models/Host.js';

// Owner ke admin panel se badalne wale number. DB me na ho to ye default chalte hain.
export const SETTING_DEFAULTS = {
  // Host ko poore gems milte hain. Withdraw pe: gems → beans → ₹ (rate sirf admin dekhta hai)
  gemsPerBean: 10, // host: 1 bean = kitne gems (sab hosts ka ek rate)
  beansPerInr: 10, // kitne beans = ₹1 (sirf admin ko dikhta hai)
  minWithdrawBeans: 5000, // host kam se kam itne beans nikale
  hostRates: [1000, 1500, 2000, 3000], // jaldi chunne ke chips (custom bhi chalta hai)
  hostRateDefault: 1000,
  hostRateMin: 500, // custom rate kam se kam
  hostRateStep: 100, // custom rate 100-100 karke
  hostRateOpenMax: 3000, // sabse zyada rate (host level nahi — seedha limit)
  matchRate: 1000, // Random match ki call ka rate (host ka apna rate nahi)
  vipCallDiscountPct: 10, // VIP user ko call kitni % sasti
  tdsPct: 1, // withdraw pe TDS % (CA se pakka karein)
  freeMessagesPerHost: 3, // har host ke saath itne message free
  messagePrice: 200, // uske baad gems per message (host ko utne points)
  vipFreeMessages: true, // VIP ke liye saari chat free
  freePhotos: 3, // host ki itni photo sabko free
  photoUnlockPrice: 200, // uske baad har photo kholne ke gems (host ko points)
  freeVideos: 1,
  videoUnlockPrice: 500,
  maxHostVideos: 5,
};
export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

const TTL_MS = 30_000;
let cache: { at: number; value: Settings } | null = null;

// MariaDB JSON ko text me lautata hai
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await AppSetting.findAll();
  const value = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in value) (value as Record<string, unknown>)[r.key] = parse(r.value);
  cache = { at: Date.now(), value };
  return value;
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  await AppSetting.upsert({ key, value });
  cache = null;
}

// Host ki rate range: admin ne us host ke liye di ho to wo, warna Settings wali.
// Settings ki limit hamesha upar rehti hai (range usse bahar nahi ja sakti).
export function hostRange(hp: { rateMin?: number | null; rateMax?: number | null } | null, s: Settings) {
  const own = hp?.rateMin != null && hp?.rateMax != null;
  const min = own ? Math.max(s.hostRateMin, hp!.rateMin!) : s.hostRateMin;
  const max = own ? Math.min(s.hostRateOpenMax, hp!.rateMax!) : s.hostRateOpenMax;
  if (min > max) return { min: s.hostRateMin, max: s.hostRateOpenMax, own: false };
  return { min, max, own };
}

// Admin ke hisaab ke liye: kitne gems = ₹1 (host/agency ko kabhi nahi dikhana)
export const gemsPerInr = (s: Settings) => s.gemsPerBean * s.beansPerInr;
// Host ke gems → beans (poore beans hi)
export const gemsToBeans = (gems: number, s: Settings) => Math.floor(gems / s.gemsPerBean);

// Agency commission: hosts ke gems ka % → gems, phir is agency ke rate se beans
export function agencyCommission(a: { commissionPct: number | string; gemsPerBean: number }, hostGems: number) {
  const gems = Math.floor((hostGems * Number(a.commissionPct)) / 100);
  return { gems, beans: Math.floor(gems / Math.max(1, a.gemsPerBean)) };
}

// User ko host ki call kitne gems/min padegi (VIP ko chhoot)
export function userRateFor(hostRate: number, isVip: boolean, s: Settings) {
  return isVip ? Math.round((hostRate * (100 - s.vipCallDiscountPct)) / 100) : hostRate;
}

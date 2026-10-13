import { AppSetting } from '../models/Host.js';

// Owner ke admin panel se badalne wale number. DB me na ho to ye default chalte hain.
export const SETTING_DEFAULTS = {
  hostPointsPerGem: 1, // user ke 1 gem par host ko kitne points
  pointsPerInr: 100, // 100 points = ₹1
  hostRates: [1000, 1500, 2000, 4000], // jaldi chunne ke chips (custom bhi chalta hai) · open max se upar wala 🔒
  hostRateDefault: 1000,
  hostRateMin: 500, // custom rate kam se kam
  hostRateStep: 100, // custom rate 100-100 karke
  hostRateOpenMax: 3000, // isse upar ka rate host level badhne par khulega
  matchRate: 1000, // Random match ki call ka rate (host ka apna rate nahi)
  vipCallDiscountPct: 10, // VIP user ko call kitni % sasti
  minWithdrawInr: 500,
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

// User ko host ki call kitne gems/min padegi (VIP ko chhoot)
export function userRateFor(hostRate: number, isVip: boolean, s: Settings) {
  return isVip ? Math.round((hostRate * (100 - s.vipCallDiscountPct)) / 100) : hostRate;
}

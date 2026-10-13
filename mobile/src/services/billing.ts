import { fetchProducts, finishTransaction, getAvailablePurchases, initConnection, purchaseErrorListener, purchaseUpdatedListener, requestPurchase, ErrorCode, type Purchase } from 'react-native-iap';
import { api } from './api';

/**
 * Google Play se kharidna. Product ID = server ka pack / VIP plan id (gems_10000, vip_1m …) —
 * Play Console me bilkul yahi ID ke "consumable" in-app products banane hain.
 * Paisa Google ke paas, gems hamesha server deta hai (token ki jaanch ke baad).
 */
export class PurchaseCancelled extends Error {
  code = 'cancelled';
  constructor() {
    super('Purchase cancelled');
  }
}

let ready: Promise<boolean> | null = null;
const connect = () => (ready ??= initConnection().catch(() => ((ready = null), false)));

// Server isi id se pakka karta hai ki purchase isi account ka hai
let accountId: string | null = null;
export const resetBillingAccount = () => {
  accountId = null;
};
async function myAccountId() {
  accountId ??= String((await api<{ user: { id: number } }>('/api/users/me')).user.id); // id = publicId
  return accountId;
}

const ERRORS: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.ItemUnavailable]: 'This pack is not available on Google Play right now',
  [ErrorCode.BillingUnavailable]: 'Google Play billing is not available on this phone',
  [ErrorCode.NetworkError]: 'No internet. Please try again',
  [ErrorCode.AlreadyOwned]: 'Your last purchase is still being processed. Please reopen the app',
  [ErrorCode.Pending]: 'Payment is pending. Gems will be added once it completes',
};

/** Play ka kharidne wala page kholo; payment poora hone par Purchase (token ke saath) */
export async function playPurchase(sku: string): Promise<Purchase> {
  if (!(await connect())) throw new Error('Google Play billing is not available on this phone');
  const [products, account] = await Promise.all([fetchProducts({ skus: [sku], type: 'in-app' }), myAccountId()]);
  if (!products?.length) throw new Error('This pack is not available on Google Play right now');

  return new Promise<Purchase>((resolve, reject) => {
    const done = () => {
      ok.remove();
      bad.remove();
    };
    const ok = purchaseUpdatedListener(p => {
      if (p.productId !== sku || !p.purchaseToken) return;
      done();
      resolve(p);
    });
    const bad = purchaseErrorListener(e => {
      done();
      reject(e.code === ErrorCode.UserCancelled ? new PurchaseCancelled() : new Error(ERRORS[e.code] ?? e.message ?? 'Payment failed'));
    });
    requestPurchase({ request: { google: { skus: [sku], obfuscatedAccountId: account } }, type: 'in-app' }).catch(e => {
      done();
      reject(e instanceof Error ? e : new Error('Payment failed'));
    });
  });
}

/** Server ne gems / VIP de diye → Play se purchase poora (consume — dobara kharid sakein) */
export const finishPlayPurchase = (p: Purchase) => finishTransaction({ purchase: p, isConsumable: true }).catch(() => {});

/**
 * App band ho gayi thi payment ke beech? Bache purchases server ko bhejo (server ek token ko ek hi baar maanta hai).
 * Google 3 din me finish na hua purchase wapas kar deta hai — isliye app khulte hi.
 */
export async function recoverPlayPurchases(deliver: (sku: string, token: string) => Promise<unknown>) {
  if (!(await connect())) return;
  const list = await getAvailablePurchases().catch(() => [] as Purchase[]);
  for (const p of list) {
    if (!p.purchaseToken) continue;
    try {
      await deliver(p.productId, p.purchaseToken);
      await finishPlayPurchase(p);
    } catch {
      // agli baar app khulne pe phir
    }
  }
}

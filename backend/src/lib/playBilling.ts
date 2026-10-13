import { GoogleAuth } from 'google-auth-library';
import { env } from '../config/env.js';
import { HttpError } from './errors.js';

/**
 * Google Play purchase ki asli jaanch (Play Developer API).
 * Service account ko Play Console → Users and permissions me "View financial data" + "Manage orders" chahiye.
 * Gems aur VIP dono "consumable" in-app products hain: gems dene ke baad consume (dobara kharid sakein).
 */
const auth = new GoogleAuth({
  keyFile: env.PLAY_SERVICE_ACCOUNT_PATH || env.FIREBASE_SERVICE_ACCOUNT_PATH,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const base = (productId: string, token: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.PLAY_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

type ProductPurchase = {
  purchaseState?: number; // 0 = kharida, 1 = cancel, 2 = pending
  consumptionState?: number; // 0 = abhi consume nahi, 1 = ho chuka
  obfuscatedExternalAccountId?: string;
  orderId?: string;
  purchaseType?: number; // 0 = test (license tester)
};

async function call<T>(url: string, method: 'GET' | 'POST'): Promise<T> {
  const client = await auth.getClient();
  try {
    const res = await client.request<T>({ url, method });
    return res.data;
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status;
    if (status === 400 || status === 404 || status === 410) throw new HttpError(402, 'purchase_invalid', 'This purchase could not be verified');
    console.error('play billing', (e as Error).message);
    throw new HttpError(503, 'billing_unavailable', 'Could not reach Google Play. Please try again');
  }
}

/** Token sach me isi product ka, paid, aur isi user ka hai? (account id = user.publicId, app kharidte waqt bhejta hai) */
export async function verifyPlayPurchase(productId: string, token: string, accountId: string) {
  const p = await call<ProductPurchase>(base(productId, token), 'GET');
  if (p.purchaseState === 2) throw new HttpError(402, 'purchase_pending', 'Payment is still pending. Gems will be added once it completes');
  if (p.purchaseState !== 0) throw new HttpError(402, 'purchase_invalid', 'This purchase was cancelled');
  if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== accountId)
    throw new HttpError(403, 'purchase_other_user', 'This purchase belongs to another account');
  return { orderId: p.orderId ?? null, test: p.purchaseType === 0, consumed: p.consumptionState === 1 };
}

/** Gems / VIP dene ke baad consume — tabhi user dobara wahi pack kharid sakta hai */
export async function consumePlayPurchase(productId: string, token: string) {
  await call<unknown>(`${base(productId, token)}:consume`, 'POST').catch(e => console.error('play consume', (e as Error).message));
}

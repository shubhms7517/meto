import { api, jsonBody } from './api';
import type { ChatMessage } from './chat';

export type Gift = { id: number; name: string; icon: string; price: number; isRare: boolean };

// Chat ke gift message ki body (server JSON bhejta hai)
export type GiftBody = { giftId: number; name: string; icon: string; price: number; qty: number; total: number };

export type GiftReceived = { gift: GiftBody; from: { id: number; name: string }; callId: number | null; messageId: number };

export const GIFT_QTYS = [1, 5, 10] as const;

let catalog: Gift[] | null = null;
export async function getGifts(): Promise<Gift[]> {
  if (catalog) return catalog;
  catalog = (await api<{ gifts: Gift[] }>('/api/gifts')).gifts;
  return catalog;
}

export const sendGift = (to: number, giftId: number, qty: number, clientId: string, callId?: number) =>
  api<{ message: ChatMessage; balance: number; gift: GiftBody }>('/api/gifts/send', {
    method: 'POST',
    ...jsonBody({ to, giftId, qty, clientId, callId }),
  });

export function parseGift(body: string): GiftBody | null {
  try {
    const g = JSON.parse(body);
    return g && typeof g.icon === 'string' ? g : null;
  } catch {
    return null;
  }
}

// Sheet ke tabs
const LOVE = new Set(['Rose', 'Love Heart', 'Lipstick', 'Heels', 'Ring', 'Lollipop']);
export const GIFT_TABS = [
  { key: 'popular', label: 'Popular', filter: (_g: Gift) => true },
  { key: 'love', label: 'Love', filter: (g: Gift) => LOVE.has(g.name) },
  { key: 'luxury', label: 'Luxury', filter: (g: Gift) => g.isRare || g.price >= 500 },
] as const;

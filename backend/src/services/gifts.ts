import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { Gift, GiftTransaction, User } from '../models/index.js';
import { findChatPartner, sendMessage } from './chat.js';
import { blockState } from './safety.js';
import { applyTx } from './wallet.js';
import { notifyLater } from './notifications.js';
import { assertUserHostPair, creditGift, requireHost } from './host.js';

export const GIFT_QTYS = [1, 5, 10] as const;

export const giftJSON = (g: Gift) => ({ id: g.id, name: g.name, icon: g.icon, price: g.price, isRare: g.isRare });

export async function giftCatalog() {
  const gifts = await Gift.findAll({ where: { isActive: true }, order: [['price', 'ASC']] });
  return gifts.map(giftJSON);
}

// Chat body me gift ki details (app isi se gift bubble banata hai)
export type GiftBody = { giftId: number; name: string; icon: string; price: number; qty: number; total: number };

/**
 * Gift bhejo: gems kato → record → chat me gift message → saamne wale ko animation event.
 * clientId: app ka id — network retry pe do baar na kate.
 */
export async function sendGift(sender: User, toPublicId: number, giftId: number, qty: number, clientId: string, callId?: number) {
  if (sender.status !== 'active') throw forbidden('account_restricted', 'Your account cannot send gifts');
  if (!(GIFT_QTYS as readonly number[]).includes(qty)) throw badRequest('Invalid quantity');
  const gift = await Gift.findByPk(giftId);
  if (!gift || !gift.isActive) throw notFound('Gift not found');
  const receiver = await findChatPartner(toPublicId, sender);
  const blocks = await blockState(sender.id, receiver.id);
  if (blocks.blockedByMe || blocks.blockedMe) throw forbidden('blocked', 'You can’t send gifts to this user');
  // Gift sirf user → host
  assertUserHostPair(sender, receiver);
  await requireHost(receiver);

  const total = gift.price * qty;
  const { tx, duplicate } = await applyTx(sender.id, -total, {
    kind: 'gift',
    title: `Gift · ${gift.name}${qty > 1 ? ` ×${qty}` : ''}`,
    subtitle: `to ${receiver.name ?? 'User'}`,
    uniqueKey: `gift:${sender.id}:${clientId}`,
    meta: { giftId: gift.id, qty, to: receiver.publicId, callId: callId ?? null },
  });

  if (!duplicate) await GiftTransaction.create({ senderId: sender.id, receiverId: receiver.id, giftId: gift.id, quantity: qty, totalPrice: total });
  // Host ke points (wallet tx ke key se — retry pe dobara nahi)
  await creditGift(receiver.id, total, `${sender.id}:${clientId}`, `${gift.name}${qty > 1 ? ` ×${qty}` : ''}`, sender.name ?? 'User');

  const body: GiftBody = { giftId: gift.id, name: gift.name, icon: gift.icon, price: gift.price, qty, total };
  const message = await sendMessage(sender, toPublicId, JSON.stringify(body), clientId, 'gift');

  if (!duplicate) {
    const event = { gift: body, from: sender.toCardJSON(), callId: callId ?? null, messageId: message.id };
    emitToUser(receiver.id, 'gift:received', event);
    notifyLater(receiver.id, 'gift', { actorId: sender.id, data: body, uniqueKey: `gift:${message.id}` });
  }
  return { message, balance: tx.balanceAfter, gift: body };
}

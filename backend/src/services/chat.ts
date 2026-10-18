import { Op } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { emitToUser, isConnected } from '../lib/realtime.js';
import { Call, Conversation, Message, User } from '../models/index.js';
import { blockState } from './safety.js';
import { applyHostTx, assertUserHostPair } from './host.js';
import { applyTx } from './wallet.js';
import { pushLater } from '../lib/push.js';
import { getSettings } from '../lib/settings.js';

export const MAX_MESSAGE_LENGTH = 1000;

export type MessageJSON = {
  id: number;
  conversationId: number;
  from: number; // public IDs (internal DB id kabhi bahar nahi)
  to: number;
  type: Message['type'];
  body: string;
  clientId: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
};

// DB id → public id map (ek baar me kai users)
export async function publicIds(ids: number[]): Promise<Map<number, number>> {
  const rows = await User.findAll({ where: { id: [...new Set(ids)] }, attributes: ['id', 'publicId'] });
  return new Map(rows.map(r => [r.id, r.publicId]));
}

export function messageJSON(m: Message, pub: Map<number, number>): MessageJSON {
  return {
    id: m.id,
    conversationId: m.conversationId,
    from: pub.get(m.senderId)!,
    to: pub.get(m.receiverId)!,
    type: m.type,
    body: m.body,
    clientId: m.clientId,
    createdAt: m.createdAt,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
  };
}

const pair = (a: number, b: number) => (a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a });

export async function findConversation(a: number, b: number) {
  return Conversation.findOne({ where: pair(a, b) });
}

// Sirf active, poori profile wala user hi message le sakta hai
export async function findChatPartner(publicId: number, me: User): Promise<User> {
  const user = await User.findOne({ where: { publicId, status: 'active', name: { [Op.ne]: null } } });
  if (!user) throw notFound('User not found');
  if (user.id === me.id) throw badRequest('You cannot message yourself');
  return user;
}

// User → host message ka daam: pehle N free, phir har message ke gems (VIP ke liye free — setting)
export type ChatPricing = { price: number; freeLimit: number; freeLeft: number; vipFree: boolean; vipOffer: boolean; paid: boolean };
export async function chatPricing(sender: User, receiver: User): Promise<ChatPricing | null> {
  if (sender.isHost || !receiver.isHost) return null; // host ka jawab hamesha free
  const s = await getSettings();
  const vipFree = s.vipFreeMessages && sender.isVip;
  const sent = await Message.count({ where: { senderId: sender.id, receiverId: receiver.id, type: ['text', 'image'] } });
  const freeLeft = Math.max(0, s.freeMessagesPerHost - sent);
  return { price: s.messagePrice, freeLimit: s.freeMessagesPerHost, freeLeft, vipFree, vipOffer: s.vipFreeMessages, paid: !vipFree && freeLeft === 0 && s.messagePrice > 0 };
}

/** Message save karo, conversation update karo, dono taraf live bhejo. */
export async function sendMessage(
  sender: User,
  toPublicId: number,
  rawBody: string,
  clientId: string | null,
  type: 'text' | 'image' | 'gift' = 'text',
): Promise<MessageJSON> {
  if (sender.status !== 'active') throw forbidden('account_restricted', 'Your account cannot send messages');
  const body = rawBody.trim();
  if (!body) throw badRequest('Message is empty');
  if (body.length > MAX_MESSAGE_LENGTH) throw badRequest(`Message is too long (max ${MAX_MESSAGE_LENGTH})`);

  const receiver = await findChatPartner(toPublicId, sender);
  const blocks = await blockState(sender.id, receiver.id);
  if (blocks.blockedByMe) throw forbidden('blocked', 'Unblock this user to send messages');
  if (blocks.blockedMe) throw forbidden('blocked', 'You can’t message this user');
  // Chat sirf user ↔ host (dono taraf se pehla message chal sakta hai)
  assertUserHostPair(sender, receiver);

  // Same clientId dobara aaya (network retry) → wahi purana message lautao
  if (clientId) {
    const existing = await Message.findOne({ where: { senderId: sender.id, clientId } });
    if (existing) return messageJSON(existing, new Map([[sender.id, sender.publicId], [receiver.id, receiver.publicId]]));
  }

  // Paid message: pehle gems kato (kam hon to InsufficientGems → app recharge dikhata hai)
  const pricing = type === 'gift' ? null : await chatPricing(sender, receiver);
  const payKey = pricing?.paid ? `msg:${sender.id}:${clientId ?? `${Date.now()}-${Math.random()}`}` : null;
  if (pricing?.paid)
    await applyTx(sender.id, -pricing.price, { kind: 'message', title: `Message · ${receiver.name ?? 'Host'}`, uniqueKey: payKey, meta: { to: receiver.publicId } });

  const msg = await sequelize.transaction(async transaction => {
    const [conv] = await Conversation.findOrCreate({ where: pair(sender.id, receiver.id), transaction });
    const m = await Message.create(
      {
        conversationId: conv.id,
        senderId: sender.id,
        receiverId: receiver.id,
        type,
        body,
        clientId,
        // Receiver ka app abhi juda hai to turant "pahuncha"
        deliveredAt: isConnected(receiver.id) ? new Date() : null,
        readAt: null,
      },
      { transaction },
    );
    await conv.update({ lastMessageId: m.id, lastMessageAt: m.createdAt }, { transaction });
    return m;
  });

  // Host ko message ke points
  if (pricing?.paid) {
    const s = await getSettings();
    await applyHostTx(receiver.id, Math.floor(pricing.price * s.hostPointsPerGem), { kind: 'message', title: `Message · ${sender.name ?? 'User'}`, uniqueKey: payKey }).catch(e =>
      console.error('host msg credit', e),
    );
  }

  const json = messageJSON(msg, new Map([[sender.id, sender.publicId], [receiver.id, receiver.publicId]]));
  emitToUser(receiver.id, 'message:new', json);
  if (!isConnected(receiver.id) && receiver.settings.pushMessages)
    pushLater(receiver.id, {
      notification: { title: sender.name ?? 'New message', body: type === 'image' ? '📷 Photo' : type === 'gift' ? '🎁 Sent you a gift' : body.slice(0, 120) },
      data: { type: 'message', from: String(sender.publicId), name: sender.name ?? '' },
      channel: 'messages',
      ttlSec: 24 * 3600,
    });
  emitToUser(sender.id, 'message:new', json); // sender ke doosre devices ke liye
  return json;
}

/** Conversation ke saare unread messages "padh liye" — sender ko blue ✓✓ */
export async function markRead(conversationId: number, me: User): Promise<void> {
  const conv = await Conversation.findByPk(conversationId);
  if (!conv || (conv.userLowId !== me.id && conv.userHighId !== me.id)) throw notFound('Chat not found');

  const now = new Date();
  const [count] = await Message.update(
    { readAt: now, deliveredAt: now },
    { where: { conversationId, receiverId: me.id, readAt: null } },
  );
  if (count > 0) {
    const otherId = conv.otherUserId(me.id);
    emitToUser(otherId, 'message:read', { conversationId, readAt: now, by: me.publicId });
    emitToUser(me.id, 'conversation:read', { conversationId });
  }
}

/** App connect hua → jo messages offline me aaye the wo ab "pahunch gaye" (✓✓ grey) */
export async function markDeliveredOnConnect(me: User): Promise<void> {
  const pending = await Message.findAll({
    where: { receiverId: me.id, deliveredAt: null },
    attributes: ['id', 'conversationId', 'senderId'],
    limit: 500,
  });
  if (pending.length === 0) return;
  const now = new Date();
  await Message.update({ deliveredAt: now }, { where: { id: pending.map(m => m.id) } });

  // Har sender ko batao (conversation ke hisaab se)
  const bySender = new Map<number, Set<number>>();
  for (const m of pending) {
    if (!bySender.has(m.senderId)) bySender.set(m.senderId, new Set());
    bySender.get(m.senderId)!.add(m.conversationId);
  }
  for (const [senderId, convs] of bySender) {
    for (const conversationId of convs) emitToUser(senderId, 'message:delivered', { conversationId, deliveredAt: now });
  }
}

/**
 * Call khatam → chat me ek chhota record ("Video call · 5 min", "Missed call", "No answer").
 * body = JSON { s: status, d: seconds }. Caller ki taraf se; missed / no answer callee ke liye unread.
 */
export async function postCallRecord(call: { id: number; callerId: number; calleeId: number; status: string; durationSec: number; answeredAt: Date | null }) {
  if (!['ended', 'missed', 'declined', 'cancelled'].includes(call.status)) return;
  const [caller, callee] = await Promise.all([User.findByPk(call.callerId), User.findByPk(call.calleeId)]);
  if (!caller || !callee) return;
  const blocks = await blockState(caller.id, callee.id);
  if (blocks.blockedByMe || blocks.blockedMe) return;
  const status = call.status === 'ended' && !call.answeredAt ? 'cancelled' : call.status;
  const now = new Date();
  const msg = await sequelize.transaction(async transaction => {
    const [conv] = await Conversation.findOrCreate({ where: pair(caller.id, callee.id), transaction });
    const m = await Message.create(
      {
        conversationId: conv.id,
        senderId: caller.id,
        receiverId: callee.id,
        type: 'call',
        body: JSON.stringify({ s: status, d: call.durationSec }),
        clientId: `call:${call.id}`,
        deliveredAt: now,
        // Baat hui / mana kiya → dono ko pata hai. Missed / no answer → callee ke liye naya
        readAt: status === 'ended' || status === 'declined' ? now : null,
      },
      { transaction },
    );
    await conv.update({ lastMessageId: m.id, lastMessageAt: m.createdAt }, { transaction });
    return m;
  });
  const json = messageJSON(msg, new Map([[caller.id, caller.publicId], [callee.id, callee.publicId]]));
  emitToUser(callee.id, 'message:new', json);
  emitToUser(caller.id, 'message:new', json);
}

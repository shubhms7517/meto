import { badRequest, notFound } from '../lib/errors.js';
import { pushLater } from '../lib/push.js';
import { emitToUser } from '../lib/realtime.js';
import { SupportMessage, SupportTicket, type SupportTopic } from '../models/index.js';

const msgJSON = (m: SupportMessage) => ({ id: m.id, fromTeam: m.fromTeam, body: m.body, imageUrl: m.imageUrl, createdAt: m.createdAt });
const ticketJSON = (t: SupportTicket) => ({ id: t.id, topic: t.topic, status: t.status, unread: t.userUnread, lastMessageAt: t.lastMessageAt });

const latestTicket = (userId: number) => SupportTicket.findOne({ where: { userId }, order: [['id', 'DESC']] });

// Customer service page: aakhri baat-cheet + uska aakhri message (naye jawab ki ginti)
export async function supportSummary(userId: number) {
  const t = await latestTicket(userId);
  if (!t) return { ticket: null, last: null };
  const last = await SupportMessage.findOne({ where: { ticketId: t.id }, order: [['id', 'DESC']] });
  return { ticket: ticketJSON(t), last: last ? msgJSON(last) : null };
}

// Chat khuli → saare message, aur team ke jawab "dekh liye"
export async function supportThread(userId: number) {
  const t = await latestTicket(userId);
  if (!t) return { ticket: null, messages: [] };
  const messages = await SupportMessage.findAll({ where: { ticketId: t.id }, order: [['id', 'ASC']], limit: 500 });
  if (t.userUnread) await t.update({ userUnread: 0 });
  return { ticket: ticketJSON(t), messages: messages.map(msgJSON) };
}

// User ka message. Khuli baat-cheet na ho (ya solved ho) to topic ke saath nayi
export async function sendSupportMessage(userId: number, p: { topic?: SupportTopic; body?: string; imageUrl?: string }) {
  const body = p.body?.trim() || null;
  if (!body && !p.imageUrl) throw badRequest('Please type a message');
  let t = await latestTicket(userId);
  const now = new Date();
  if (!t || t.status === 'solved') {
    if (!p.topic) throw badRequest('Please choose a topic');
    t = await SupportTicket.create({ userId, topic: p.topic, lastMessageAt: now });
  } else {
    await t.update({ lastMessageAt: now });
  }
  const m = await SupportMessage.create({ ticketId: t.id, fromTeam: false, body, imageUrl: p.imageUrl ?? null });
  return { ticket: ticketJSON(t), message: msgJSON(m) };
}

// Team ka jawab (abhi dev route, baad me admin panel) → socket + push
export async function replySupport(ticketId: number, body: string, solve = false) {
  const t = await SupportTicket.findByPk(ticketId);
  if (!t) throw notFound('Ticket not found');
  const m = await SupportMessage.create({ ticketId: t.id, fromTeam: true, body: body.trim(), imageUrl: null });
  await t.update({ userUnread: t.userUnread + 1, lastMessageAt: new Date(), ...(solve ? { status: 'solved' as const } : {}) });
  const payload = { ticket: ticketJSON(t), message: msgJSON(m) };
  emitToUser(t.userId, 'support:message', payload);
  pushLater(t.userId, {
    data: { type: 'support', ticketId: String(t.id) },
    notification: { title: 'Meto Support', body: m.body!.slice(0, 120) },
    ttlSec: 24 * 3600,
  });
  return payload;
}

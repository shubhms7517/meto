import { Op, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { isConnected } from '../lib/realtime.js';
import { pushLater } from '../lib/push.js';
import { emitToUser } from '../lib/realtime.js';
import { CheckIn, Follow, Notification, User } from '../models/index.js';
import type { NotifType } from '../models/Notification.js';

export const NOTIF_TABS = {
  all: null,
  calls: ['call_missed'],
  gifts: ['gift'],
  follows: ['follow'],
  meto: ['level_up', 'recharge', 'vip', 'notice', 'checkin', 'vip_ending', 'report'],
} as const;
export type NotifTab = keyof typeof NOTIF_TABS;

async function toJSON(n: Notification, actors?: Map<number, User>) {
  const actor = n.actorId ? (actors?.get(n.actorId) ?? (await User.findByPk(n.actorId))) : null;
  return {
    id: n.id,
    type: n.type,
    data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
    actor: actor ? actor.toCardJSON() : null,
    read: !!n.readAt,
    createdAt: n.createdAt,
  };
}

export const unreadCount = (userId: number) => Notification.count({ where: { userId, readAt: null } });

/** Notification banao + app khula ho to turant bhejo. uniqueKey se ek event ek hi baar. */
export async function notify(userId: number, type: NotifType, opts: { actorId?: number | null; data?: Record<string, unknown>; uniqueKey?: string } = {}) {
  if (opts.actorId && opts.actorId === userId) return;
  try {
    const n = await Notification.create({ userId, type, actorId: opts.actorId ?? null, data: opts.data ?? null, uniqueKey: opts.uniqueKey ?? null, readAt: null });
    emitToUser(userId, 'notification:new', { notification: await toJSON(n), unread: await unreadCount(userId) });
    if (!isConnected(userId)) await pushFor(userId, type, opts).catch(() => {});
  } catch (e) {
    if (e instanceof UniqueConstraintError) return; // pehle ban chuki
    console.error('notify failed', e);
  }
}

// App band ho to phone pe notification — Settings ke switch ke hisaab se
async function pushFor(userId: number, type: NotifType, opts: { actorId?: number | null; data?: Record<string, unknown> }) {
  const user = await User.findByPk(userId);
  if (!user) return;
  const p = user.settings;
  const actor = opts.actorId ? await User.findByPk(opts.actorId) : null;
  const name = actor?.name ?? 'Someone';
  const d = (opts.data ?? {}) as Record<string, unknown>;
  let note: { title: string; body: string } | null = null;
  if (type === 'call_missed' && p.pushMissedCalls) note = { title: 'Missed video call', body: `${name} called you` };
  else if (type === 'gift' && p.pushGifts) note = { title: `${name} sent you a gift ${d.icon ?? '🎁'}`, body: String(d.name ?? 'Gift') };
  else if (type === 'notice') note = { title: String(d.title ?? 'Meto'), body: String(d.body ?? '') };
  if (note) pushLater(userId, { notification: note, data: { type: 'notif', kind: type }, channel: 'messages', ttlSec: 24 * 3600 });
}

// Fire-and-forget (asli kaam rukna nahi chahiye)
export const notifyLater = (...a: Parameters<typeof notify>) => void notify(...a).catch(() => {});

const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

// Yaad dilane wale (asli haalat dekh ke): aaj check-in baaki / VIP 3 din me khatam
async function reminders(user: User) {
  const today = istDay();
  const claimed = await CheckIn.findOne({ where: { userId: user.id, day: today } });
  if (!claimed) await notify(user.id, 'checkin', { uniqueKey: `checkin:${user.id}:${today}` });
  if (user.isVip && user.vipUntil && user.vipUntil.getTime() - Date.now() < 3 * 86_400_000) {
    await notify(user.id, 'vip_ending', { data: { until: user.vipUntil }, uniqueKey: `vipend:${user.id}:${user.vipUntil.toISOString()}` });
  }
}

export async function listNotifications(user: User, tab: NotifTab, before?: number) {
  if (!before) await reminders(user);
  const where: WhereOptions = { userId: user.id };
  const types = NOTIF_TABS[tab];
  if (types) Object.assign(where, { type: { [Op.in]: types } });
  if (before) Object.assign(where, { id: { [Op.lt]: before } });
  const rows = await Notification.findAll({ where, order: [['id', 'DESC']], limit: 30 });
  const ids = [...new Set(rows.map(r => r.actorId).filter((x): x is number => !!x))];
  const actors = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map(u => [u.id, u]));

  // Har tab ka unread (chips pe ginti)
  const counts = await Notification.findAll({ where: { userId: user.id, readAt: null }, attributes: ['type'], raw: true });
  const unread: Record<NotifTab, number> = { all: counts.length, calls: 0, gifts: 0, follows: 0, meto: 0 };
  for (const c of counts) for (const t of ['calls', 'gifts', 'follows', 'meto'] as const) if ((NOTIF_TABS[t] as readonly string[]).includes(c.type)) unread[t]++;

  // Follow wali notification pe "Follow back" tabhi jab maine follow nahi kiya
  const followIds = rows.filter(r => r.type === 'follow' && r.actorId).map(r => r.actorId!);
  const iFollow = new Set(
    (followIds.length ? await Follow.findAll({ where: { followerId: user.id, followingId: followIds }, attributes: ['followingId'] }) : []).map(f => f.followingId),
  );
  return {
    items: await Promise.all(rows.map(async r => ({ ...(await toJSON(r, actors)), iFollow: r.actorId ? iFollow.has(r.actorId) : false }))),
    nextBefore: rows.length === 30 ? rows[rows.length - 1].id : null,
    unread,
  };
}

export async function markRead(userId: number, ids?: number[]) {
  const where: WhereOptions = { userId, readAt: null };
  if (ids?.length) Object.assign(where, { id: ids });
  await Notification.update({ readAt: new Date() }, { where });
  emitToUser(userId, 'notification:unread', { unread: await unreadCount(userId) });
}

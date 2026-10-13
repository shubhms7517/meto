import { randomUUID } from 'node:crypto';
import agoraToken from 'agora-token';
import { Op } from 'sequelize';
import { env } from '../config/env.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { Call, HostTx, User } from '../models/index.js';
import type { CallStatus } from '../models/Call.js';
import { findChatPartner } from './chat.js';
import { blockState } from './safety.js';
import { CALL_RATE } from '../lib/pricing.js';
import { getSettings, userRateFor } from '../lib/settings.js';
import { assertUserHostPair, creditCallUpTo, requireHost } from './host.js';
import { pushLater } from '../lib/push.js';
import { applyTx, balanceOf, chargeCallUpTo, InsufficientGems } from './wallet.js';
import { busyUsers } from '../lib/presence.js';
import { notifyLater } from './notifications.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;

export const RING_TIMEOUT_MS = 30_000;
export const DEFAULT_RATE = CALL_RATE;
const MINUTE_MS = 60_000;
const TOKEN_TTL_SEC = 2 * 60 * 60; // 2 ghante
const MAX_CALL_MS = 3 * 60 * 60_000; // 3 ghante se lambi call apne aap band (app crash ho gayi ho to)

// Match se mili host: userId → { hostId, until }. Match ki call sirf usi host ko fix rate pe.
// Jab tak Match screen pe wahi host dikh rahi hai, wahi rate milna chahiye — isliye lamba samay (agla match aate hi badal jaata hai)
const MATCH_OFFER_MS = 60 * 60_000;
const matchOffers = new Map<number, { hostId: number; until: number }>();
export function offerMatch(userId: number, hostId: number) {
  matchOffers.set(userId, { hostId, until: Date.now() + MATCH_OFFER_MS });
}

const ringTimers = new Map<number, ReturnType<typeof setTimeout>>();
const billTimers = new Map<number, ReturnType<typeof setTimeout>>();
const LIVE: CallStatus[] = ['ringing', 'accepted'];

export const agoraConfigured = () => !!(env.AGORA_APP_ID && env.AGORA_APP_CERTIFICATE);

// Agora uid = user ka public id (9 digit, uint32 me fit)
function joinInfo(call: Call, user: User) {
  const expire = TOKEN_TTL_SEC;
  return {
    appId: env.AGORA_APP_ID,
    channel: call.channel,
    uid: user.publicId,
    token: RtcTokenBuilder.buildTokenWithUid(env.AGORA_APP_ID, env.AGORA_APP_CERTIFICATE, call.channel, user.publicId, RtcRole.PUBLISHER, expire, expire),
  };
}

export async function callJSON(call: Call, users?: Map<number, User>) {
  const map = users ?? new Map((await User.findAll({ where: { id: [call.callerId, call.calleeId] } })).map(u => [u.id, u]));
  return {
    id: call.id,
    status: call.status,
    rate: call.rate,
    hostId: map.get(hostOf(call))?.publicId ?? null, // app: main host hoon ya user
    coinsCharged: call.coinsCharged,
    durationSec: call.durationSec,
    createdAt: call.createdAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    rating: call.rating,
    caller: map.get(call.callerId)!.toCardJSON(),
    callee: map.get(call.calleeId)!.toCardJSON(),
  };
}

const busyWith = (userId: number) =>
  Call.findOne({ where: { status: LIVE, [Op.or]: [{ callerId: userId }, { calleeId: userId }] } });

export type EndReason = 'no_gems' | 'dropped';

// Call me host aur paise dene wala (user). Call user lagaye ya host — paisa hamesha user deta hai
const hostOf = (c: Call) => Number(c.hostId ?? c.calleeId);
const payerOf = (c: Call) => (hostOf(c) === Number(c.callerId) ? Number(c.calleeId) : Number(c.callerId));

const END_GRACE_MS = 2000; // minute badalte hi kaata (jaise 1:00.5) to agla minute nahi ginte

/**
 * Call ka hisaab (minute shuru hote hi pehle kat chuka hota hai):
 * - User ne kaati / balance khatam → jitne minute shuru hue sab ke paise, sab host ko
 * - Host ne kaati / net gaya → sirf poore hue minute (5:10 = 5 min), baaki user ko wapas
 * Jitne gems user ke kate, utne hi points host ko — owner ko call se kuch nahi
 */
export async function settleCall(call: Call, reason?: EndReason) {
  if (!call.answeredAt || !call.endedAt || call.coinsCharged <= 0) return;
  const ms = call.endedAt.getTime() - call.answeredAt.getTime();
  const userCut = reason === 'no_gems' || (reason !== 'dropped' && call.endedBy === payerOf(call));
  const minutes = userCut ? Math.max(1, Math.ceil((ms - END_GRACE_MS) / MINUTE_MS)) : Math.floor(ms / MINUTE_MS);
  const [payer, host] = await Promise.all([User.findByPk(payerOf(call)), User.findByPk(hostOf(call))]);
  const back = reason === 'no_gems' ? 0 : call.coinsCharged - minutes * call.rate;
  if (back > 0) {
    await applyTx(payerOf(call), back, {
      kind: 'refund',
      title: 'Call refund',
      subtitle: `${host?.name ?? 'Host'} · unused minute`,
      uniqueKey: `callrefund:${call.id}`,
    });
    await call.update({ coinsCharged: call.coinsCharged - back });
  }
  if (host?.isHost && call.coinsCharged > 0)
    await creditCallUpTo(host.id, call.id, call.coinsCharged, Math.round(call.coinsCharged / call.rate), payer?.name ?? 'User');
}

// Host (callee) ke liye call ke saath uski kamai
async function withHostPoints<T extends object>(call: Call, json: T) {
  const earned = await HostTx.findOne({ where: { uniqueKey: `call:${call.id}` } });
  return { ...json, hostPoints: earned?.points ?? 0 };
}

// Doosre ne pehle hi band kar di ho tab bhi host ko uski kamai wala jawab
const viewFor = async (call: Call, me: User) => (hostOf(call) === me.id ? withHostPoints(call, await callJSON(call)) : callJSON(call));

async function finish(call: Call, status: CallStatus, endedBy: number | null, reason?: EndReason) {
  clearTimeout(ringTimers.get(call.id));
  ringTimers.delete(call.id);
  stopBilling(call.id);
  busyUsers.delete(call.callerId);
  busyUsers.delete(call.calleeId);
  const now = new Date();
  const durationSec = call.answeredAt ? Math.max(0, Math.round((now.getTime() - call.answeredAt.getTime()) / 1000)) : 0;
  await call.update({ status, endedAt: now, durationSec, endedBy });
  await settleCall(call, reason).catch(e => console.error('call settle', e));
  const json = { ...(await callJSON(call)), reason: reason ?? null };
  // Host ko uski kamai (points) — sirf usi ko, user ko nahi dikhti
  const hostJson = await withHostPoints(call, json);
  emitToUser(payerOf(call), 'call:ended', json);
  emitToUser(hostOf(call), 'call:ended', hostJson);
  // Jisne nahi uthaya use missed call ki notification
  if (status === 'missed') notifyLater(call.calleeId, 'call_missed', { actorId: call.callerId, data: { callId: call.id }, uniqueKey: `missed:${call.id}` });
  // Bajti ghanti wali notification hata do (cancel / missed / decline)
  if (!call.answeredAt) pushLater(call.calleeId, { data: { type: 'call_end', callId: String(call.id) } });

  return endedBy === hostOf(call) ? hostJson : json;
}

// ---- Billing: caller ke gems — pehla minute uthate hi, phir har minute ki shuruaat me ----

function stopBilling(callId: number) {
  clearTimeout(billTimers.get(callId));
  billTimers.delete(callId);
}

const minuteDue = (call: Call, at = Date.now()) => Math.floor((at - call.answeredAt!.getTime()) / MINUTE_MS) + 1;

function scheduleNext(call: Call, minute: number) {
  stopBilling(call.id);
  const at = call.answeredAt!.getTime() + minute * MINUTE_MS; // minute+1 ki shuruaat
  billTimers.set(call.id, setTimeout(() => billCall(call.id).catch(e => console.error('billing', e)), Math.max(0, at - Date.now())));
}

async function charge(call: Call, minute: number) {
  const host = await User.findByPk(hostOf(call));
  const r = await chargeCallUpTo(payerOf(call), call.id, call.rate, minute, host?.name ?? 'Host');
  if (r.total !== call.coinsCharged) await call.update({ coinsCharged: r.total });
  // Host ki kamai call khatam hone pe (settleCall) — kisne kaati uske hisaab se
  emitToUser(payerOf(call), 'call:billing', {
    callId: call.id,
    minute,
    charged: r.total,
    balance: r.balance,
    minutesLeft: Math.floor(r.balance / call.rate), // aur kitne poore minute bache
  });
}

async function billCall(callId: number) {
  const call = await Call.findByPk(callId);
  if (!call || call.status !== 'accepted' || !call.answeredAt) return stopBilling(callId);
  const minute = minuteDue(call);
  try {
    await charge(call, minute);
    scheduleNext(call, minute);
  } catch (e) {
    if (e instanceof InsufficientGems) {
      await finish(call, 'ended', null, 'no_gems');
      return;
    }
    console.error('💥 call billing failed, retrying', e);
    billTimers.set(callId, setTimeout(() => billCall(callId).catch(() => {}), 5000));
  }
}

async function myCall(id: number, me: User) {
  const call = await Call.findByPk(id);
  if (!call || (call.callerId !== me.id && call.calleeId !== me.id)) throw notFound('Call not found');
  return call;
}

/** Call lagao: callee ko "call:incoming", 30 sec me na uthaya to missed */
export async function startCall(me: User, toPublicId: number, source: 'direct' | 'match' = 'direct') {
  if (!agoraConfigured()) throw new HttpError(503, 'calls_not_configured', 'Video calls are not set up yet');
  if (me.status !== 'active') throw forbidden('account_restricted', 'Your account cannot make calls');
  const callee = await findChatPartner(toPublicId, me);
  const blocks = await blockState(me.id, callee.id);
  if (blocks.blockedByMe) throw forbidden('blocked', 'Unblock this user to call');
  if (blocks.blockedMe) throw forbidden('blocked', 'You can’t call this user');

  // Call sirf user ↔ host (users aapas me / hosts aapas me nahi). User lagaye ya host — paisa user deta hai
  assertUserHostPair(me, callee);
  const hostUser = me.isHost ? me : callee;
  const payer = me.isHost ? callee : me;
  const host = await requireHost(hostUser);
  if (me.isHost && !callee.settings.hostCanCall) throw forbidden('calls_off', `${callee.name ?? 'This user'} doesn’t take calls from hosts`);
  if (!me.isHost && !host.available) throw new HttpError(409, 'host_offline', `${callee.name ?? 'She'} is offline right now`);

  // Kam se kam 1 minute ke gems chahiye — host ka rate (Match: fix rate), VIP ko chhoot
  const settings = await getSettings();
  const offer = matchOffers.get(me.id);
  const fromMatch = !me.isHost && source === 'match' && !!offer && offer.hostId === callee.id && offer.until > Date.now();
  // Match ka rate dikhaya tha par ab nahi mil sakta → call hi nahi (chupke se mehnga rate kabhi nahi)
  if (source === 'match' && !fromMatch) throw new HttpError(409, 'match_expired', 'This match has expired. Please find a new match');
  const rate = userRateFor(fromMatch ? settings.matchRate : host.rate, payer.isVip, settings);
  const balance = await balanceOf(payer.id);
  if (balance < rate) {
    if (me.isHost) throw new HttpError(409, 'user_low_gems', `${callee.name ?? 'This user'} doesn’t have enough gems for a call right now`);
    throw new InsufficientGems(balance, rate);
  }

  // Meri koi purani atki call ho to band (app crash ke baad)
  const mine = await busyWith(me.id);
  if (mine) await finish(mine, mine.status === 'accepted' ? 'ended' : 'cancelled', me.id);

  const channel = `meto_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const theirs = await busyWith(callee.id);
  if (theirs) {
    // Busy bhi call log me (dono ko dikhe)
    const busy = await Call.create({ callerId: me.id, calleeId: callee.id, hostId: hostUser.id, channel, status: 'busy', rate, answeredAt: null, endedAt: new Date(), endedBy: null, rating: null });
    return { call: await callJSON(busy), join: null };
  }

  const call = await Call.create({ callerId: me.id, calleeId: callee.id, hostId: hostUser.id, channel, rate, answeredAt: null, endedAt: null, endedBy: null, rating: null });
  const json = await callJSON(call, new Map([[me.id, me], [callee.id, callee]]));
  emitToUser(callee.id, 'call:incoming', json);
  // App band / background ho to bhi ghanti (poori screen pe)
  pushLater(callee.id, {
    data: { type: 'call', callId: String(call.id), name: me.name ?? 'Someone', avatar: me.avatarUrl ?? '', from: String(me.publicId) },
    ttlSec: Math.round(RING_TIMEOUT_MS / 1000),
  });

  ringTimers.set(
    call.id,
    setTimeout(async () => {
      const fresh = await Call.findByPk(call.id);
      if (fresh?.status === 'ringing') await finish(fresh, 'missed', null);
    }, RING_TIMEOUT_MS),
  );
  // Caller ko token turant — wo ringing ke dauraan camera preview dikha sakta hai, join accept ke baad
  return { call: json, join: joinInfo(call, me) };
}

export async function acceptCall(me: User, id: number) {
  const call = await myCall(id, me);
  if (call.calleeId !== me.id) throw badRequest('Only the receiver can accept');
  if (call.status !== 'ringing') throw new HttpError(409, 'call_over', 'This call has ended');
  clearTimeout(ringTimers.get(call.id));
  ringTimers.delete(call.id);
  await call.update({ status: 'accepted', answeredAt: new Date() });
  // Pehla minute abhi kaato — caller ke gems beech me khatam ho gaye ho to call nahi judegi
  try {
    await charge(call, 1);
  } catch (e) {
    if (e instanceof InsufficientGems) {
      await finish(call, 'ended', null, 'no_gems');
      // Host ne call kiya tha aur uthane wale user ke gems kam → user ko recharge dikhao
      if (payerOf(call) === me.id) throw e;
      throw new HttpError(409, 'call_over', 'This call has ended');
    }
    throw e;
  }
  scheduleNext(call, 1);
  busyUsers.add(call.callerId);
  busyUsers.add(call.calleeId);
  const json = await callJSON(call);
  emitToUser(call.callerId, 'call:accepted', json);
  emitToUser(call.calleeId, 'call:accepted', json); // callee ke doosre devices pe ghanti band
  return { call: json, join: joinInfo(call, me) };
}

export async function declineCall(me: User, id: number) {
  const call = await myCall(id, me);
  if (call.status !== 'ringing') return viewFor(call, me);
  return finish(call, call.calleeId === me.id ? 'declined' : 'cancelled', me.id);
}

export async function endCall(me: User, id: number) {
  const call = await myCall(id, me);
  if (call.status === 'ringing') return finish(call, call.calleeId === me.id ? 'declined' : 'cancelled', me.id);
  if (call.status !== 'accepted') return viewFor(call, me);
  return finish(call, 'ended', me.id);
}

export async function rateCall(me: User, id: number, stars: number) {
  const call = await myCall(id, me);
  if (payerOf(call) !== me.id || call.status !== 'ended') throw badRequest('You can’t rate this call');
  await call.update({ rating: stars });
}

/**
 * User ka app server se kat gaya (app band / net gaya / phone off).
 * 25 sec me wapas na aaye to uski chalti / bajti call band — doosre phone pe call atki na rahe.
 */
const GONE_GRACE_MS = 25_000;
export function onUserDisconnected(userId: number, stillConnected: () => boolean) {
  setTimeout(async () => {
    if (stillConnected()) return;
    const live = await Call.findAll({ where: { status: LIVE, [Op.or]: [{ callerId: userId }, { calleeId: userId }] } });
    for (const c of live) {
      const status: CallStatus = c.status === 'accepted' ? 'ended' : c.callerId === userId ? 'cancelled' : 'missed';
      await finish(c, status, userId, 'dropped');
    }
  }, GONE_GRACE_MS);
}

/** Server restart / app crash ke baad atki calls saaf */
export async function sweepStaleCalls() {
  const now = Date.now();
  const stale = await Call.findAll({
    where: {
      [Op.or]: [
        { status: 'ringing', createdAt: { [Op.lt]: new Date(now - RING_TIMEOUT_MS - 5000) } },
        { status: 'accepted', answeredAt: { [Op.lt]: new Date(now - MAX_CALL_MS) } },
      ],
    },
  });
  for (const c of stale) await finish(c, c.status === 'ringing' ? 'missed' : 'ended', null, c.status === 'ringing' ? undefined : 'dropped');

  // Server restart ke baad chalti calls ki billing dobara chalu (beech ke minute bhi kat jayenge)
  const live = await Call.findAll({ where: { status: 'accepted' } });
  for (const c of live) {
    busyUsers.add(c.callerId);
    busyUsers.add(c.calleeId);
    if (!billTimers.has(c.id)) await billCall(c.id);
  }
}

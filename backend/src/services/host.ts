import { col, fn, Op, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { getSettings, hostRange } from '../lib/settings.js';
import { Agency, Call, HostProfile, HostTx, HostWallet, User } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { savePrivateImage, savePrivateVideo } from '../lib/upload.js';
import { notifyLater } from './notifications.js';
import type { HostTxKind } from '../models/Host.js';

type Entry = { kind: HostTxKind; title: string; subtitle?: string | null; uniqueKey?: string | null; meta?: Record<string, unknown> | null };

async function lockWallet(userId: number, t: Transaction) {
  await HostWallet.findOrCreate({ where: { userId }, defaults: { userId }, transaction: t });
  return (await HostWallet.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE }))!;
}

const notify = (userId: number, points: number) => emitToUser(userId, 'host:points', { points });

// Host ke points jodo (+) ya ghatao (−). uniqueKey diya ho to dobara nahi judega.
export async function applyHostTx(userId: number, points: number, e: Entry): Promise<HostTx> {
  const dup = e.uniqueKey ? await HostTx.findOne({ where: { uniqueKey: e.uniqueKey } }) : null;
  if (dup) return dup;
  try {
    const tx = await sequelize.transaction(async t => {
      const w = await lockWallet(userId, t);
      const next = Number(w.points) + points;
      if (next < 0) throw badRequest('Not enough points');
      w.points = next;
      if (points > 0 && e.kind !== 'refund') w.totalEarned = Number(w.totalEarned) + points;
      await w.save({ transaction: t });
      return HostTx.create(
        { userId, kind: e.kind, points, balanceAfter: next, title: e.title, subtitle: e.subtitle ?? null, uniqueKey: e.uniqueKey ?? null, meta: e.meta ?? null },
        { transaction: t },
      );
    });
    notify(userId, tx.balanceAfter);
    return tx;
  } catch (err) {
    if (err instanceof UniqueConstraintError && e.uniqueKey) {
      const d = await HostTx.findOne({ where: { uniqueKey: e.uniqueKey } });
      if (d) return d;
    }
    throw err;
  }
}

// Call ki kamai: har call ki ek hi line, jo har minute badhti hai (user ke kate gems ke hisaab se)
export async function creditCallUpTo(hostId: number, callId: number, gemsCharged: number, minutes: number, peerName: string) {
  const target = Math.floor(gemsCharged); // host ko poore gems
  const uniqueKey = `call:${callId}`;
  const r = await sequelize.transaction(async t => {
    const w = await lockWallet(hostId, t);
    const tx = await HostTx.findOne({ where: { uniqueKey }, transaction: t, lock: t.LOCK.UPDATE });
    const due = target - (tx?.points ?? 0);
    if (due <= 0) return null;
    w.points = Number(w.points) + due;
    w.totalEarned = Number(w.totalEarned) + due;
    await w.save({ transaction: t });
    const fields = { points: target, balanceAfter: w.points, subtitle: `${minutes} min`, meta: { callId, minutes, gems: gemsCharged } };
    if (tx) await tx.update(fields, { transaction: t });
    else await HostTx.create({ userId: hostId, kind: 'call', title: `Video call · ${peerName}`, uniqueKey, ...fields }, { transaction: t });
    return w.points;
  });
  if (r != null) notify(hostId, r);
}

export async function creditGift(hostId: number, gems: number, key: string, giftName: string, fromName: string) {
  return applyHostTx(hostId, Math.floor(gems), {
    kind: 'gift',
    title: `Gift · ${giftName}`,
    subtitle: `from ${fromName}`,
    uniqueKey: `gift:${key}`,
  });
}

// Host sirf ladki ban sakti hai (gender signup ke baad lock hai)
export const HOST_GENDER = 'female' as const;
export const canBeHost = (u: User) => u.gender === HOST_GENDER;

export function assertCanBeHost(u: User) {
  if (!canBeHost(u)) throw forbidden('host_female_only', 'Only women can become hosts');
}

// Approved host ka profile (warna error) — call / gift lene wale ki jaanch
export async function requireHost(user: User): Promise<HostProfile> {
  const hp = user.isHost && canBeHost(user) ? await HostProfile.findByPk(user.id) : null;
  if (!hp || hp.status !== 'approved') throw forbidden('not_host', 'You can only call or send gifts to hosts');
  return hp;
}

// Sirf user ↔ host baat kar sakte hain (do users ya do hosts aapas me nahi)
export function assertUserHostPair(a: User, b: User) {
  if (a.isHost === b.isHost) throw forbidden('not_allowed', a.isHost ? 'Hosts can only talk to users' : 'You can only talk to hosts');
}

export async function hostSummary(userId: number) {
  const [user, hp, w, s] = await Promise.all([User.findByPk(userId), HostProfile.findByPk(userId), HostWallet.findByPk(userId), getSettings()]);
  const [agency, invite] = await Promise.all([
    hp?.agencyId ? Agency.findByPk(hp.agencyId) : null,
    user?.inviteAgencyId ? Agency.findOne({ where: { id: user.inviteAgencyId, status: 'active' } }) : null,
  ]);
  const gems = Number(w?.points ?? 0);
  const today = user?.isHost ? await hostToday(userId) : null;
  return {
    today,
    role: user?.role ?? 'user',
    // "Become a host" sirf agency link se aayi ladki ko (ya jiska form pehle se hai)
    canApply: !!user && canBeHost(user) && (!!invite || !!hp),
    invite: invite ? { code: invite.code, name: invite.name } : null,
    application: hp ? { status: hp.status, rejectReason: hp.rejectReason, agency: agency ? { code: agency.code, name: agency.name } : null, reviewedAt: hp.reviewedAt } : null,
    rate: hp?.rate ?? null,
    rates: s.hostRates,
    rateMin: hostRange(hp, s).min,
    rateMax: hostRange(hp, s).max,
    rateOwnRange: hostRange(hp, s).own, // true = Meto team ne is host ki range set ki
    rateStep: s.hostRateStep,
    available: hp?.available ?? false,
    gems, // host ka balance gems me (₹ / rate host ko nahi dikhate)
    totalEarned: Number(w?.totalEarned ?? 0),
    media: { freePhotos: s.freePhotos, photoPrice: s.photoUnlockPrice, freeVideos: s.freeVideos, videoPrice: s.videoUnlockPrice, maxVideos: s.maxHostVideos },
  };
}

export async function updateHostSettings(user: User, p: { rate?: number; available?: boolean }) {
  const hp = await requireHost(user).catch(() => {
    throw forbidden('not_host', 'Only approved hosts can do this');
  });
  if (p.rate != null) {
    const s = await getSettings();
    // Chip ya apna amount: min se open max tak, step ke hisaab se (sab admin settings se)
    const r = hostRange(hp, s); // is host ki range (admin ki di hui ya Settings wali)
    if (p.rate > r.max) throw badRequest(`Maximum rate is ${r.max} gems/min`);
    if (p.rate < r.min) throw badRequest(`Minimum rate is ${r.min} gems/min`);
    if (p.rate % s.hostRateStep !== 0) throw badRequest(`Rate must be in steps of ${s.hostRateStep}`);
    hp.rate = p.rate;
  }
  if (p.available != null) hp.available = p.available;
  await hp.save();
  return hostSummary(user.id);
}

/* ---------------- Host banne ki application ---------------- */

export async function findAgency(code: string) {
  const a = await Agency.findOne({ where: { code: code.trim().toUpperCase(), status: 'active' } });
  if (!a) throw new HttpError(404, 'agency_not_found', 'This agency code is not valid');
  return a;
}

// Agency link khula (meto.app/join?agency=CODE) → yaad rakho. Sirf ladki
export async function acceptInvite(user: User, code: string) {
  const agency = await findAgency(code);
  if (!canBeHost(user)) throw forbidden('invite_female_only', 'This invite is only for women');
  const hp = await HostProfile.findByPk(user.id);
  if (hp?.status === 'approved') throw new HttpError(409, 'already_host', 'You are already a host');
  await user.update({ inviteAgencyId: agency.id });
  return { code: agency.code, name: agency.name };
}

type ApplyFiles = { photos: Buffer[]; video: Buffer; selfies: Buffer[] };

// Form jama: sirf ladki, 18+, pehle se pending/approved nahi. Status → pending (admin dekhega)
// Agency invite zaroori — code wahi jo link se aaya (form me badal nahi sakte)
export async function applyHost(user: User, files: ApplyFiles) {
  assertCanBeHost(user);
  const agency = user.inviteAgencyId ? await Agency.findOne({ where: { id: user.inviteAgencyId, status: 'active' } }) : null;
  if (!agency) throw forbidden('invite_required', 'You need an invite link from an agency to become a host');
  if (!user.age || user.age < 18) throw forbidden('underage', 'You must be 18 or older');
  if (files.photos.length !== 3) throw badRequest('Please add 3 photos');
  if (files.selfies.length !== 3) throw badRequest('Please take all 3 selfie poses');
  const existing = await HostProfile.findByPk(user.id);
  if (existing?.status === 'pending') throw new HttpError(409, 'already_applied', 'Your application is already under review');
  if (existing?.status === 'approved') throw new HttpError(409, 'already_host', 'You are already a host');
  if (existing?.status === 'suspended') throw forbidden('host_suspended', 'Your host account is suspended. Contact support');

  const folder = `host/${user.id}`;
  const [photos, selfies, video] = await Promise.all([
    Promise.all(files.photos.map(b => savePrivateImage(b, folder))),
    Promise.all(files.selfies.map(b => savePrivateImage(b, folder))),
    savePrivateVideo(files.video, folder),
  ]);
  const s = await getSettings();
  await HostProfile.upsert({
    userId: user.id,
    agencyId: agency.id,
    status: 'pending',
    rate: existing?.rate ?? s.hostRateDefault,
    available: false,
    application: { photos, selfies, video, submittedAt: new Date().toISOString() },
    rejectReason: null,
    reviewedAt: null,
  });
  return hostSummary(user.id);
}

// Approve / reject (abhi dev route se, baad me admin panel se)
export async function reviewHost(userId: number, approve: boolean, reason?: string) {
  const [user, hp] = await Promise.all([User.findByPk(userId), HostProfile.findByPk(userId)]);
  if (!user || !hp) throw badRequest('No application');
  if (approve) {
    assertCanBeHost(user);
    await hp.update({ status: 'approved', reviewedAt: new Date(), rejectReason: null, available: true });
    await user.update({ role: 'host' });
    notifyLater(user.id, 'notice', { data: { title: 'You are now a Meto host 🎉', body: 'Your application is approved. Go online and start earning.' } });
  } else {
    await hp.update({ status: 'rejected', reviewedAt: new Date(), rejectReason: reason ?? 'Your application was not approved' });
    await user.update({ role: 'user' });
    notifyLater(user.id, 'notice', { data: { title: 'Host application not approved', body: reason ?? 'Please check the reason and apply again.' } });
  }
  return hostSummary(userId);
}

/* ---------------- Online / offline (app khula = online) ---------------- */

// Host ka app khula / wapas aaya → online (app khula = online, koi switch nahi)
export async function hostCameOnline(userId: number) {
  const hp = await HostProfile.findByPk(userId);
  if (hp && hp.status === 'approved' && !hp.available) {
    await hp.update({ available: true });
    emitToUser(userId, 'host:status', { available: true });
  }
}

/* ---------------- Kamai ---------------- */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function hostToday(userId: number) {
  const since = startOfToday();
  const [points, calls] = await Promise.all([
    HostTx.sum('points', { where: { userId, points: { [Op.gt]: 0 }, createdAt: { [Op.gte]: since } } }),
    Call.findAll({ where: { calleeId: userId, status: 'ended', answeredAt: { [Op.gte]: since } }, attributes: ['durationSec'] }),
  ]);
  const g = Number(points) || 0;
  // Host ko sirf gems dikhte hain (₹ nahi)
  return { gems: g, calls: calls.length, minutes: Math.round(calls.reduce((a, c) => a + c.durationSec, 0) / 60) };
}

export const hostTxJSON = (t: HostTx) => ({
  id: t.id,
  kind: t.kind,
  gems: t.points, // host_transactions.points = gems
  title: t.title,
  subtitle: t.subtitle,
  createdAt: t.createdAt,
});

export async function hostEarnings(userId: number, kind: 'all' | 'call' | 'gift' | 'message', before?: number) {
  // Earnings me sirf kamai (gems). Withdraw beans me alag Withdraw screen pe dikhta hai.
  const where: Record<string, unknown> = { userId, kind: kind === 'all' ? ['call', 'gift', 'message', 'unlock', 'admin'] : kind };
  if (before) where.id = { [Op.lt]: before };
  const [items, byKind] = await Promise.all([
    HostTx.findAll({ where, order: [['id', 'DESC']], limit: 30 }),
    HostTx.findAll({
      where: { userId, kind: ['call', 'gift', 'message'] },
      attributes: ['kind', [fn('SUM', col('points')), 'total']],
      group: ['kind'],
      raw: true,
    }),
  ]);
  const totals = { call: 0, gift: 0, message: 0 };
  for (const r of byKind as unknown as { kind: keyof typeof totals; total: string }[]) totals[r.kind] = Number(r.total) || 0;
  return { items: items.map(hostTxJSON), nextBefore: items.length === 30 ? items[items.length - 1].id : null, totals };
}

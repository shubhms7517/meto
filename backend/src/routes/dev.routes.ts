import { Op } from 'sequelize';
import { Router } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { Call, Status, User, UserPhoto } from '../models/index.js';
import { acceptCall, endCall, startCall } from '../services/calls.js';
import { applyTx, balanceOf } from '../services/wallet.js';
import { notify } from '../services/notifications.js';
import { STATUS_TTL_MS } from '../models/Status.js';
import { sendMessage } from '../services/chat.js';
import { HostProfile } from '../models/index.js';
import { assertCanBeHost, reviewHost } from '../services/host.js';
import { Agency } from '../models/index.js';
import { markWithdrawalPaid, rejectWithdrawal } from '../services/withdraw.js';
import { replySupport } from '../services/support.js';

/**
 * SIRF DEVELOPMENT + SIRF LOCALHOST: test (seed) users ki taraf se message / typing bhejna,
 * taaki phone pe aane wale messages test ho sakein. Production me ye router mount hi nahi hota.
 */
export const devRouter = Router();

devRouter.use((req, _res, next) => {
  const ip = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw forbidden('dev_only', 'Localhost only');
  next();
});

async function seedUser(publicId: number) {
  const u = await User.findOne({ where: { publicId } });
  if (!u || !u.firebaseUid.startsWith('seed_')) throw notFound('Seed user not found');
  return u;
}

// POST /api/dev/say { from: 100000002, to: 448708254, body: "Hi!" }
devRouter.post('/say', async (req, res) => {
  const p = z.object({ from: z.number(), to: z.number(), body: z.string().min(1) }).parse(req.body);
  res.json({ message: await sendMessage(await seedUser(p.from), p.to, p.body, null) });
});

// POST /api/dev/status { from, caption?, photo? (0-4) } — seed user ka status (uski sample photo se)
devRouter.post('/status', async (req, res) => {
  const p = z.object({ from: z.number(), caption: z.string().optional(), photo: z.number().int().min(0).max(4).default(1) }).parse(req.body);
  const u = await seedUser(p.from);
  const photo = await UserPhoto.findOne({ where: { userId: u.id, position: p.photo } });
  if (!photo) throw notFound('Seed photo not found');
  const s = await Status.create({
    userId: u.id,
    imageUrl: photo.url,
    caption: p.caption ?? null,
    visibility: 'everyone',
    expiresAt: new Date(Date.now() + STATUS_TTL_MS),
  });
  res.json({ id: s.id });
});

// POST /api/dev/call { from, to } — seed user aapko call kare (incoming screen test)
devRouter.post('/call', async (req, res) => {
  const p = z.object({ from: z.number(), to: z.number() }).parse(req.body);
  const from = await seedUser(p.from);
  // Test caller ke paas gems na hon to bhar do
  const bal = await balanceOf(from.id);
  if (bal < 5000) await applyTx(from.id, 5000, { kind: 'admin', title: 'Dev top-up' });
  res.json(await startCall(from, p.to));
});

// POST /api/dev/notice { user?, title, body } — Official notice (admin panel aane tak)
devRouter.post('/notice', async (req, res) => {
  const p = z.object({ user: z.number().optional(), title: z.string().max(80), body: z.string().max(500) }).parse(req.body);
  const users = p.user ? await User.findAll({ where: { publicId: p.user } }) : await User.findAll({ where: { firebaseUid: { [Op.notLike]: 'seed_%' } } });
  for (const u of users) await notify(u.id, 'notice', { data: { title: p.title, body: p.body } });
  res.json({ sent: users.length });
});

// POST /api/dev/gems { user, set } — kisi ka balance set karo (low balance test)
devRouter.post('/gems', async (req, res) => {
  const p = z.object({ user: z.number(), set: z.number().int().min(0) }).parse(req.body);
  const u = await User.findOne({ where: { publicId: p.user } });
  if (!u) throw notFound('User not found');
  const diff = p.set - (await balanceOf(u.id));
  if (diff) await applyTx(u.id, diff, { kind: 'admin', title: 'Dev balance set' });
  res.json({ balance: p.set });
});

// POST /api/dev/call/:id/accept — seed user aapki call utha le (call screen test; video uski taraf se nahi aayega)
devRouter.post('/call/:id/accept', async (req, res) => {
  const call = await Call.findByPk(Number(req.params.id));
  if (!call) throw notFound('Call not found');
  res.json(await acceptCall(await seedUser((await User.findByPk(call.calleeId))!.publicId), call.id));
});

// POST /api/dev/typing { from, to, typing }
devRouter.post('/typing', async (req, res) => {
  const p = z.object({ from: z.number(), to: z.number(), typing: z.boolean() }).parse(req.body);
  const from = await seedUser(p.from);
  const to = await User.findOne({ where: { publicId: p.to } });
  if (!to) throw notFound('User not found');
  emitToUser(to.id, 'typing', { from: from.publicId, typing: p.typing });
  res.json({ ok: true });
});

// POST /api/dev/host { user, rate?, available?, off? } — test ke liye kisi ko approved host banao (admin panel aane tak)
devRouter.post('/host', async (req, res) => {
  const p = z.object({ user: z.number(), rate: z.number().int().default(1000), available: z.boolean().default(true), off: z.boolean().default(false) }).parse(req.body);
  const u = await User.findOne({ where: { publicId: p.user } });
  if (!u) throw notFound('User not found');
  if (p.off) {
    await u.update({ role: 'user' });
    await HostProfile.update({ status: 'suspended', available: false }, { where: { userId: u.id } });
    return res.json({ role: 'user' });
  }
  assertCanBeHost(u); // host sirf ladki
  await HostProfile.upsert({ userId: u.id, agencyId: null, status: 'approved', rate: p.rate, available: p.available, application: null, rejectReason: null, reviewedAt: new Date() });
  await u.update({ role: 'host' });
  res.json({ role: 'host', rate: p.rate });
});

// POST /api/dev/call/:id/end — seed caller/callee ki taraf se call band
devRouter.post('/call/:id/end', async (req, res) => {
  const call = await Call.findByPk(Number(req.params.id));
  if (!call) throw notFound('Call not found');
  const caller = (await User.findByPk(call.callerId))!;
  res.json(await endCall(caller.firebaseUid.startsWith('seed_') ? caller : (await User.findByPk(call.calleeId))!, call.id));
});

// POST /api/dev/host/review { user, approve, reason? } — application approve/reject (admin panel aane tak)
devRouter.post('/host/review', async (req, res) => {
  const p = z.object({ user: z.number(), approve: z.boolean(), reason: z.string().max(200).optional() }).parse(req.body);
  const u = await User.findOne({ where: { publicId: p.user } });
  if (!u) throw notFound('User not found');
  res.json(await reviewHost(u.id, p.approve, p.reason));
});

// POST /api/dev/agency { code, name } — test agency (admin panel aane tak)
devRouter.post('/agency', async (req, res) => {
  const p = z.object({ code: z.string().min(2).max(20), name: z.string().min(2).max(80) }).parse(req.body);
  const [a] = await Agency.findOrCreate({ where: { code: p.code.toUpperCase() }, defaults: { code: p.code.toUpperCase(), name: p.name } });
  res.json({ id: a.id, code: a.code, name: a.name });
});

// POST /api/dev/withdrawals/:id/paid { utr } — admin panel aane tak
devRouter.post('/withdrawals/:id/paid', async (req, res) => {
  const { utr } = z.object({ utr: z.string().min(4).max(40) }).parse(req.body);
  res.json(await markWithdrawalPaid(Number(req.params.id), utr));
});

// POST /api/dev/withdrawals/:id/reject { reason } — points wapas
devRouter.post('/withdrawals/:id/reject', async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(200) }).parse(req.body);
  res.json(await rejectWithdrawal(Number(req.params.id), reason));
});

// POST /api/dev/support/:ticketId/reply { body, solve? } — Meto team ka jawab (admin panel aane tak)
devRouter.post('/support/:ticketId/reply', async (req, res) => {
  const p = z.object({ body: z.string().trim().min(1).max(2000), solve: z.boolean().optional() }).parse(req.body);
  res.json(await replySupport(Number(req.params.ticketId), p.body, p.solve));
});

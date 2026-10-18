import { join, resolve } from 'node:path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Op } from 'sequelize';
import { z } from 'zod';
import { audit, confirmPassword, hashPassword, login, logout, passwordProblem, requireAdmin } from '../lib/adminAuth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { getSettings, type Settings } from '../lib/settings.js';
import { giftUpload, PRIVATE_ROOT, saveGiftIcon, saveGiftSvga } from '../lib/upload.js';
import { Admin, ADMIN_ROLES, AdminSession, Gift, User, Withdrawal, WalletTx } from '../models/index.js';
import { reviewHost } from '../services/host.js';
import { markWithdrawalPaid, rejectWithdrawal } from '../services/withdraw.js';
import { replySupport } from '../services/support.js';
import { notify } from '../services/notifications.js';
import * as A from '../services/admin.js';

export const adminRouter = Router();

const json429 = { error: { code: 'rate_limited', message: 'Too many requests. Please wait a minute' } };
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: json429 });
adminRouter.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, message: json429 }));

// Panel hamesha isi server se khulta hai (localhost ya PC ka IP) — apni file links relative bhejo,
// warna doosre host ka link CSP (img-src 'self') me block ho jaata hai
const OWN_FILE = /^https?:\/\/[^/]+:4000(?=\/(?:uploads|api\/admin\/private)[/?])/;
const relativeLinks = (v: unknown): unknown =>
  typeof v === 'string' ? v.replace(OWN_FILE, '') : Array.isArray(v) ? v.map(relativeLinks) : v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relativeLinks(x)])) : v;
adminRouter.use((_req, res, next) => {
  const send = res.json.bind(res);
  res.json = body => send(relativeLinks(JSON.parse(JSON.stringify(body))));
  next();
});

const pid = z.coerce.number().int().positive();
const reasonSchema = z.string().trim().min(3, 'Please write a reason').max(300);

/* ---------- auth ---------- */

adminRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const p = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(200) }).parse(req.body);
  res.json(await login(p.email, p.password, req));
});
adminRouter.post('/auth/logout', async (req, res) => {
  await logout(req);
  res.json({ ok: true });
});
adminRouter.get('/auth/me', requireAdmin(), async (req, res) => res.json({ admin: req.admin!.toJSONSafe(), pending: await A.pending() }));

// Apna password badlo
adminRouter.post('/auth/password', requireAdmin(), async (req, res) => {
  const p = z.object({ current: z.string(), next: z.string().max(200) }).parse(req.body);
  await confirmPassword(req.admin!, p.current);
  const problem = passwordProblem(p.next);
  if (problem) throw badRequest(problem);
  await req.admin!.update({ passwordHash: await hashPassword(p.next) });
  await AdminSession.destroy({ where: { adminId: req.admin!.id } });
  await audit(req, 'admin.password', { type: 'admin', id: req.admin!.id }, 'Changed own password');
  res.json({ ok: true });
});

/* ---------- private files (selfie / host video) — signed link, img / video tag ke liye ---------- */

adminRouter.get('/private', (req, res) => {
  const path = String(req.query.p ?? '');
  if (!A.verifyPrivate(path, Number(req.query.e), String(req.query.s ?? ''))) throw forbidden('bad_link', 'Link expired');
  const full = resolve(join(PRIVATE_ROOT, path));
  if (!full.startsWith(resolve(PRIVATE_ROOT))) throw forbidden('bad_link', 'Bad path');
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.sendFile(full, err => err && !res.headersSent && res.status(404).end());
});

/* ---------- dashboard ---------- */

adminRouter.get('/dashboard', requireAdmin(), async (req, res) => {
  const range = z.enum(['today', '7d', '30d']).catch('today').parse(req.query.range);
  res.json(await A.dashboard(range));
});

/* ---------- host applications ---------- */

adminRouter.get('/applications', requireAdmin('moderator'), async (req, res) => {
  const status = z.enum(['pending', 'approved', 'rejected']).catch('pending').parse(req.query.status);
  res.json({ items: await A.listApplications(status) });
});
adminRouter.get('/applications/:id', requireAdmin('moderator'), async (req, res) => res.json(await A.applicationDetail(pid.parse(req.params.id))));

adminRouter.post('/applications/:id/approve', requireAdmin('moderator'), async (req, res) => {
  const u = await User.findOne({ where: { publicId: pid.parse(req.params.id) } });
  if (!u) throw notFound('User not found');
  await reviewHost(u.id, true);
  await audit(req, 'host.approve', { type: 'user', id: u.publicId }, `${u.name} approved as host`, { status: 'pending' }, { status: 'approved' });
  res.json({ ok: true });
});
adminRouter.post('/applications/:id/reject', requireAdmin('moderator'), async (req, res) => {
  const p = z.object({ reason: reasonSchema, block: z.boolean().optional() }).parse(req.body);
  const u = await User.findOne({ where: { publicId: pid.parse(req.params.id) } });
  if (!u) throw notFound('User not found');
  await reviewHost(u.id, false, p.reason);
  if (p.block) await u.update({ inviteAgencyId: null }); // naye invite link ke bina dobara apply nahi
  await audit(req, p.block ? 'host.reject_block' : 'host.reject', { type: 'user', id: u.publicId }, `${u.name}: ${p.reason}`, { status: 'pending' }, { status: 'rejected' });
  res.json({ ok: true });
});

/* ---------- users ---------- */

adminRouter.get('/users', requireAdmin('moderator', 'support', 'finance'), async (req, res) => {
  const p = z
    .object({ q: z.string().max(80).optional(), filter: z.enum(['all', 'vip', 'new', 'reported', 'banned']).catch('all'), page: z.coerce.number().int().min(1).catch(1) })
    .parse(req.query);
  res.json(await A.listUsers(p));
});
adminRouter.get('/users/:id', requireAdmin('moderator', 'support', 'finance'), async (req, res) => res.json(await A.userDetail(pid.parse(req.params.id))));

adminRouter.post('/users/:id/gems', requireAdmin('support', 'finance'), async (req, res) => {
  const p = z.object({ amount: z.number().int().refine(n => n !== 0 && Math.abs(n) <= 10_000_000, 'Invalid amount'), reason: reasonSchema }).parse(req.body);
  // Support sirf chhoti wapsi (2,000 tak) — badi rakam finance / owner
  if (req.admin!.role === 'support' && (p.amount < 0 || p.amount > 2000)) throw forbidden('no_permission', 'Support can add up to 2,000 gems. Ask finance for more');
  const r = await A.adjustGems(pid.parse(req.params.id), p.amount, p.reason, req.admin!.name);
  await audit(req, 'wallet.adjust', { type: 'user', id: r.user.publicId }, `${r.user.name}: ${p.amount > 0 ? '+' : ''}${p.amount} gems · ${p.reason}`, { gems: r.before }, { gems: r.after });
  res.json({ ok: true, gems: r.after });
});
adminRouter.post('/users/:id/status', requireAdmin('moderator'), async (req, res) => {
  const p = z.object({ status: z.enum(['active', 'banned']), reason: reasonSchema }).parse(req.body);
  const r = await A.setUserStatus(pid.parse(req.params.id), p.status, p.reason);
  await audit(req, p.status === 'banned' ? 'user.ban' : 'user.unban', { type: 'user', id: r.user.publicId }, `${r.user.name}: ${p.reason}`, { status: r.before }, { status: p.status });
  res.json({ ok: true });
});
adminRouter.post('/users/:id/vip', requireAdmin('finance'), async (req, res) => {
  const p = z.object({ days: z.number().int().min(1).max(366), reason: reasonSchema }).parse(req.body);
  const r = await A.giveVip(pid.parse(req.params.id), p.days);
  await audit(req, 'user.vip', { type: 'user', id: r.user.publicId }, `${r.user.name}: +${p.days} days VIP · ${p.reason}`, { vipUntil: r.before }, { vipUntil: r.after });
  res.json({ ok: true });
});

/* ---------- hosts ---------- */

adminRouter.get('/hosts', requireAdmin('moderator', 'support', 'finance'), async (req, res) => {
  const p = z
    .object({
      q: z.string().max(80).optional(),
      status: z.enum(['all', 'approved', 'suspended']).catch('all'),
      online: z.enum(['1', '0']).optional(),
      agencyId: z.coerce.number().int().optional(),
      sort: z.enum(['today', 'total', 'short']).catch('today'),
    })
    .parse(req.query);
  res.json(await A.listHosts({ ...p, online: p.online === '1' }));
});
adminRouter.get('/hosts/:id', requireAdmin('moderator', 'support', 'finance'), async (req, res) => res.json(await A.hostDetail(pid.parse(req.params.id))));

adminRouter.post('/hosts/:id/status', requireAdmin('moderator'), async (req, res) => {
  const p = z.object({ status: z.enum(['approved', 'suspended']), reason: reasonSchema }).parse(req.body);
  const r = await A.setHostStatus(pid.parse(req.params.id), p.status, p.reason);
  await audit(req, p.status === 'suspended' ? 'host.suspend' : 'host.unsuspend', { type: 'user', id: r.user.publicId }, `${r.user.name}: ${p.reason}`, { status: r.before }, { status: p.status });
  res.json({ ok: true });
});
adminRouter.post('/hosts/:id/rate', requireAdmin('moderator'), async (req, res) => {
  const p = z.object({ rate: z.number().int().positive() }).parse(req.body);
  const r = await A.setHostRate(pid.parse(req.params.id), p.rate);
  await audit(req, 'host.rate', { type: 'user', id: r.user.publicId }, `${r.user.name}: rate ${r.before} → ${p.rate}`, { rate: r.before }, { rate: p.rate });
  res.json({ ok: true });
});
adminRouter.post('/hosts/:id/points', requireAdmin('finance'), async (req, res) => {
  const p = z.object({ points: z.number().int().refine(n => n !== 0, 'Invalid amount'), reason: reasonSchema }).parse(req.body);
  const r = await A.adjustPoints(pid.parse(req.params.id), p.points, p.reason);
  await audit(req, 'host.points', { type: 'user', id: r.user.publicId }, `${r.user.name}: ${p.points > 0 ? '+' : ''}${p.points} points · ${p.reason}`, { points: r.before }, { points: r.after });
  res.json({ ok: true });
});
adminRouter.delete('/hosts/:id/media/:kind/:mediaId', requireAdmin('moderator'), async (req, res) => {
  const kind = z.enum(['photo', 'video']).parse(req.params.kind);
  const r = await A.removeMedia(pid.parse(req.params.id), kind, pid.parse(req.params.mediaId));
  await audit(req, 'media.remove', { type: 'user', id: r.user.publicId }, `${r.user.name}: removed ${kind}`, { url: r.url }, null);
  res.json({ ok: true });
});

/* ---------- reports ---------- */

adminRouter.get('/reports', requireAdmin('moderator'), async (req, res) => {
  const status = z.enum(['open', 'reviewed', 'dismissed']).catch('open').parse(req.query.status);
  res.json({ items: await A.listReports(status) });
});
adminRouter.get('/reports/:id', requireAdmin('moderator'), async (req, res) => res.json(await A.reportDetail(pid.parse(req.params.id))));
adminRouter.post('/reports/:id/action', requireAdmin('moderator'), async (req, res) => {
  const p = z.object({ action: z.enum(['dismiss', 'warn', 'suspend', 'ban']), note: z.string().trim().max(300).optional() }).parse(req.body);
  const r = await A.actOnReport(pid.parse(req.params.id), p.action, p.note);
  await audit(req, `report.${p.action}`, { type: 'user', id: r.reported.id }, `${r.reported.name} (${r.reported.publicId}): ${p.action}${p.note ? ` · ${p.note}` : ''}`);
  res.json({ ok: true, strikes: r.strikes });
});

/* ---------- live calls (read-only dashboard, no video) ---------- */
adminRouter.get('/live-calls', requireAdmin('moderator'), async (req, res) => {
  const status = z.enum(['all', 'ringing', 'connected']).catch('all').parse(req.query.status);
  const q = z.string().trim().max(40).optional().parse(req.query.q);
  res.json(await A.liveCalls({ status, q }));
});

/* ---------- withdrawals ---------- */

adminRouter.get('/withdrawals', requireAdmin('finance'), async (req, res) => {
  const p = z.object({ status: z.enum(['pending', 'paid', 'rejected']).catch('pending'), q: z.string().max(80).optional() }).parse(req.query);
  res.json(await A.listWithdrawalsAdmin(p.status, p.q));
});
adminRouter.post('/withdrawals/:id/paid', requireAdmin('finance'), async (req, res) => {
  const p = z.object({ utr: z.string().trim().regex(/^[A-Za-z0-9]{6,30}$/, 'Enter a valid UTR / reference number') }).parse(req.body);
  const id = pid.parse(req.params.id);
  const w = await markWithdrawalPaid(id, p.utr);
  await audit(req, 'withdrawal.paid', { type: 'withdrawal', id }, `₹${(w.net ?? 0).toLocaleString('en-IN')} · UTR ${p.utr}`, { status: 'pending' }, { status: 'paid', utr: p.utr });
  res.json({ ok: true });
});
adminRouter.post('/withdrawals/:id/reject', requireAdmin('finance'), async (req, res) => {
  const p = z.object({ reason: reasonSchema }).parse(req.body);
  const id = pid.parse(req.params.id);
  await rejectWithdrawal(id, p.reason);
  await audit(req, 'withdrawal.reject', { type: 'withdrawal', id }, p.reason, { status: 'pending' }, { status: 'rejected' });
  res.json({ ok: true });
});
// CSV: TDS / CA ke liye (mahina)
// Excel formula se bachav (naam "=..." ho to) + IST date
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
const istDate = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + 330 * 60_000).toISOString().slice(0, 10) : '');
adminRouter.get('/withdrawals/export', requireAdmin('finance'), async (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).catch(new Date().toISOString().slice(0, 7)).parse(req.query.month);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const rows = await Withdrawal.findAll({ where: { status: 'paid', paidAt: { [Op.gte]: new Date(y, m - 1, 1), [Op.lt]: new Date(y, m, 1) } }, order: [['paidAt', 'ASC']] });
  const items = (await A.listWithdrawalsAdmin('paid')).items.filter(i => rows.some(r => r.id === i.id));
  const csv = ['Paid on,Host,Meto ID,UPI,UPI name,PAN name,Requested (Rs),TDS (Rs),Paid (Rs),UTR']
    .concat(items.map(i => [istDate(i.paidAt), i.user?.name, i.user?.publicId, i.upiId, i.upiName, i.panName, i.requestedInr, i.tdsInr, i.netInr, i.utr].map(csvCell).join(',')))
    .join('\n');
  await audit(req, 'withdrawal.export', { type: 'month', id: month }, `${items.length} payouts`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meto-payouts-${month}.csv"`);
  res.send('﻿' + csv);
});

/* ---------- support ---------- */

adminRouter.get('/support', requireAdmin('support'), async (req, res) => {
  const status = z.enum(['open', 'solved', 'all']).catch('open').parse(req.query.status);
  res.json({ items: await A.listTickets(status) });
});
adminRouter.get('/support/:id', requireAdmin('support'), async (req, res) => res.json(await A.ticketThread(pid.parse(req.params.id))));
adminRouter.post('/support/:id/reply', requireAdmin('support'), async (req, res) => {
  const p = z.object({ body: z.string().trim().min(1).max(2000), solve: z.boolean().optional() }).parse(req.body);
  const id = pid.parse(req.params.id);
  await replySupport(id, p.body, p.solve);
  await audit(req, p.solve ? 'support.reply_solve' : 'support.reply', { type: 'ticket', id }, p.body.slice(0, 200));
  res.json({ ok: true });
});
adminRouter.post('/support/:id/solve', requireAdmin('support'), async (req, res) => {
  const t = await A.solveTicket(pid.parse(req.params.id));
  await audit(req, 'support.solve', { type: 'ticket', id: t.id }, null);
  res.json({ ok: true });
});

/* ---------- transactions ---------- */

adminRouter.get('/transactions', requireAdmin('finance', 'support'), async (req, res) => {
  const p = z.object({ kind: z.string().max(20).optional(), user: z.coerce.number().int().optional(), before: z.coerce.number().int().optional() }).parse(req.query);
  const where: Record<string, unknown> = {};
  if (p.kind && p.kind !== 'all') where.kind = p.kind;
  if (p.user) {
    const u = await User.findOne({ where: { publicId: p.user } });
    where.userId = u?.id ?? 0;
  }
  if (p.before) where.id = { [Op.lt]: p.before };
  const rows = await WalletTx.findAll({ where, order: [['id', 'DESC']], limit: 100 });
  const users = new Map((await User.findAll({ where: { id: [...new Set(rows.map(r => r.userId))] } })).map(u => [u.id, u]));
  res.json({
    items: rows.map(t => ({ id: t.id, kind: t.kind, amount: t.amount, title: t.title, subtitle: t.subtitle, meta: typeof t.meta === 'string' ? JSON.parse(t.meta) : t.meta, at: t.createdAt, user: users.get(t.userId) ? A.userCard(users.get(t.userId)!) : null })),
    nextBefore: rows.length === 100 ? rows[rows.length - 1]!.id : null,
  });
});

/* ---------- notices ---------- */

adminRouter.post('/notices', requireAdmin('owner'), async (req, res) => {
  const p = z
    .object({ audience: z.enum(['everyone', 'users', 'hosts', 'vip', 'one']), user: z.number().int().optional(), title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(500) })
    .parse(req.body);
  // Sabko bhejte waqt test (seed) users nahi; ek insaan ko — koi bhi
  const where: Record<string, unknown> = p.audience === 'one' ? { status: 'active' } : { status: 'active', firebaseUid: { [Op.notLike]: 'seed_%' } };
  if (p.audience === 'users') where.role = 'user';
  if (p.audience === 'hosts') where.role = 'host';
  if (p.audience === 'vip') where.vipUntil = { [Op.gt]: new Date() };
  if (p.audience === 'one') {
    if (!p.user) throw badRequest('Enter the Meto ID');
    where.publicId = p.user;
  }
  const users = await User.findAll({ where, attributes: ['id'] });
  for (const u of users) await notify(u.id, 'notice', { data: { title: p.title, body: p.body } }).catch(() => {});
  await audit(req, 'notice.send', { type: p.audience, id: p.user ?? null }, `${p.title} → ${users.length} people`, null, { title: p.title, body: p.body });
  res.json({ ok: true, sent: users.length });
});

/* ---------- store: gifts (icon + SVGA) ---------- */

adminRouter.get('/gifts', requireAdmin('owner'), async (_req, res) => res.json({ items: await A.listGifts() }));

const giftFields = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  icon: z.string().trim().min(1).max(16).optional(), // emoji (fallback)
  price: z.coerce.number().int().min(1).max(10_000_000).optional(),
  isRare: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});
const giftFiles = giftUpload.fields([{ name: 'iconFile', maxCount: 1 }, { name: 'svga', maxCount: 1 }]);
const filesOf = async (req: Express.Request) => {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  return {
    iconUrl: f.iconFile?.[0] ? await saveGiftIcon(f.iconFile[0].buffer) : undefined,
    svgaUrl: f.svga?.[0] ? await saveGiftSvga(f.svga[0].buffer) : undefined,
  };
};

adminRouter.post('/gifts', requireAdmin('owner'), giftFiles, async (req, res) => {
  const p = giftFields.parse(req.body);
  if (!p.name || !p.price) throw badRequest('Name and price are required');
  if (await Gift.findOne({ where: { name: p.name } })) throw badRequest('A gift with this name exists');
  const files = await filesOf(req);
  const g = await Gift.create({ name: p.name, icon: p.icon ?? '🎁', price: p.price, isRare: p.isRare ?? false, isActive: p.isActive ?? true, iconUrl: files.iconUrl ?? null, svgaUrl: files.svgaUrl ?? null });
  await audit(req, 'gift.create', { type: 'gift', id: g.id }, `${g.name} · ${g.price}`, null, { ...p, ...files });
  res.json({ ok: true, id: g.id });
});
adminRouter.patch('/gifts/:id', requireAdmin('owner'), giftFiles, async (req, res) => {
  const g = await Gift.findByPk(pid.parse(req.params.id));
  if (!g) throw notFound('Gift not found');
  const p = giftFields.parse(req.body);
  const files = await filesOf(req);
  const removeSvga = req.body?.removeSvga === 'true';
  const patch = { ...p, ...(files.iconUrl ? { iconUrl: files.iconUrl } : {}), ...(files.svgaUrl ? { svgaUrl: files.svgaUrl } : removeSvga ? { svgaUrl: null } : {}) };
  const before = { name: g.name, price: g.price, isRare: g.isRare, isActive: g.isActive, iconUrl: g.iconUrl, svgaUrl: g.svgaUrl };
  await g.update(patch);
  await audit(req, 'gift.update', { type: 'gift', id: g.id }, g.name, before, patch);
  res.json({ ok: true });
});

/* ---------- settings ---------- */

adminRouter.get('/settings', requireAdmin('owner'), async (_req, res) => res.json({ settings: await getSettings(), moneyKeys: A.MONEY_KEYS }));
adminRouter.put('/settings', requireAdmin('owner'), async (req, res) => {
  const p = z.object({ patch: z.record(z.string(), z.unknown()), password: z.string().optional() }).parse(req.body);
  const clean = A.validateSettings(p.patch as Partial<Settings>);
  const current = await getSettings();
  const touchesMoney = A.MONEY_KEYS.some(k => k in clean && JSON.stringify(clean[k]) !== JSON.stringify(current[k]));
  if (touchesMoney) await confirmPassword(req.admin!, p.password);
  const changed = await A.updateSettings(clean);
  for (const c of changed) await audit(req, 'setting.update', { type: 'setting', id: c.key }, c.key, c.before, c.after);
  res.json({ ok: true, changed: changed.length, settings: await getSettings() });
});

/* ---------- compliance ---------- */

adminRouter.get('/compliance', requireAdmin('moderator'), async (_req, res) => res.json(await A.compliance()));

/* ---------- audit + admin team (owner) ---------- */

adminRouter.get('/audit', requireAdmin('owner'), async (req, res) => {
  const p = z.object({ adminId: z.coerce.number().int().optional(), action: z.string().max(40).optional(), target: z.string().max(60).optional(), days: z.coerce.number().int().min(1).max(365).catch(7) }).parse(req.query);
  res.json({ items: await A.listAudit(p) });
});

adminRouter.get('/admins', requireAdmin('owner'), async (_req, res) => res.json({ items: (await Admin.findAll({ order: [['id', 'ASC']] })).map(a => a.toJSONSafe()) }));
adminRouter.post('/admins', requireAdmin('owner'), async (req, res) => {
  const p = z.object({ email: z.string().email().max(160), name: z.string().trim().min(2).max(60), role: z.enum(ADMIN_ROLES), password: z.string().max(200), myPassword: z.string() }).parse(req.body);
  await confirmPassword(req.admin!, p.myPassword);
  const problem = passwordProblem(p.password);
  if (problem) throw badRequest(problem);
  const email = p.email.toLowerCase();
  if (await Admin.findOne({ where: { email } })) throw badRequest('This email is already an admin');
  const a = await Admin.create({ email, name: p.name, role: p.role, passwordHash: await hashPassword(p.password) });
  await audit(req, 'admin.create', { type: 'admin', id: a.id }, `${a.name} · ${a.role}`, null, { email, role: a.role });
  res.json({ ok: true });
});
adminRouter.patch('/admins/:id', requireAdmin('owner'), async (req, res) => {
  const p = z.object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['active', 'disabled']).optional(), password: z.string().max(200).optional(), myPassword: z.string() }).parse(req.body);
  await confirmPassword(req.admin!, p.myPassword);
  const a = await Admin.findByPk(pid.parse(req.params.id));
  if (!a) throw notFound('Admin not found');
  if (a.id === req.admin!.id && (p.role && p.role !== 'owner' || p.status === 'disabled')) throw badRequest('You cannot remove your own owner access');
  const before = { role: a.role, status: a.status };
  const patch: Record<string, unknown> = {};
  if (p.role) patch.role = p.role;
  if (p.status) patch.status = p.status;
  if (p.password) {
    const problem = passwordProblem(p.password);
    if (problem) throw badRequest(problem);
    patch.passwordHash = await hashPassword(p.password);
  }
  await a.update(patch);
  if (p.status === 'disabled' || p.password) await AdminSession.destroy({ where: { adminId: a.id } });
  await audit(req, 'admin.update', { type: 'admin', id: a.id }, `${a.name}${p.password ? ' · password reset' : ''}`, before, { role: a.role, status: a.status });
  res.json({ ok: true });
});

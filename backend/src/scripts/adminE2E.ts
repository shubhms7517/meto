// Admin panel E2E: server (4000) chalu hona chahiye. Temporary admin banata hai, seed users pe test, phir sab wapas.
//   npm run test:admin -- "D:/path/to/any.svga"
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Op } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { Admin, AdminSession, AuditLog, Gift, HostProfile, HostTx, Notification, Report, SupportMessage, SupportTicket, User, WalletTx } from '../models/index.js';
import { getSettings } from '../lib/settings.js';
import { hashPassword } from '../lib/adminAuth.js';

const BASE = 'http://localhost:4000/api/admin';
const PW = 'T' + randomBytes(9).toString('hex') + '9';
const SVGA = process.argv[2]!;
if (!SVGA || !existsSync(SVGA)) {
  console.log('Usage: npm run test:admin -- <file.svga>');
  process.exit(1);
}
await Admin.destroy({ where: { email: 'e2e-test@meto.local' } });
await Admin.create({ email: 'e2e-test@meto.local', name: 'E2E Test', role: 'owner', passwordHash: await hashPassword(PW) });
const started = new Date(Date.now() - 2000);
let token = '';
const results: [string, boolean, string][] = [];
const ok = (name: string, cond: boolean, info = '') => results.push([name, cond, info]);

async function call(path: string, init: { method?: string; body?: unknown; form?: FormData; tok?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${init.tok ?? token}` };
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(BASE + path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

const vihaan = (await User.findOne({ where: { publicId: 100000015 } }))!;
const kabir = (await User.findOne({ where: { publicId: 100000014 } }))!;
const arjun = (await User.findOne({ where: { publicId: 100000012 } }))!;
const aisha = (await User.findOne({ where: { publicId: 100000002 } }))!;
const vipBefore = vihaan.vipUntil;
const aishaHp = (await HostProfile.findByPk(aisha.id))!;
const aishaBefore = { rate: aishaHp.rate, status: aishaHp.status, available: aishaHp.available };
const settingsBefore = await getSettings();
const created: { ticket?: number; report?: number; gift?: number; admin?: number } = {};

try {
  // login
  const l = await call('/auth/login', { body: { email: 'e2e-test@meto.local', password: PW } });
  token = l.json.token;
  ok('login', l.status === 200 && !!token);
  ok('wrong password → 401', (await call('/auth/login', { body: { email: 'e2e-test@meto.local', password: 'nope' } })).status === 401);
  ok('no token → 401', (await call('/dashboard', { tok: '' })).status === 401);
  for (const r of ['today', '7d', '30d']) {
    const d = await call(`/dashboard?range=${r}`);
    ok(`dashboard ${r}`, d.status === 200 && Array.isArray(d.json.chart), `chart ${d.json.chart?.length} days`);
  }

  // users: gems
  const u0 = (await call(`/users/${vihaan.publicId}`)).json.gems;
  let r = await call(`/users/${vihaan.publicId}/gems`, { body: { amount: 100, reason: 'e2e test add' } });
  ok('gems +100', r.status === 200 && r.json.gems === u0 + 100, `${u0} → ${r.json.gems}`);
  r = await call(`/users/${vihaan.publicId}/gems`, { body: { amount: -100, reason: 'e2e test remove' } });
  ok('gems -100', r.status === 200 && r.json.gems === u0);
  ok('gems no reason → 400', (await call(`/users/${vihaan.publicId}/gems`, { body: { amount: 5, reason: '' } })).status === 400);
  ok('gems remove too much → 400', (await call(`/users/${vihaan.publicId}/gems`, { body: { amount: -999999999, reason: 'e2e too much' } })).status === 400);

  // users: ban / unban, VIP
  r = await call(`/users/${kabir.publicId}/status`, { body: { status: 'banned', reason: 'e2e test ban' } });
  ok('ban', r.status === 200 && (await User.findByPk(kabir.id))!.status === 'banned');
  r = await call(`/users/${kabir.publicId}/status`, { body: { status: 'active', reason: 'e2e test unban' } });
  ok('unban', r.status === 200 && (await User.findByPk(kabir.id))!.status === 'active');
  r = await call(`/users/${vihaan.publicId}/vip`, { body: { days: 3, reason: 'e2e test vip' } });
  ok('give VIP 3 days', r.status === 200 && !!(await User.findByPk(vihaan.id))!.isVip);

  // users list / search
  r = await call('/users?q=Vihaan');
  ok('user search', r.status === 200 && r.json.items.some((x: any) => x.publicId === vihaan.publicId));
  r = await call('/users?filter=banned');
  ok('user filter banned', r.status === 200);

  // hosts
  r = await call(`/hosts/${aisha.publicId}/rate`, { body: { rate: 1700 } });
  ok('host rate 1700', r.status === 200 && (await HostProfile.findByPk(aisha.id))!.rate === 1700);
  ok('host rate 99999 → 400', (await call(`/hosts/${aisha.publicId}/rate`, { body: { rate: 99999 } })).status === 400);
  r = await call(`/hosts/${aisha.publicId}/status`, { body: { status: 'suspended', reason: 'e2e test suspend' } });
  ok('host suspend', r.status === 200 && (await HostProfile.findByPk(aisha.id))!.status === 'suspended');
  r = await call('/hosts?status=suspended');
  ok('hosts filter suspended', r.json.items?.some((x: any) => x.publicId === aisha.publicId));
  r = await call(`/hosts/${aisha.publicId}/status`, { body: { status: 'approved', reason: 'e2e test re-activate' } });
  ok('host re-activate', r.status === 200 && (await HostProfile.findByPk(aisha.id))!.status === 'approved');
  const p0 = (await call(`/hosts/${aisha.publicId}`)).json.points;
  r = await call(`/hosts/${aisha.publicId}/points`, { body: { points: 10, reason: 'e2e test points' } });
  ok('host points +10', r.status === 200 && (await call(`/hosts/${aisha.publicId}`)).json.points === p0 + 10);
  await call(`/hosts/${aisha.publicId}/points`, { body: { points: -10, reason: 'e2e test points back' } });
  ok('host detail', (await call(`/hosts/${aisha.publicId}`)).status === 200);

  // reports: nayi report → warn
  const rep = await Report.create({ reporterId: arjun.id, reportedId: kabir.id, reason: 'harassment', details: 'e2e test report', conversationId: null });
  created.report = rep.id;
  r = await call(`/reports/${rep.id}`);
  ok('report detail', r.status === 200 && r.json.report.id === rep.id);
  r = await call(`/reports/${rep.id}/action`, { body: { action: 'warn', note: 'e2e test warning' } });
  ok('report warn → reviewed', r.status === 200 && (await Report.findByPk(rep.id))!.status === 'reviewed', `strikes ${r.json.strikes}`);

  // support: ticket → reply → solve
  const t = await SupportTicket.create({ userId: vihaan.id, topic: 'call', lastMessageAt: new Date() });
  created.ticket = t.id;
  await SupportMessage.create({ ticketId: t.id, fromTeam: false, body: 'e2e test question', imageUrl: null });
  r = await call('/support?status=open');
  ok('support list', r.status === 200 && r.json.items.some((x: any) => x.id === t.id));
  r = await call(`/support/${t.id}/reply`, { body: { body: 'e2e test reply' } });
  ok('support reply', r.status === 200 && (await SupportMessage.count({ where: { ticketId: t.id, fromTeam: true } })) === 1);
  r = await call(`/support/${t.id}/solve`, { method: 'POST' });
  ok('support solve', r.status === 200 && (await SupportTicket.findByPk(t.id))!.status === 'solved');

  // withdrawals
  r = await call('/withdrawals?status=paid');
  ok('withdrawals list', r.status === 200);
  ok('pay already-paid → 400', (await call('/withdrawals/1/paid', { body: { utr: '123456789012' } })).status === 400);
  r = await call('/withdrawals/export?month=2026-10');
  ok('CSV export', r.status === 200 && String(r.headers.get('content-type')).includes('text/csv'));

  // notices (ek seed user)
  r = await call('/notices', { body: { audience: 'one', user: vihaan.publicId, title: 'e2e test notice', body: 'e2e test body' } });
  ok('notice to one', r.status === 200 && r.json.sent === 1);

  // settings
  r = await call('/settings', { method: 'PUT', body: { patch: { freePhotos: settingsBefore.freePhotos + 1 } } });
  ok('setting freePhotos (no password)', r.status === 200 && r.json.settings.freePhotos === settingsBefore.freePhotos + 1);
  await call('/settings', { method: 'PUT', body: { patch: { freePhotos: settingsBefore.freePhotos } } });
  ok('money setting without password → 401', (await call('/settings', { method: 'PUT', body: { patch: { minWithdrawInr: 600 } } })).status === 401);
  r = await call('/settings', { method: 'PUT', body: { patch: { minWithdrawInr: 600 }, password: PW } });
  ok('money setting with password', r.status === 200 && r.json.settings.minWithdrawInr === 600);
  await call('/settings', { method: 'PUT', body: { patch: { minWithdrawInr: settingsBefore.minWithdrawInr }, password: PW } });
  ok('bad setting → 400', (await call('/settings', { method: 'PUT', body: { patch: { hostRateMin: 5000 } } })).status === 400);

  // gifts: SVGA upload
  const f = new FormData();
  f.append('name', 'E2E Dolphin');
  f.append('icon', '🐬');
  f.append('price', '12345');
  f.append('svga', new Blob([readFileSync(SVGA)]), 'dolphin.svga');
  r = await call('/gifts', { form: f });
  ok('gift create with SVGA', r.status === 200, JSON.stringify(r.json).slice(0, 80));
  created.gift = r.json.id;
  const g = (await call('/gifts')).json.items.find((x: any) => x.id === created.gift);
  ok('gift has svgaUrl', !!g?.svgaUrl, g?.svgaUrl);
  if (g?.svgaUrl) {
    const fr = await fetch(g.svgaUrl.replace(/^https?:\/\/[^/]+/, 'http://localhost:4000'));
    ok('SVGA file served', fr.ok && (await fr.arrayBuffer()).byteLength > 1000);
  }
  const bad = new FormData();
  bad.append('svga', new Blob([Buffer.from('not an svga file at all')]), 'x.svga');
  ok('fake SVGA → 400', (await call(`/gifts/${created.gift}`, { method: 'PATCH', form: bad })).status === 400);
  const off = new FormData();
  off.append('isActive', 'false');
  ok('gift hide', (await call(`/gifts/${created.gift}`, { method: 'PATCH', form: off })).status === 200 && !(await Gift.findByPk(created.gift))!.isActive);

  // admin team + roles
  const subPw = 'Sub' + Math.random().toString(36).slice(2, 10) + '77';
  r = await call('/admins', { body: { email: 'e2e-support@meto.local', name: 'E2E Support', role: 'support', password: subPw, myPassword: PW } });
  ok('add support admin', r.status === 200);
  created.admin = (await Admin.findOne({ where: { email: 'e2e-support@meto.local' } }))?.id;
  const sl = await call('/auth/login', { body: { email: 'e2e-support@meto.local', password: subPw } });
  ok('support can open support', (await call('/support', { tok: sl.json.token })).status === 200);
  ok('support blocked from withdrawals', (await call('/withdrawals', { tok: sl.json.token })).status === 403);
  ok('support blocked from settings save', (await call('/settings', { method: 'PUT', tok: sl.json.token, body: { patch: { freePhotos: 9 } } })).status === 403);
  for (const path of ['/audit', '/admins', '/gifts', '/settings']) ok(`support blocked from ${path}`, (await call(path, { tok: sl.json.token })).status === 403);
  ok('support blocked from notices', (await call('/notices', { tok: sl.json.token, body: { audience: 'one', user: vihaan.publicId, title: 'x x', body: 'x x' } })).status === 403);
  ok('support can open dashboard', (await call('/dashboard', { tok: sl.json.token })).status === 200);
  ok('support refund > 2000 blocked', (await call(`/users/${vihaan.publicId}/gems`, { tok: sl.json.token, body: { amount: 5000, reason: 'e2e big' } })).status === 403);
  r = await call(`/admins/${created.admin}`, { method: 'PATCH', body: { status: 'disabled', myPassword: PW } });
  ok('disable admin', r.status === 200);
  ok('disabled admin token rejected', (await call('/support', { tok: sl.json.token })).status === 401);

  r = await call('/compliance');
  ok('compliance', r.status === 200 && Array.isArray(r.json.deletions));
  ok('support blocked from compliance', (await call('/compliance', { tok: sl.json?.token })).status !== 200);

  // audit
  r = await call('/audit?days=1');
  ok('audit has entries', r.status === 200 && r.json.items.length >= 10, `${r.json.items.length} rows`);
  ok('private link bad sig → 403', (await fetch(`${BASE}/private?p=x.jpg&e=${Date.now() + 9999}&s=bad`)).status === 403);
} finally {
  // ---- cleanup ----
  await vihaan.reload();
  await vihaan.update({ vipUntil: vipBefore });
  await HostProfile.update(aishaBefore, { where: { userId: aisha.id } });
  await User.update({ status: 'active' }, { where: { id: kabir.id } });
  const s = await getSettings();
  if (s.freePhotos !== settingsBefore.freePhotos || s.minWithdrawInr !== settingsBefore.minWithdrawInr) console.log('⚠ settings differ!');
  await WalletTx.destroy({ where: { userId: vihaan.id, kind: 'admin', createdAt: { [Op.gte]: started } } });
  await HostTx.destroy({ where: { userId: aisha.id, kind: 'admin', createdAt: { [Op.gte]: started } } });
  if (created.report) await Report.destroy({ where: { id: created.report } });
  if (created.ticket) {
    await SupportMessage.destroy({ where: { ticketId: created.ticket } });
    await SupportTicket.destroy({ where: { id: created.ticket } });
  }
  await Notification.destroy({ where: { userId: [vihaan.id, kabir.id, arjun.id, aisha.id], createdAt: { [Op.gte]: started } } });
  if (created.gift) {
    const g = await Gift.findByPk(created.gift);
    for (const u of [g?.svgaUrl, g?.iconUrl]) if (u) {
      const p = resolve(join('uploads', u.replace(/^\/uploads\//, '')));
      if (existsSync(p)) unlinkSync(p);
    }
    await g?.destroy();
  }
  const ids = (await Admin.findAll({ where: { email: ['e2e-test@meto.local', 'e2e-support@meto.local'] } })).map(a => a.id);
  await AuditLog.destroy({ where: { adminId: ids } });
  await AdminSession.destroy({ where: { adminId: ids } });
  await Admin.destroy({ where: { id: ids } });
  await sequelize.close();
}

for (const [n, c, i] of results) console.log(`${c ? '✅' : '❌'} ${n}${i ? `  (${i})` : ''}`);
console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);

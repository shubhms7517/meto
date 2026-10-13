import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { getSettings } from '../lib/settings.js';
import { HostWallet, PayoutAccount, User, Withdrawal } from '../models/index.js';
import { applyHostTx } from './host.js';
import { notifyLater } from './notifications.js';

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const maskPan = (p: string) => `${p.slice(0, 2)}••••••${p.slice(-2)}`;

export const accountJSON = (a: PayoutAccount | null) =>
  a ? { upiId: a.upiId, upiName: a.upiName, panMasked: maskPan(a.pan), panName: a.panName } : null;

export const withdrawalJSON = (w: Withdrawal) => ({
  id: w.id,
  points: Number(w.points),
  amount: Number(w.amountPaise) / 100,
  tds: Number(w.tdsPaise) / 100,
  net: Number(w.netPaise) / 100,
  upiId: w.upiId,
  status: w.status,
  utr: w.utr,
  reason: w.reason,
  paidAt: w.paidAt,
  createdAt: w.createdAt,
});

function assertHost(user: User) {
  if (!user.isHost) throw forbidden('not_host', 'Only hosts can withdraw');
}

// Withdraw screen ka saara data
export async function withdrawInfo(user: User) {
  assertHost(user);
  const [s, w, acc, pending] = await Promise.all([
    getSettings(),
    HostWallet.findByPk(user.id),
    PayoutAccount.findByPk(user.id),
    Withdrawal.findOne({ where: { userId: user.id, status: 'pending' }, order: [['id', 'DESC']] }),
  ]);
  const points = Number(w?.points ?? 0);
  return {
    points,
    pointsPerInr: s.pointsPerInr,
    availableInr: Math.floor(points / s.pointsPerInr), // poore rupaye hi nikalte hain
    minInr: s.minWithdrawInr,
    tdsPct: s.tdsPct,
    account: accountJSON(acc),
    pending: pending ? withdrawalJSON(pending) : null,
  };
}

export async function savePayoutAccount(user: User, p: { upiId: string; upiName: string; pan: string; panName: string }) {
  assertHost(user);
  const upiId = p.upiId.trim().toLowerCase();
  const pan = p.pan.trim().toUpperCase();
  if (!UPI_RE.test(upiId)) throw badRequest('Please enter a valid UPI ID (like name@okaxis)');
  if (!PAN_RE.test(pan)) throw badRequest('Please enter a valid PAN (like ABCDE1234F)');
  const upiName = p.upiName.trim();
  const panName = p.panName.trim();
  if (upiName.length < 2 || panName.length < 2) throw badRequest('Please enter your full name');
  // Pending withdraw ke beech UPI nahi badal sakte (paisa galat jagah na jaye)
  if (await Withdrawal.findOne({ where: { userId: user.id, status: 'pending' } }))
    throw new HttpError(409, 'withdraw_pending', 'You can change payout details after your current withdrawal is done');
  await PayoutAccount.upsert({ userId: user.id, upiId, upiName, pan, panName });
  return accountJSON(await PayoutAccount.findByPk(user.id));
}

// Withdraw maango: points turant kat-te hain, request "pending" (admin pay karke Paid karega)
export async function requestWithdraw(user: User, amountInr: number) {
  assertHost(user);
  const s = await getSettings();
  if (!Number.isInteger(amountInr) || amountInr < s.minWithdrawInr) throw badRequest(`Minimum withdrawal is ₹${s.minWithdrawInr}`);
  const acc = await PayoutAccount.findByPk(user.id);
  if (!acc) throw new HttpError(409, 'no_payout_account', 'Please add your UPI and PAN first');
  if (await Withdrawal.findOne({ where: { userId: user.id, status: 'pending' } }))
    throw new HttpError(409, 'withdraw_pending', 'You already have a withdrawal in progress');
  const points = amountInr * s.pointsPerInr;
  const w = await HostWallet.findByPk(user.id);
  if (Number(w?.points ?? 0) < points) throw badRequest('Not enough earnings for this amount');

  const amountPaise = amountInr * 100;
  const tdsPaise = Math.round((amountPaise * s.tdsPct) / 100);
  const wd = await Withdrawal.create({
    userId: user.id,
    points,
    amountPaise,
    tdsPaise,
    netPaise: amountPaise - tdsPaise,
    upiId: acc.upiId,
    upiName: acc.upiName,
    utr: null,
    reason: null,
    paidAt: null,
  });
  try {
    await applyHostTx(user.id, -points, { kind: 'withdraw', title: `Withdraw · ₹${amountInr.toLocaleString('en-IN')}`, subtitle: acc.upiId, uniqueKey: `wd:${wd.id}` });
  } catch (e) {
    await wd.destroy(); // points nahi kate to request bhi nahi
    throw e;
  }
  return withdrawalJSON(wd);
}

export async function listWithdrawals(user: User) {
  assertHost(user);
  const rows = await Withdrawal.findAll({ where: { userId: user.id }, order: [['id', 'DESC']], limit: 50 });
  return rows.map(withdrawalJSON);
}

// ---- Admin (abhi dev route se) ----

export async function markWithdrawalPaid(id: number, utr: string) {
  const wd = await Withdrawal.findByPk(id);
  if (!wd) throw notFound('Withdrawal not found');
  if (wd.status !== 'pending') throw badRequest(`Already ${wd.status}`);
  await wd.update({ status: 'paid', utr: utr.trim().slice(0, 40), paidAt: new Date() });
  const net = (Number(wd.netPaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  notifyLater(wd.userId, 'notice', { data: { title: `₹${net} paid to your UPI ✓`, body: `Sent to ${wd.upiId} · UTR ${wd.utr}` } });
  emitToUser(wd.userId, 'withdraw:update', withdrawalJSON(wd));
  return withdrawalJSON(wd);
}

export async function rejectWithdrawal(id: number, reason: string) {
  const wd = await Withdrawal.findByPk(id);
  if (!wd) throw notFound('Withdrawal not found');
  if (wd.status !== 'pending') throw badRequest(`Already ${wd.status}`);
  await wd.update({ status: 'rejected', reason: reason.trim().slice(0, 200) });
  // Points wapas
  await applyHostTx(wd.userId, Number(wd.points), { kind: 'refund', title: 'Withdraw returned', subtitle: wd.reason, uniqueKey: `wdrefund:${wd.id}` });
  notifyLater(wd.userId, 'notice', { data: { title: 'Withdrawal not completed', body: `${wd.reason} · your points are back` } });
  emitToUser(wd.userId, 'withdraw:update', withdrawalJSON(wd));
  return withdrawalJSON(wd);
}

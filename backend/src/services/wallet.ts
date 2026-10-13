import { createHash } from 'node:crypto';
import { Op, Transaction, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { emitToUser } from '../lib/realtime.js';
import { Wallet, WalletTx } from '../models/index.js';
import type { TxKind } from '../models/Wallet.js';
import { VIP_RECHARGE_BONUS } from '../lib/pricing.js';
import { getSettings, userRateFor } from '../lib/settings.js';
import { addXp } from './level.js';
import { notifyLater } from './notifications.js';
import { HostProfile, User } from '../models/index.js';

// Recharge packs (Vato jaisa). "once" = naye user ka offer, sirf pehli recharge me.
export const PACKS = [
  { id: 'gems_5000_once', gems: 5000, bonus: 0, priceInr: 100, tag: 'once' },
  { id: 'gems_4500', gems: 4500, bonus: 0, priceInr: 199, tag: null },
  { id: 'gems_10000', gems: 10000, bonus: 0, priceInr: 399, tag: 'popular' },
  { id: 'gems_22000', gems: 22000, bonus: 0, priceInr: 799, tag: null },
  { id: 'gems_50000', gems: 50000, bonus: 0, priceInr: 1599, tag: null },
  { id: 'gems_150000', gems: 150000, bonus: 0, priceInr: 3999, tag: 'best' },
] as const;
export type Pack = (typeof PACKS)[number];

export const WELCOME_BONUS = 0; // Vato jaisa: naya account 0 se

export class InsufficientGems extends HttpError {
  constructor(
    public balance: number,
    public needed: number,
  ) {
    super(402, 'insufficient_gems', 'Not enough gems');
  }
}

type Entry = { kind: TxKind; title: string; subtitle?: string | null; uniqueKey?: string | null; meta?: Record<string, unknown> | null };

// Wallet row ko lock karke lo (na ho to bana do) — ek waqt me ek hi badlaav
async function lockWallet(userId: number, t: Transaction): Promise<{ wallet: Wallet; created: boolean }> {
  const [, created] = await Wallet.findOrCreate({ where: { userId }, defaults: { userId }, transaction: t });
  const wallet = (await Wallet.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE }))!;
  return { wallet, created };
}

async function post(t: Transaction, wallet: Wallet, amount: number, e: Entry): Promise<WalletTx> {
  const next = wallet.balance + amount;
  if (next < 0) throw new InsufficientGems(wallet.balance, -amount);
  wallet.balance = next;
  await wallet.save({ transaction: t });
  return WalletTx.create(
    {
      userId: wallet.userId,
      kind: e.kind,
      amount,
      balanceAfter: next,
      title: e.title,
      subtitle: e.subtitle ?? null,
      uniqueKey: e.uniqueKey ?? null,
      meta: e.meta ?? null,
    },
    { transaction: t },
  );
}

async function existing(uniqueKey: string | null | undefined) {
  return uniqueKey ? WalletTx.findOne({ where: { uniqueKey } }) : null;
}

const notify = (userId: number, balance: number) => emitToUser(userId, 'wallet:balance', { balance });

// Gems jodo (+) ya kaato (−). uniqueKey diya ho to same cheez dobara nahi judegi.
export async function applyTx(userId: number, amount: number, e: Entry): Promise<{ tx: WalletTx; duplicate: boolean }> {
  const dup = await existing(e.uniqueKey);
  if (dup) return { tx: dup, duplicate: true };
  try {
    const tx = await sequelize.transaction(async t => {
      const { wallet } = await lockWallet(userId, t);
      return post(t, wallet, amount, e);
    });
    notify(userId, tx.balanceAfter);
    return { tx, duplicate: false };
  } catch (err) {
    if (err instanceof UniqueConstraintError && e.uniqueKey) {
      const d = await existing(e.uniqueKey);
      if (d) return { tx: d, duplicate: true };
    }
    throw err;
  }
}

// Wallet lo — naye user ko pehli baar welcome bonus
export async function getWallet(userId: number): Promise<Wallet> {
  const wallet = await Wallet.findByPk(userId);
  if (wallet) return wallet;
  if (!WELCOME_BONUS) return (await Wallet.findOrCreate({ where: { userId }, defaults: { userId } }))[0];
  await applyTx(userId, WELCOME_BONUS, { kind: 'bonus', title: 'Welcome bonus', subtitle: 'New account', uniqueKey: `welcome:${userId}` });
  return (await Wallet.findByPk(userId))!;
}

const vipBonusOf = (p: Pack, vip: boolean) => (vip ? Math.floor(p.gems * VIP_RECHARGE_BONUS) : 0);
// Pehli recharge ka 2× hata diya (Vato me naye user ka alag 'once' pack hai)
export const packGems = (p: Pack, _first: boolean, vip = false) => p.gems + p.bonus + vipBonusOf(p, vip);
// Sabse chhote normal pack ke daam se kitne % zyada gems
const BASE_RATE = 4500 / 199;

export async function walletSummary(userId: number) {
  const [w, user, s] = await Promise.all([getWallet(userId), User.findByPk(userId), getSettings()]);
  const first = w.firstRechargeAt == null;
  const vip = !!user?.isVip;
  return {
    balance: w.balance,
    callRate: userRateFor(s.matchRate, vip, s), // Match ka rate (host ka apna rate card pe)
    vipCallDiscountPct: s.vipCallDiscountPct,
    isVip: vip,
    isHost: !!user?.isHost, // app host ke liye user wale buttons chhupata hai
    hostRate: user?.isHost ? ((await HostProfile.findByPk(userId))?.rate ?? null) : null, // host ka apna rate
    firstRechargeAvailable: first,
    packs: PACKS.filter(p => p.tag !== 'once' || first).map(p => ({
      id: p.id,
      gems: p.gems,
      bonus: p.bonus,
      firstBonus: 0,
      vipBonus: vipBonusOf(p, vip),
      total: packGems(p, first, vip),
      priceInr: p.priceInr,
      bonusPct: p.tag === 'once' ? 0 : Math.max(0, Math.round(((p.gems / p.priceInr) / BASE_RATE - 1) * 100)),
      tag: p.tag,
    })),
  };
}

export type PurchaseProof = { provider: 'dev' | 'google'; token: string };

// Recharge: payment pakka hone ke baad hi gems. Ek token = ek hi baar.
export async function purchasePack(userId: number, packId: string, proof: PurchaseProof) {
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) throw badRequest('Unknown pack');
  if (proof.provider === 'google') {
    // TODO (Play Console): Google Play Developer API se token verify + consume
    throw new HttpError(501, 'billing_not_ready', 'Payments are not available yet');
  }
  // Token lamba ho sakta hai — uska hash rakhte hain
  const uniqueKey = `${proof.provider}:${createHash('sha256').update(proof.token).digest('hex')}`;
  const dup = await existing(uniqueKey);
  if (dup) return { tx: dup, duplicate: true, balance: dup.balanceAfter };

  const tx = await sequelize.transaction(async t => {
    const { wallet, created } = await lockWallet(userId, t);
    if (created && WELCOME_BONUS) await post(t, wallet, WELCOME_BONUS, { kind: 'bonus', title: 'Welcome bonus', subtitle: 'New account', uniqueKey: `welcome:${userId}` });
    const first = wallet.firstRechargeAt == null;
    if (pack.tag === 'once' && !first) throw new HttpError(409, 'offer_used', 'This new-user offer is already used');
    const vip = !!(await User.findByPk(userId, { transaction: t }))?.isVip;
    const gems = packGems(pack, first, vip);
    if (first) wallet.firstRechargeAt = new Date();
    return post(t, wallet, gems, {
      kind: 'recharge',
      title: `Recharge · ₹${pack.priceInr.toLocaleString('en-IN')}`,
      subtitle: proof.provider === 'dev' ? 'Test purchase' : 'Google Play',
      uniqueKey,
      meta: { packId: pack.id, gems: pack.gems, bonus: pack.bonus, firstBonus: 0, vipBonus: vipBonusOf(pack, vip), priceInr: pack.priceInr, provider: proof.provider },
    });
  });
  notify(userId, tx.balanceAfter);
  notifyLater(userId, 'recharge', { data: { gems: tx.amount, priceInr: pack.priceInr }, uniqueKey: `recharge:${tx.id}` });
  // Level: kitne gems kharide (pack ke asli gems, bonus nahi)
  await addXp(userId, pack.gems);
  const fresh = await Wallet.findByPk(userId);
  return { tx, duplicate: false, balance: fresh?.balance ?? tx.balanceAfter };
}

export const txJSON = (t: WalletTx) => ({
  id: t.id,
  kind: t.kind,
  amount: t.amount,
  balanceAfter: t.balanceAfter,
  title: t.title,
  subtitle: t.subtitle,
  // MariaDB JSON ko text me lautata hai
  meta: typeof t.meta === 'string' ? JSON.parse(t.meta) : t.meta,
  createdAt: t.createdAt,
});

export async function history(userId: number, filter: 'all' | 'added' | 'spent', before?: number) {
  const where: WhereOptions = { userId };
  if (filter === 'added') Object.assign(where, { amount: { [Op.gt]: 0 } });
  if (filter === 'spent') Object.assign(where, { amount: { [Op.lt]: 0 } });
  if (before) Object.assign(where, { id: { [Op.lt]: before } });
  const items = await WalletTx.findAll({ where, order: [['id', 'DESC']], limit: 30 });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const inMonth = { userId, createdAt: { [Op.gte]: monthStart } };
  const [added, spent] = await Promise.all([
    WalletTx.sum('amount', { where: { ...inMonth, amount: { [Op.gt]: 0 } } }),
    WalletTx.sum('amount', { where: { ...inMonth, amount: { [Op.lt]: 0 } } }),
  ]);
  return {
    items: items.map(txJSON),
    nextBefore: items.length === 30 ? items[items.length - 1].id : null,
    month: { added: Number(added) || 0, spent: Math.abs(Number(spent) || 0) },
  };
}

// Video call: har call ki ek hi entry, jo har minute badhti hai. upToMinute tak ka total kaat do (dobara chale to kuch nahi).
export async function chargeCallUpTo(
  userId: number,
  callId: number,
  rate: number,
  upToMinute: number,
  peerName: string,
): Promise<{ total: number; balance: number }> {
  const uniqueKey = `call:${callId}`;
  const r = await sequelize.transaction(async t => {
    const { wallet } = await lockWallet(userId, t);
    const tx = await WalletTx.findOne({ where: { uniqueKey }, transaction: t, lock: t.LOCK.UPDATE });
    const already = tx ? -tx.amount : 0;
    const target = upToMinute * rate;
    const due = target - already;
    if (due <= 0) return { total: already, balance: wallet.balance, changed: false, due: 0 };
    if (wallet.balance < due) throw new InsufficientGems(wallet.balance, due);
    wallet.balance -= due;
    await wallet.save({ transaction: t });
    const fields = {
      amount: -target,
      balanceAfter: wallet.balance,
      subtitle: `${upToMinute} min · ${rate}/min`,
      meta: { callId, minutes: upToMinute, rate },
    };
    if (tx) await tx.update(fields, { transaction: t });
    else await WalletTx.create({ userId, kind: 'call', title: `Video call · ${peerName}`, uniqueKey, ...fields }, { transaction: t });
    return { total: target, balance: wallet.balance, changed: true, due };
  });
  if (r.changed) {
    notify(userId, r.balance);
  }
  return { total: r.total, balance: r.balance };
}

export async function balanceOf(userId: number) {
  return (await getWallet(userId)).balance;
}

import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { CHECKIN_REWARDS, VIP_PLANS } from '../lib/pricing.js';
import { CheckIn, User, VipOrder } from '../models/index.js';
import { applyTx } from './wallet.js';
import { notifyLater } from './notifications.js';

// India ka aaj (server kahin bhi ho)
const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const prevDay = (day: string) => istDay(new Date(new Date(`${day}T12:00:00Z`).getTime() - 86_400_000 - 5.5 * 3600_000));

/* ---------------- Daily check-in ---------------- */

export async function checkInStatus(user: User) {
  const today = istDay();
  const last = await CheckIn.findOne({ where: { userId: user.id }, order: [['day', 'DESC']] });
  const claimedToday = last?.day === today;
  const continues = last && (claimedToday || last.day === prevDay(today));
  // Aaj kaunsa din hai (1..7). Claim ho chuka to wahi din, warna agla.
  const day = claimedToday ? last!.streakDay : continues ? (last!.streakDay % 7) + 1 : 1;
  const mult = 1; // Vato jaisa: VIP ko alag check-in nahi
  return {
    day,
    claimedToday,
    streak: continues ? (claimedToday ? last!.streakDay : last!.streakDay) : 0,
    isVip: user.isVip,
    rewards: CHECKIN_REWARDS.map(r => r * mult),
  };
}

export async function claimCheckIn(user: User) {
  const st = await checkInStatus(user);
  if (st.claimedToday) throw new HttpError(409, 'already_claimed', 'Already claimed today — come back tomorrow');
  const today = istDay();
  const reward = st.rewards[st.day - 1];
  try {
    await CheckIn.create({ userId: user.id, day: today, streakDay: st.day, reward });
  } catch {
    throw new HttpError(409, 'already_claimed', 'Already claimed today — come back tomorrow');
  }
  const { tx } = await applyTx(user.id, reward, {
    kind: 'checkin',
    title: 'Daily check-in',
    subtitle: `Day ${st.day}`,
    uniqueKey: `checkin:${user.id}:${today}`,
  });
  return { ...(await checkInStatus(user)), reward, balance: tx.balanceAfter };
}

/* ---------------- VIP ---------------- */

export function vipInfo(user: User) {
  return {
    isVip: user.isVip,
    vipUntil: user.isVip ? user.vipUntil : null,
    plans: VIP_PLANS.map(p => ({ ...p, perWeek: Math.round((p.priceInr / (p.months * 4)) * 100) / 100 })), // Vato jaisa: mahina = 4 hafte
  };
}

export async function buyVip(user: User, planId: string, proof: { provider: 'dev' | 'google'; token: string }) {
  const plan = VIP_PLANS.find(p => p.id === planId);
  if (!plan) throw badRequest('Unknown plan');
  if (proof.provider === 'google') throw new HttpError(501, 'billing_not_ready', 'Payments are not available yet');
  const tokenHash = createHash('sha256').update(`${proof.provider}:${proof.token}`).digest('hex');
  if (await VipOrder.findOne({ where: { tokenHash } })) return vipInfo((await User.findByPk(user.id))!);

  await sequelize.transaction(async t => {
    const u = (await User.findByPk(user.id, { transaction: t, lock: t.LOCK.UPDATE }))!;
    // Pehle se VIP ho to aage se jodo
    const from = u.isVip ? u.vipUntil! : new Date();
    const until = new Date(from);
    until.setMonth(until.getMonth() + plan.months);
    await u.update({ vipUntil: until }, { transaction: t });
    await VipOrder.create(
      { userId: u.id, planId: plan.id, months: plan.months, priceInr: plan.priceInr, provider: proof.provider, tokenHash, vipUntil: until },
      { transaction: t },
    );
  });
  // VIP lete hi bonus gems (ek order = ek hi baar)
  await applyTx(user.id, plan.bonusGems, { kind: 'bonus', title: 'VIP bonus', subtitle: `${plan.months} month VIP`, uniqueKey: `vip:${tokenHash}` });
  const fresh = (await User.findByPk(user.id))!;
  notifyLater(user.id, 'vip', { data: { until: fresh.vipUntil, months: plan.months, bonus: plan.bonusGems }, uniqueKey: `vip:${tokenHash}` });
  return vipInfo(fresh);
}

export const activeVipCount = () => User.count({ where: { vipUntil: { [Op.gt]: new Date() } } });

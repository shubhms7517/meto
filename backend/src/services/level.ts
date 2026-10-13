import { literal } from 'sequelize';
import { emitToUser } from '../lib/realtime.js';
import { LEVELS, levelForXp } from '../lib/pricing.js';
import { User } from '../models/index.js';
import { applyTx } from './wallet.js';
import { notifyLater } from './notifications.js';

// Recharge kiye gems → XP. Naye level(s) pe inaam (har level ka sirf ek baar).
export async function addXp(userId: number, gems: number) {
  if (gems <= 0) return;
  await User.update({ xp: literal(`xp + ${Math.floor(gems)}`) as unknown as number }, { where: { id: userId } });
  const u = await User.findByPk(userId, { attributes: ['id', 'xp', 'level'] });
  if (!u) return;
  const level = levelForXp(u.xp);
  if (level <= u.level) return;
  const from = u.level;
  await User.update({ level }, { where: { id: userId } });
  let reward = 0;
  for (const l of LEVELS) {
    if (l.level <= from || l.level > level || !l.reward) continue;
    await applyTx(userId, l.reward, { kind: 'bonus', title: `Level ${l.level} reward`, subtitle: 'Level up', uniqueKey: `levelreward:${userId}:${l.level}` });
    reward += l.reward;
  }
  emitToUser(userId, 'level:up', { level, reward });
  notifyLater(userId, 'level_up', { data: { level, reward }, uniqueKey: `level:${userId}:${level}` });
}

export function levelInfo(u: User) {
  const cur = LEVELS.find(l => l.level === u.level) ?? LEVELS[0];
  const next = LEVELS.find(l => l.level === u.level + 1) ?? null;
  return {
    level: cur.level,
    xp: u.xp,
    levelXp: cur.xp,
    nextXp: next?.xp ?? null,
    nextReward: next?.reward ?? null,
    tiers: LEVELS.filter(l => l.level > 0).map(l => ({ ...l })),
  };
}

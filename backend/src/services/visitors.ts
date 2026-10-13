import { Op } from 'sequelize';
import { HostProfile, ProfileVisit, User } from '../models/index.js';
import { blockedIds } from './safety.js';

// Profile khuli → visit gino (apni profile nahi). Dobara dekhe to count + samay
export async function recordVisit(ownerId: number, viewerId: number) {
  if (ownerId === viewerId) return;
  const now = new Date();
  const [row, created] = await ProfileVisit.findOrCreate({ where: { ownerId, viewerId }, defaults: { ownerId, viewerId, lastAt: now } });
  if (!created) await row.update({ count: row.count + 1, lastAt: now });
}

// Me screen: kul visitors + naye (pichhli baar list dekhne ke baad)
export async function visitorCounts(user: User) {
  const hidden = await blockedIds(user.id);
  const base = { ownerId: user.id, viewerId: { [Op.notIn]: [0, ...hidden] } };
  const [total, fresh] = await Promise.all([
    ProfileVisit.count({ where: base }),
    ProfileVisit.count({ where: { ...base, lastAt: { [Op.gt]: user.visitorsSeenAt ?? new Date(0) } } }),
  ]);
  return { visitorsCount: total, visitorsNew: fresh };
}

// Visitors list (naye pehle). Dekhte hi "naye" khatam
export async function visitorList(user: User) {
  const hidden = await blockedIds(user.id);
  const rows = await ProfileVisit.findAll({
    where: { ownerId: user.id, viewerId: { [Op.notIn]: [0, ...hidden] } },
    order: [['lastAt', 'DESC']],
    limit: 200,
  });
  const viewers = new Map(
    (
      await User.findAll({
        where: { id: rows.map(r => r.viewerId), status: 'active' },
        include: [{ model: HostProfile, as: 'host', required: false }],
      })
    ).map(u => [u.id, u]),
  );
  const seen = user.visitorsSeenAt ?? new Date(0);
  const items = rows
    .filter(r => viewers.has(r.viewerId))
    .map(r => ({ user: viewers.get(r.viewerId)!.toCardJSON(), count: r.count, lastAt: r.lastAt, isNew: r.lastAt > seen }));
  await user.update({ visitorsSeenAt: new Date() }, { silent: true });
  return { items, total: items.length };
}

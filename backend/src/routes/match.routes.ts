import { Router } from 'express';
import { literal, Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { ONLINE_WINDOW_MS } from '../lib/age.js';
import { requireUser } from '../middleware/auth.js';
import { Call, HostProfile, User } from '../models/index.js';
import { getSettings } from '../lib/settings.js';
import { offerMatch } from '../services/calls.js';
import { HOST_GENDER } from '../services/host.js';
import { blockedIds } from '../services/safety.js';

export const matchRouter = Router();
matchRouter.use(requireUser);

// GET /api/match/next?skip=1,2,3 — abhi online, free, "Online for calls" wali koi random host
matchRouter.get('/next', async (req, res) => {
  const q = z
    .object({
      skip: z.string().max(2000).optional(),
    })
    .parse(req.query);
  const me = req.user!;
  if (me.isHost) {
    res.json({ user: null, rate: 0 });
    return;
  }
  const skipPublic = (q.skip ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);

  const busy = await Call.findAll({ where: { status: ['ringing', 'accepted'] }, attributes: ['callerId', 'calleeId'] });
  const hidden = [me.id, ...(await blockedIds(me.id)), ...busy.flatMap(c => [c.callerId, c.calleeId])];

  const where: WhereOptions = {
    status: 'active',
    name: { [Op.ne]: null },
    role: 'host',
    gender: HOST_GENDER,
    birthday: { [Op.ne]: null },
    id: { [Op.notIn]: hidden },
    lastSeenAt: { [Op.gt]: new Date(Date.now() - ONLINE_WINDOW_MS) },
  };
  if (skipPublic.length) Object.assign(where, { publicId: { [Op.notIn]: skipPublic } });

  const user = await User.findOne({
    where,
    include: [{ model: HostProfile, as: 'host', required: true, where: { status: 'approved', available: true } }],
    order: literal('RAND()'),
  });
  // Match ki call fix rate pe — wo sirf isi mili hui host ke liye (2 min tak)
  const rate = (await getSettings()).matchRate;
  if (user) offerMatch(me.id, user.id);
  res.json({ user: user ? { ...user.toProfileJSON(), rate } : null, rate });
});

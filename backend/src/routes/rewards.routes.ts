import { Router } from 'express';
import { z } from 'zod';
import { isProd } from '../config/env.js';
import { forbidden } from '../lib/errors.js';
import { requireUser } from '../middleware/auth.js';
import { levelInfo } from '../services/level.js';
import { buyVip, checkInStatus, claimCheckIn, vipInfo } from '../services/rewards.js';

export const rewardsRouter = Router();
rewardsRouter.use(requireUser);

rewardsRouter.get('/checkin', async (req, res) => res.json(await checkInStatus(req.user!)));
rewardsRouter.post('/checkin', async (req, res) => res.json(await claimCheckIn(req.user!)));

rewardsRouter.get('/level', (req, res) => res.json(levelInfo(req.user!)));

rewardsRouter.get('/vip', (req, res) => res.json(vipInfo(req.user!)));
rewardsRouter.post('/vip/purchase', async (req, res) => {
  const b = z.object({ planId: z.string().max(20), provider: z.enum(['dev', 'google']), token: z.string().min(8).max(4096) }).parse(req.body);
  if (b.provider === 'dev' && isProd) throw forbidden('dev_purchase_disabled', 'Test purchases are disabled');
  res.json(await buyVip(req.user!, b.planId, { provider: b.provider, token: b.token }));
});

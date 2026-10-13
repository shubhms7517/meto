import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { DeviceToken } from '../models/index.js';

export const devicesRouter = Router();
devicesRouter.use(requireUser);

// POST /api/devices { token } — is phone pe push bhejo (token kisi aur account ka tha to ab is account ka)
devicesRouter.post('/', async (req, res) => {
  const { token } = z.object({ token: z.string().min(20).max(255) }).parse(req.body);
  const [row, created] = await DeviceToken.findOrCreate({ where: { token }, defaults: { token, userId: req.user!.id } });
  if (!created && row.userId !== req.user!.id) await row.update({ userId: req.user!.id });
  else if (!created) {
    row.changed('updatedAt', true); // "abhi bhi use ho raha" — purane token baad me saaf karne ke liye
    await row.save();
  }
  res.json({ ok: true });
});

// DELETE /api/devices { token } — sign out pe
devicesRouter.delete('/', async (req, res) => {
  const { token } = z.object({ token: z.string().min(20).max(255) }).parse(req.body);
  await DeviceToken.destroy({ where: { token, userId: req.user!.id } });
  res.json({ ok: true });
});

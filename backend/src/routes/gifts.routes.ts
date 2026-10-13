import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { giftCatalog, sendGift } from '../services/gifts.js';

export const giftsRouter = Router();
giftsRouter.use(requireUser);

// GET /api/gifts — catalog
giftsRouter.get('/', async (_req, res) => res.json({ gifts: await giftCatalog() }));

const sendLimiter = rateLimit({ windowMs: 10_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });

// POST /api/gifts/send { to, giftId, qty, clientId, callId? }
giftsRouter.post('/send', sendLimiter, async (req, res) => {
  const b = z
    .object({
      to: z.number().int(),
      giftId: z.number().int().positive(),
      qty: z.number().int(),
      clientId: z.string().min(6).max(64),
      callId: z.number().int().positive().optional(),
    })
    .parse(req.body);
  res.json(await sendGift(req.user!, b.to, b.giftId, b.qty, b.clientId, b.callId));
});

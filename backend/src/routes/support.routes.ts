import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { imageUpload, saveImage } from '../lib/upload.js';
import { SUPPORT_TOPICS } from '../models/index.js';
import { sendSupportMessage, supportSummary, supportThread } from '../services/support.js';

export const supportRouter = Router();
supportRouter.use(requireUser);

// GET /api/support — Customer service page (aakhri baat-cheet + naye jawab)
supportRouter.get('/', async (req, res) => res.json(await supportSummary(req.user!.id)));

// GET /api/support/messages — chat (khulte hi naye jawab "dekhe")
supportRouter.get('/messages', async (req, res) => res.json(await supportThread(req.user!.id)));

// POST /api/support/messages (multipart) { topic?, body?, photo? } — spam roko: 20/min
const sendLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
supportRouter.post('/messages', sendLimiter, imageUpload.single('photo'), async (req, res) => {
  const p = z
    .object({ topic: z.enum(SUPPORT_TOPICS).optional(), body: z.string().max(2000).optional() })
    .parse({ topic: req.body?.topic || undefined, body: req.body?.body || undefined });
  const imageUrl = req.file ? env.PUBLIC_BASE_URL + (await saveImage(req.file.buffer, 'support')) : undefined;
  res.status(201).json(await sendSupportMessage(req.user!.id, { ...p, imageUrl }));
});

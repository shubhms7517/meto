import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isProd } from '../config/env.js';
import { forbidden } from '../lib/errors.js';
import { requireUser } from '../middleware/auth.js';
import { history, purchasePack, txJSON, walletSummary } from '../services/wallet.js';

export const walletRouter = Router();
walletRouter.use(requireUser);

// GET /api/wallet — balance + packs
walletRouter.get('/', async (req, res) => res.json(await walletSummary(req.user!.id)));

// GET /api/wallet/history?filter=all|added|spent&before=<id>
walletRouter.get('/history', async (req, res) => {
  const filter = z.enum(['all', 'added', 'spent']).default('all').parse(req.query.filter);
  const before = z.coerce.number().int().positive().optional().parse(req.query.before);
  res.json(await history(req.user!.id, filter, before));
});

const purchaseLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

// POST /api/wallet/purchase { packId, provider, token }
// provider 'dev' = test purchase (sirf development). Asli: 'google' + Play purchase token.
walletRouter.post('/purchase', purchaseLimiter, async (req, res) => {
  const body = z
    .object({
      packId: z.string().max(40),
      provider: z.enum(['dev', 'google']),
      token: z.string().min(8).max(4096),
    })
    .parse(req.body);
  if (body.provider === 'dev' && isProd) throw forbidden('dev_purchase_disabled', 'Test purchases are disabled');
  const r = await purchasePack(req.user!.id, body.packId, { provider: body.provider, token: body.token });
  res.json({ balance: r.balance, tx: txJSON(r.tx), duplicate: r.duplicate });
});

import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { acceptInvite, applyHost, findAgency, hostEarnings, hostSummary, updateHostSettings } from '../services/host.js';
import { badRequest } from '../lib/errors.js';
import { listWithdrawals, requestWithdraw, savePayoutAccount, withdrawInfo } from '../services/withdraw.js';
import { hostApplyUpload } from '../lib/upload.js';

export const hostRouter = Router();
hostRouter.use(requireUser);

// GET /api/host/me — role, application status, rate, points (kamai)
hostRouter.get('/me', async (req, res) => res.json(await hostSummary(req.user!.id)));

// PATCH /api/host/me { rate?, available? } — sirf approved host
hostRouter.patch('/me', async (req, res) => {
  const p = z.object({ rate: z.number().int().positive().optional(), available: z.boolean().optional() }).parse(req.body);
  res.json(await updateHostSettings(req.user!, p));
});

// GET /api/host/agency/:code — code sahi hai? (andaze se code dhoondhna roko: 10/min)
const agencyLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
hostRouter.get('/agency/:code', agencyLimiter, async (req, res) => {
  const code = z.string().trim().min(2).max(20).parse(req.params.code);
  const a = await findAgency(code);
  res.json({ code: a.code, name: a.name });
});

// POST /api/host/invite { code } — agency link se app khula
hostRouter.post('/invite', agencyLimiter, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(2).max(20) }).parse(req.body);
  res.json(await acceptInvite(req.user!, code));
});

// POST /api/host/apply (multipart) photo×3, video×1, selfie×3 — agency invite se
const applyLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
hostRouter.post(
  '/apply',
  applyLimiter,
  hostApplyUpload.fields([
    { name: 'photo', maxCount: 3 },
    { name: 'video', maxCount: 1 },
    { name: 'selfie', maxCount: 3 },
  ]),
  async (req, res) => {
    const f = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    if (!f.video?.[0]) throw badRequest('Please add your intro video');
    res.status(201).json(
      await applyHost(req.user!, { photos: (f.photo ?? []).map(x => x.buffer), video: f.video[0].buffer, selfies: (f.selfie ?? []).map(x => x.buffer) }),
    );
  },
);

// GET /api/host/earnings?kind=all|call|gift|message&before=<id>
hostRouter.get('/earnings', async (req, res) => {
  const kind = z.enum(['all', 'call', 'gift', 'message']).default('all').parse(req.query.kind);
  const before = z.coerce.number().int().positive().optional().parse(req.query.before);
  res.json(await hostEarnings(req.user!.id, kind, before));
});


/* ---------------- Withdraw (UPI) ---------------- */

// GET /api/host/withdraw — balance, min, TDS, UPI/PAN, chalu request
hostRouter.get('/withdraw', async (req, res) => res.json(await withdrawInfo(req.user!)));

// PUT /api/host/payout-account { upiId, upiName, pan, panName }
hostRouter.put('/payout-account', async (req, res) => {
  const p = z.object({ upiId: z.string().max(120), upiName: z.string().max(80), pan: z.string().max(10), panName: z.string().max(80) }).parse(req.body);
  res.json({ account: await savePayoutAccount(req.user!, p) });
});

// POST /api/host/withdrawals { amountInr }
const wdLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
hostRouter.post('/withdrawals', wdLimiter, async (req, res) => {
  const { amountInr } = z.object({ amountInr: z.number().int().positive() }).parse(req.body);
  res.status(201).json({ withdrawal: await requestWithdraw(req.user!, amountInr) });
});

// GET /api/host/withdrawals — history
hostRouter.get('/withdrawals', async (req, res) => res.json({ items: await listWithdrawals(req.user!) }));

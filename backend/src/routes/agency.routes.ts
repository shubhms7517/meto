import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { agencyChangePassword, agencyLogin, agencyLogout, requireAgency } from '../lib/agencyAuth.js';
import * as A from '../services/agency.js';

export const agencyRouter = Router();

const json429 = { error: { code: 'rate_limited', message: 'Too many requests. Please wait a minute' } };
agencyRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: json429 }));
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: json429 });

agencyRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const p = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(200) }).parse(req.body);
  res.json(await agencyLogin(p.email, p.password, req));
});
agencyRouter.post('/auth/logout', async (req, res) => {
  await agencyLogout(req);
  res.json({ ok: true });
});
agencyRouter.get('/me', requireAgency(), (req, res) => res.json({ agency: req.agency!.toPortalJSON() }));
agencyRouter.get('/dashboard', requireAgency(), async (req, res) => res.json(await A.agencyDashboard(req.agency!)));
agencyRouter.get('/hosts', requireAgency(), async (req, res) => res.json(await A.agencyHosts(req.agency!)));
agencyRouter.get('/invite', requireAgency(), async (req, res) => res.json(await A.agencyInvite(req.agency!)));
agencyRouter.post('/account/password', requireAgency(), async (req, res) => {
  const p = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }).parse(req.body);
  await agencyChangePassword(req, p.current, p.next);
  res.json({ ok: true });
});

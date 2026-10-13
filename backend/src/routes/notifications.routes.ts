import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { listNotifications, markRead, unreadCount } from '../services/notifications.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireUser);

// GET /api/notifications?tab=all|calls|gifts|follows|meto&before=<id>
notificationsRouter.get('/', async (req, res) => {
  const tab = z.enum(['all', 'calls', 'gifts', 'follows', 'meto']).default('all').parse(req.query.tab);
  const before = z.coerce.number().int().positive().optional().parse(req.query.before);
  res.json(await listNotifications(req.user!, tab, before));
});

notificationsRouter.get('/unread', async (req, res) => res.json({ unread: await unreadCount(req.user!.id) }));

// POST /api/notifications/read { ids? } — ids na ho to sab
notificationsRouter.post('/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }).parse(req.body ?? {});
  await markRead(req.user!.id, ids);
  res.json({ ok: true });
});

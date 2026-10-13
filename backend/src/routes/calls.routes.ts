import { Router } from 'express';
import { Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { Call, User } from '../models/index.js';
import { acceptCall, callJSON, declineCall, endCall, rateCall, startCall } from '../services/calls.js';

export const callsRouter = Router();
callsRouter.use(requireUser);

const idSchema = z.coerce.number().int().positive();

// POST /api/calls { to, source? } — call lagao (source 'match' = Random match ka fix rate)
callsRouter.post('/', async (req, res) => {
  const { to, source } = z.object({ to: z.number().int(), source: z.enum(['direct', 'match']).default('direct') }).parse(req.body);
  res.status(201).json(await startCall(req.user!, to, source));
});

callsRouter.post('/:id/accept', async (req, res) => res.json(await acceptCall(req.user!, idSchema.parse(req.params.id))));
callsRouter.post('/:id/decline', async (req, res) => res.json({ call: await declineCall(req.user!, idSchema.parse(req.params.id)) }));
callsRouter.post('/:id/end', async (req, res) => res.json({ call: await endCall(req.user!, idSchema.parse(req.params.id)) }));

callsRouter.post('/:id/rate', async (req, res) => {
  const { stars } = z.object({ stars: z.number().int().min(1).max(5) }).parse(req.body);
  await rateCall(req.user!, idSchema.parse(req.params.id), stars);
  res.json({ ok: true });
});

// GET /api/calls/ringing — mujhe abhi bajti hui call (push se app khula ho to incoming screen dikhane ke liye)
callsRouter.get('/ringing', async (req, res) => {
  const call = await Call.findOne({ where: { calleeId: req.user!.id, status: 'ringing' }, order: [['id', 'DESC']] });
  res.json({ call: call ? await callJSON(call) : null });
});

// GET /api/calls?filter=all|missed|called — Call Log
callsRouter.get('/', async (req, res) => {
  const me = req.user!;
  const filter = z.enum(['all', 'missed', 'called']).default('all').parse(req.query.filter);
  const where: WhereOptions =
    filter === 'called'
      ? { callerId: me.id }
      : filter === 'missed'
        ? { calleeId: me.id, status: { [Op.in]: ['missed', 'declined', 'busy'] } }
        : { [Op.or]: [{ callerId: me.id }, { calleeId: me.id }], status: { [Op.notIn]: ['ringing'] } };
  const calls = await Call.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  const ids = [...new Set(calls.flatMap(c => [c.callerId, c.calleeId]))];
  const users = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map(u => [u.id, u]));
  const missedCount = await Call.count({ where: { calleeId: me.id, status: 'missed', createdAt: { [Op.gt]: new Date(Date.now() - 30 * 86_400_000) } } });
  res.json({
    calls: await Promise.all(calls.map(async c => ({ ...(await callJSON(c, users)), outgoing: c.callerId === me.id }))),
    missedCount,
  });
});

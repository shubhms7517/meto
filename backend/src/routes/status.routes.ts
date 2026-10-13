import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { deleteUploadByUrl, imageUpload, saveImage } from '../lib/upload.js';
import { requireUser } from '../middleware/auth.js';
import { Follow, Status, StatusView, User } from '../models/index.js';
import { STATUS_TTL_MS, STATUS_VISIBILITY } from '../models/Status.js';
import { blockedIds, blockState } from '../services/safety.js';

export const statusRouter = Router();
statusRouter.use(requireUser);

const MAX_PER_DAY = 10;
const idSchema = z.coerce.number().int().positive();

const statusJSON = (s: Status, viewed = false) => ({
  id: s.id,
  imageUrl: s.imageUrl,
  caption: s.caption,
  visibility: s.visibility,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt,
  viewed,
});

const active = () => ({ expiresAt: { [Op.gt]: new Date() } });

// POST /api/status — multipart: photo, caption?, visibility?
statusRouter.post('/', imageUpload.single('photo'), async (req, res) => {
  const me = req.user!;
  if (!req.file) throw badRequest('Please choose a photo');
  const p = z
    .object({
      caption: z.string().trim().max(200, 'Caption is too long').optional(),
      visibility: z.enum(STATUS_VISIBILITY).default('everyone'),
    })
    .parse(req.body ?? {});

  const today = await Status.count({ where: { userId: me.id, createdAt: { [Op.gt]: new Date(Date.now() - STATUS_TTL_MS) } } });
  if (today >= MAX_PER_DAY) throw badRequest(`You can post up to ${MAX_PER_DAY} statuses a day`);

  const imageUrl = env.PUBLIC_BASE_URL + (await saveImage(req.file.buffer, 'status'));
  const status = await Status.create({
    userId: me.id,
    imageUrl,
    caption: p.caption || null,
    visibility: p.visibility,
    expiresAt: new Date(Date.now() + STATUS_TTL_MS),
  });
  res.status(201).json({ status: statusJSON(status) });
});

/**
 * GET /api/status/feed — Discover ki "Favourites" row
 * mine: mere status (views count ke saath)
 * people: jinhe main follow karta hoon — jinka status hai YA jo online hain
 * Order: naya (unseen) status → online → baaki
 */
statusRouter.get('/feed', async (req, res) => {
  const me = req.user!;
  const [follows, blocked] = await Promise.all([
    Follow.findAll({ where: { followerId: me.id }, attributes: ['followingId'] }),
    blockedIds(me.id),
  ]);
  const blockedSet = new Set(blocked);
  const ids = follows.map(f => f.followingId).filter(id => !blockedSet.has(id));

  const [mine, theirs, users] = await Promise.all([
    Status.findAll({ where: { userId: me.id, ...active() }, order: [['createdAt', 'ASC']] }),
    // Jinhe main follow karta hoon, unke "followers only" status bhi mujhe dikhenge
    ids.length ? Status.findAll({ where: { userId: ids, ...active() }, order: [['createdAt', 'ASC']] }) : [],
    ids.length
      ? User.findAll({ where: { id: ids, status: 'active', name: { [Op.ne]: null }, gender: { [Op.ne]: null }, birthday: { [Op.ne]: null } } })
      : [],
  ]);

  const [myViews, seen] = await Promise.all([
    mine.length ? StatusView.findAll({ where: { statusId: mine.map(s => s.id) }, attributes: ['statusId', 'liked'] }) : [],
    theirs.length ? StatusView.findAll({ where: { viewerId: me.id, statusId: theirs.map(s => s.id) }, attributes: ['statusId'] }) : [],
  ]);
  const seenSet = new Set(seen.map(v => v.statusId));

  const byUser = new Map<number, Status[]>();
  for (const s of theirs) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s);
  }

  const people = users
    .map(u => {
      const list = byUser.get(u.id) ?? [];
      return {
        user: u.toCardJSON(),
        statuses: list.map(s => statusJSON(s, seenSet.has(s.id))),
        hasUnseen: list.some(s => !seenSet.has(s.id)),
        latestAt: list.at(-1)?.createdAt.getTime() ?? 0,
      };
    })
    .filter(p => p.statuses.length > 0 || p.user.online)
    .sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen) || Number(b.statuses.length > 0) - Number(a.statuses.length > 0) || Number(b.user.online) - Number(a.user.online) || b.latestAt - a.latestAt)
    .map(({ latestAt: _l, ...p }) => p);

  res.json({
    me: { id: me.publicId, avatarUrl: me.avatarUrl },
    mine: mine.map(s => ({
      ...statusJSON(s, true),
      views: myViews.filter(v => v.statusId === s.id).length,
      likes: myViews.filter(v => v.statusId === s.id && v.liked).length,
    })),
    people,
  });
});

// Status jo mujhe dikh sakta hai (block nahi, followers-only hai to main follow karta hoon)
async function visibleStatus(id: number, me: User) {
  const s = await Status.findOne({ where: { id, ...active() } });
  if (!s) throw notFound('This status has expired');
  if (s.userId === me.id) return s;
  const blocks = await blockState(me.id, s.userId);
  if (blocks.blockedByMe || blocks.blockedMe) throw notFound('This status has expired');
  if (s.visibility === 'followers' && !(await Follow.findOne({ where: { followerId: me.id, followingId: s.userId } }))) {
    throw notFound('This status has expired');
  }
  return s;
}

// POST /api/status/:id/view
statusRouter.post('/:id/view', async (req, res) => {
  const me = req.user!;
  const s = await visibleStatus(idSchema.parse(req.params.id), me);
  if (s.userId !== me.id) await StatusView.findOrCreate({ where: { statusId: s.id, viewerId: me.id } });
  res.json({ ok: true });
});

// POST /api/status/:id/like { liked }
statusRouter.post('/:id/like', async (req, res) => {
  const me = req.user!;
  const { liked } = z.object({ liked: z.boolean() }).parse(req.body);
  const s = await visibleStatus(idSchema.parse(req.params.id), me);
  if (s.userId === me.id) throw badRequest('You cannot like your own status');
  const [view] = await StatusView.findOrCreate({ where: { statusId: s.id, viewerId: me.id } });
  await view.update({ liked });
  res.json({ liked });
});

// GET /api/status/:id/viewers — sirf apne status ke
statusRouter.get('/:id/viewers', async (req, res) => {
  const me = req.user!;
  const s = await Status.findOne({ where: { id: idSchema.parse(req.params.id), userId: me.id } });
  if (!s) throw notFound('Status not found');
  const views = await StatusView.findAll({
    where: { statusId: s.id },
    include: [{ model: User, as: 'viewer', required: true }],
    order: [['updatedAt', 'DESC']],
    limit: 500,
  });
  res.json({
    viewers: views.map(v => {
      const u = v.get('viewer') as User;
      return { id: u.publicId, name: u.name, avatarUrl: u.avatarUrl, liked: v.liked, viewedAt: v.createdAt };
    }),
  });
});

// DELETE /api/status/:id — sirf apna
statusRouter.delete('/:id', async (req, res) => {
  const me = req.user!;
  const s = await Status.findOne({ where: { id: idSchema.parse(req.params.id), userId: me.id } });
  if (!s) throw notFound('Status not found');
  await s.destroy();
  await deleteUploadByUrl(s.imageUrl, env.PUBLIC_BASE_URL);
  res.json({ ok: true });
});

/** 24 ghante purane status + unki photos hatao (index.ts se har 30 min) */
export async function purgeExpiredStatuses() {
  const expired = await Status.findAll({ where: { expiresAt: { [Op.lte]: new Date() } }, limit: 500 });
  for (const s of expired) {
    await s.destroy();
    await deleteUploadByUrl(s.imageUrl, env.PUBLIC_BASE_URL);
  }
  if (expired.length) console.log(`🧹 Removed ${expired.length} expired statuses`);
}

import { Router } from 'express';
import { fn, col, literal, Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sequelize } from '../db/sequelize.js';
import { ageOn, ONLINE_WINDOW_MS } from '../lib/age.js';
import { badRequest, notFound } from '../lib/errors.js';
import { deleteUploadByUrl, imageUpload, saveImage, savePublicVideo, videoUpload } from '../lib/upload.js';
import { requireUser } from '../middleware/auth.js';
import { Block, Follow, Gift, GiftTransaction, HostProfile, User, UserPhoto } from '../models/index.js';
import { REPORT_REASONS } from '../models/Safety.js';
import { blockedIds, blockState, blockUser, reportUser, unblockUser } from '../services/safety.js';
import { GENDERS } from '../models/User.js';
import { deleteAccount } from '../services/account.js';
import { notifyLater } from '../services/notifications.js';
import { HOST_GENDER } from '../services/host.js';
import { addHostVideo, profileMedia, unlockMedia } from '../services/media.js';
import { recordVisit, visitorCounts, visitorList } from '../services/visitors.js';
import { UserVideo } from '../models/index.js';
import { MEDIA_KINDS } from '../models/Media.js';

export const usersRouter = Router();
usersRouter.use(requireUser);

const MIN_AGE = 18;
export const LANGUAGES = ['Hindi', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi'] as const;

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(24, 'Name is too long')
    .regex(/^[\p{L}][\p{L} .'-]*$/u, 'Name can only contain letters'),
  gender: z.enum(GENDERS, 'Please select a gender'),
  birthday: z.iso
    .date('Invalid birthday')
    .refine(b => ageOn(b) >= MIN_AGE, `You must be ${MIN_AGE} or older`)
    .refine(b => ageOn(b) <= 100, 'Invalid birthday'),
  bio: z.string().trim().max(300, 'Bio is too long').optional(),
  city: z.string().trim().max(60).optional(),
  languages: z.array(z.enum(LANGUAGES)).max(5, 'Pick up to 5 languages').optional(),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(20),
  online: z.enum(['1', '0']).optional(),
});

// Discover filter
const filterSchema = z.object({
  gender: z.enum(['female', 'male']).optional(),
  minAge: z.coerce.number().int().min(18).max(100).optional(),
  maxAge: z.coerce.number().int().min(18).max(100).optional(),
});

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
// Umar → birthday ki range (minAge = itne saal ka ho chuka, maxAge = abhi maxAge+1 ka nahi hua)
function ageWhere(minAge?: number, maxAge?: number): WhereOptions {
  const now = new Date();
  const range: Record<symbol, string> = {};
  if (minAge) range[Op.lte] = isoDate(new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()));
  if (maxAge) range[Op.gt] = isoDate(new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate()));
  return Object.getOwnPropertySymbols(range).length ? { birthday: { [Op.ne]: null, ...range } } : {};
}

const publicIdSchema = z.coerce.number().int().min(100_000_000).max(999_999_999);

// Sirf poori profile wale, active users dikhte hain
const visibleUsers: WhereOptions = {
  status: 'active',
  name: { [Op.ne]: null },
  gender: { [Op.ne]: null },
  birthday: { [Op.ne]: null },
};

// Host ka rate card pe dikhane ke liye saath me lao
const withHost = () => ({ model: HostProfile, as: 'host', required: false });
// Discover: sirf approved hosts
const approvedHosts = () => ({ model: HostProfile, as: 'host', required: true, where: { status: 'approved' } });

// "Online pehle, phir jo abhi-abhi active the"
const onlineFirst = () => {
  const since = sequelize.escape(new Date(Date.now() - ONLINE_WINDOW_MS));
  return literal(`(last_seen_at IS NOT NULL AND last_seen_at > ${since})`);
};

async function findVisibleUser(rawId: string) {
  const publicId = publicIdSchema.safeParse(rawId);
  if (!publicId.success) throw notFound('User not found');
  const user = await User.findOne({ where: { ...visibleUsers, publicId: publicId.data }, include: [withHost()] });
  if (!user) throw notFound('User not found');
  return user;
}

/* ------------------------------ Apni profile ------------------------------ */

// GET /api/users/me
usersRouter.get('/me', async (req, res) => {
  const me = req.user!;
  const [followingCount, followersCount, photos, videos] = await Promise.all([
    Follow.count({ where: { followerId: me.id } }),
    Follow.count({ where: { followingId: me.id } }),
    UserPhoto.findAll({ where: { userId: me.id }, order: [['position', 'ASC'], ['id', 'ASC']] }),
    UserVideo.findAll({ where: { userId: me.id }, order: [['position', 'ASC'], ['id', 'ASC']] }),
  ]);
  const visits = await visitorCounts(me);
  res.json({ user: { ...me.toPublicJSON(), followingCount, followersCount, ...visits, photos: photos.map(photoJSON), videos: videos.map(v => ({ id: v.id, url: v.url })) } });
});

// POST /api/users/me/ping — app khuli hai (heartbeat). lastSeenAt requireUser me update hota hai.
usersRouter.post('/me/ping', (_req, res) => {
  res.json({ ok: true });
});

// PUT /api/users/me/profile
usersRouter.put('/me/profile', async (req, res) => {
  const data = profileSchema.parse(req.body);
  const user = req.user!;

  // Birthday ek baar set hone ke baad badal nahi sakte (age fraud se bachav)
  if (user.birthday && user.birthday !== data.birthday) {
    throw badRequest('Birthday cannot be changed');
  }

  // Gender bhi ek baar ke baad nahi badalta
  if (user.gender && user.gender !== data.gender) {
    throw badRequest('Gender cannot be changed');
  }

  user.name = data.name;
  user.gender = data.gender;
  user.birthday = data.birthday;
  if (data.bio !== undefined) user.bio = data.bio || null;
  if (data.city !== undefined) user.city = data.city || null;
  if (data.languages !== undefined) user.languages = data.languages.join(',') || null;
  await user.save();

  res.json({ user: user.toPublicJSON() });
});

// PATCH /api/users/me/profile { name?, bio?, city?, languages? } — Edit profile (gender / birthday kabhi nahi badalte)
usersRouter.patch('/me/profile', async (req, res) => {
  const data = profileSchema.pick({ name: true, bio: true, city: true, languages: true }).partial().parse(req.body);
  const user = req.user!;
  if (data.name !== undefined) user.name = data.name;
  if (data.bio !== undefined) user.bio = data.bio || null;
  if (data.city !== undefined) user.city = data.city || null;
  if (data.languages !== undefined) user.languages = data.languages.join(',') || null;
  await user.save();
  res.json({ user: user.toPublicJSON() });
});

// POST /api/users/me/videos — multipart "video" (sirf host; pehla sabko free, baaki user gems se kholte hain)
usersRouter.post('/me/videos', videoUpload.single('video'), async (req, res) => {
  if (!req.file) throw badRequest('Please choose a video');
  if (!req.user!.isHost) throw badRequest('Only hosts can add profile videos');
  const url = env.PUBLIC_BASE_URL + (await savePublicVideo(req.file.buffer));
  const v = await addHostVideo(req.user!, url);
  res.status(201).json({ video: { id: v.id, url: v.url } });
});

// DELETE /api/users/me/videos/:id
usersRouter.delete('/me/videos/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const v = await UserVideo.findOne({ where: { id, userId: req.user!.id } });
  if (!v) throw notFound('Video not found');
  await v.destroy();
  await deleteUploadByUrl(v.url, env.PUBLIC_BASE_URL);
  res.json({ ok: true });
});

// POST /api/users/:publicId/unlock { kind: photo|video, id } — gems dekar host ki photo / video kholo
usersRouter.post('/:publicId/unlock', async (req, res) => {
  const p = z.object({ kind: z.enum(MEDIA_KINDS), id: z.number().int().positive() }).parse(req.body);
  const pid = publicIdSchema.parse(req.params.publicId);
  res.json(await unlockMedia(req.user!, pid, p.kind, p.id));
});

// GET /api/users/me/visitors — kisne meri profile dekhi (naye pehle)
usersRouter.get('/me/visitors', async (req, res) => res.json(await visitorList(req.user!)));

// PATCH /api/users/me/prefs { pushMessages?, pushMissedCalls?, pushGifts?, pushOffers?, hostCanCall? }
usersRouter.patch('/me/prefs', async (req, res) => {
  const p = z
    .object({ pushMessages: z.boolean(), pushMissedCalls: z.boolean(), pushGifts: z.boolean(), pushOffers: z.boolean(), hostCanCall: z.boolean() })
    .partial()
    .parse(req.body);
  const user = req.user!;
  user.prefs = { ...user.settings, ...p };
  await user.save();
  res.json({ prefs: user.settings });
});

// DELETE /api/users/me { confirm: "DELETE" } — account hamesha ke liye hatao (Play Store ka niyam)
usersRouter.delete('/me', async (req, res) => {
  z.object({ confirm: z.literal('DELETE', 'Type DELETE to confirm') }).parse(req.body);
  await deleteAccount(req.user!);
  res.json({ ok: true });
});

// POST /api/users/me/avatar — multipart field "avatar"
usersRouter.post('/me/avatar', imageUpload.single('avatar'), async (req, res) => {
  if (!req.file) {
    throw badRequest('Please choose an image');
  }
  const user = req.user!;
  const oldUrl = user.avatarUrl;
  user.avatarUrl = env.PUBLIC_BASE_URL + (await saveImage(req.file.buffer, 'avatars'));
  await user.save();
  await deleteUploadByUrl(oldUrl, env.PUBLIC_BASE_URL);

  res.json({ user: user.toPublicJSON() });
});

// GET /api/users/me/blocked — maine kisko block kiya
usersRouter.get('/me/blocked', async (req, res) => {
  const rows = await Block.findAll({
    where: { blockerId: req.user!.id },
    include: [{ model: User, as: 'blocked', required: true }],
    order: [['createdAt', 'DESC']],
  });
  res.json({
    users: rows.map(r => {
      const u = r.get('blocked') as User;
      return { id: u.publicId, name: u.name, avatarUrl: u.avatarUrl, blockedAt: r.createdAt };
    }),
  });
});

/* ---------------------------------- Album --------------------------------- */

const MAX_PHOTOS = 9;
const photoJSON = (p: UserPhoto) => ({ id: p.id, url: p.url, isLocked: p.isLocked });

// GET /api/users/me/photos
usersRouter.get('/me/photos', async (req, res) => {
  const photos = await UserPhoto.findAll({ where: { userId: req.user!.id }, order: [['position', 'ASC'], ['id', 'ASC']] });
  res.json({ photos: photos.map(photoJSON) });
});

// POST /api/users/me/photos — multipart field "photo", optional "locked=true"
usersRouter.post('/me/photos', imageUpload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Please choose an image');
  const me = req.user!;
  const count = await UserPhoto.count({ where: { userId: me.id } });
  if (count >= MAX_PHOTOS) throw badRequest(`You can add up to ${MAX_PHOTOS} photos`);

  const url = env.PUBLIC_BASE_URL + (await saveImage(req.file.buffer, 'photos'));
  const photo = await UserPhoto.create({
    userId: me.id,
    url,
    isLocked: req.body?.locked === 'true',
    position: count,
  });
  res.status(201).json({ photo: photoJSON(photo) });
});

// DELETE /api/users/me/photos/:id — sirf apni photo
usersRouter.delete('/me/photos/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw notFound('Photo not found');
  const photo = await UserPhoto.findOne({ where: { id: id.data, userId: req.user!.id } });
  if (!photo) throw notFound('Photo not found');
  await photo.destroy();
  await deleteUploadByUrl(photo.url, env.PUBLIC_BASE_URL);
  res.json({ ok: true });
});

/* -------------------------------- Discover -------------------------------- */

// GET /api/users/discover?page=1&limit=20&online=1
usersRouter.get('/discover', async (req, res) => {
  const { page, limit, online } = pageSchema.parse(req.query);
  const f = filterSchema.parse(req.query);
  const hidden = [req.user!.id, ...(await blockedIds(req.user!.id))];
  // User ko sirf approved hosts; host ko users (wo bhi call / chat kar sakti hai)
  const forHost = req.user!.isHost;
  const where: WhereOptions = forHost
    ? { ...visibleUsers, role: 'user', id: { [Op.notIn]: hidden }, ...ageWhere(f.minAge, f.maxAge) }
    : { ...visibleUsers, role: 'host', gender: HOST_GENDER, id: { [Op.notIn]: hidden }, ...ageWhere(f.minAge, f.maxAge) };
  if (online === '1') {
    Object.assign(where, { lastSeenAt: { [Op.gt]: new Date(Date.now() - ONLINE_WINDOW_MS) } });
  }

  const rows = await User.findAll({
    where,
    include: forHost ? [] : [approvedHosts()],
    order: [[onlineFirst(), 'DESC'], ['lastSeenAt', 'DESC'], ['id', 'DESC']],
    limit: limit + 1, // ek extra — pata chale aage aur hain ya nahi
    offset: (page - 1) * limit,
  });

  res.json({ users: rows.slice(0, limit).map(u => u.toCardJSON()), hasMore: rows.length > limit, page });
});

// GET /api/users/following?online=1 — jinhe maine follow kiya (online=1: sirf jo abhi online hain)
usersRouter.get('/following', async (req, res) => {
  const { page, limit, online } = pageSchema.parse(req.query);
  const followingWhere: WhereOptions = { ...visibleUsers, id: { [Op.notIn]: [0, ...(await blockedIds(req.user!.id))] } };
  if (online === '1') {
    Object.assign(followingWhere, { lastSeenAt: { [Op.gt]: new Date(Date.now() - ONLINE_WINDOW_MS) } });
  }
  const follows = await Follow.findAll({
    where: { followerId: req.user!.id },
    include: [{ model: User, as: 'following', where: followingWhere, required: true, include: [withHost()] }],
    order: online === '1' ? [[{ model: User, as: 'following' }, 'lastSeenAt', 'DESC']] : [['createdAt', 'DESC']],
    limit: limit + 1,
    offset: (page - 1) * limit,
  });
  const users = follows.map(f => (f.get('following') as User).toCardJSON());
  res.json({ users: users.slice(0, limit), hasMore: users.length > limit, page });
});

// GET /api/users/friends — dono ne ek doosre ko follow kiya (online pehle)
usersRouter.get('/friends', async (req, res) => {
  const me = req.user!;
  const iFollow = await Follow.findAll({ where: { followerId: me.id }, attributes: ['followingId'] });
  const ids = iFollow.map(f => f.followingId);
  if (ids.length === 0) {
    res.json({ users: [] });
    return;
  }
  const mutual = await Follow.findAll({ where: { followerId: ids, followingId: me.id }, attributes: ['followerId'] });
  const users = await User.findAll({
    where: { ...visibleUsers, id: { [Op.in]: mutual.map(f => f.followerId), [Op.notIn]: [0, ...(await blockedIds(me.id))] } },
    include: [withHost()],
    order: [[onlineFirst(), 'DESC'], ['lastSeenAt', 'DESC']],
    limit: 200,
  });
  res.json({ users: users.map(u => u.toCardJSON()) });
});

// GET /api/users/followers — jinhone mujhe follow kiya (naye pehle) + maine follow back kiya ya nahi
usersRouter.get('/followers', async (req, res) => {
  const me = req.user!;
  const rows = await Follow.findAll({
    where: { followingId: me.id },
    include: [{ model: User, as: 'follower', where: { ...visibleUsers, id: { [Op.notIn]: [0, ...(await blockedIds(me.id))] } }, required: true, include: [withHost()] }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  const followerIds = rows.map(r => r.followerId);
  const back = followerIds.length
    ? await Follow.findAll({ where: { followerId: me.id, followingId: followerIds }, attributes: ['followingId'] })
    : [];
  const backSet = new Set(back.map(b => b.followingId));
  res.json({
    users: rows.map(r => ({
      ...(r.get('follower') as User).toCardJSON(),
      followedAt: r.createdAt,
      isFollowingBack: backSet.has(r.followerId),
    })),
  });
});

/* ------------------------------ Profile detail ----------------------------- */

// GET /api/users/:publicId
usersRouter.get('/:publicId', async (req, res) => {
  const me = req.user!;
  const user = await findVisibleUser(req.params.publicId);
  const blocks = await blockState(me.id, user.id);
  // Jisne mujhe block kiya, uski profile mere liye "hai hi nahi"
  if (blocks.blockedMe) throw notFound('User not found');
  recordVisit(user.id, me.id).catch(() => {}); // Visitors ginti

  const [media, followersCount, followingRow, giftRows, giftTotals] = await Promise.all([
    profileMedia(user, me.id),
    Follow.count({ where: { followingId: user.id } }),
    Follow.findOne({ where: { followerId: me.id, followingId: user.id } }),
    GiftTransaction.findAll({
      where: { receiverId: user.id },
      attributes: ['giftId', [fn('SUM', col('quantity')), 'count']],
      include: [{ model: Gift, attributes: ['name', 'icon', 'price', 'isRare'] }],
      group: ['giftId', 'Gift.id'],
      order: [[col('Gift.price'), 'DESC']],
      raw: true,
      nest: true,
    }),
    GiftTransaction.findOne({
      where: { receiverId: user.id },
      attributes: [
        [fn('COALESCE', fn('SUM', col('quantity')), 0), 'total'],
        [fn('COUNT', fn('DISTINCT', col('sender_id'))), 'senders'],
      ],
      raw: true,
    }),
  ]);

  const gifts = (giftRows as unknown as { giftId: number; count: string; Gift: { name: string; icon: string; price: number; isRare: boolean } }[]).map(g => ({
    id: g.giftId,
    name: g.Gift.name,
    icon: g.Gift.icon,
    isRare: !!g.Gift.isRare,
    count: Number(g.count),
  }));
  const totals = giftTotals as unknown as { total: string; senders: string } | null;

  res.json({
    user: {
      ...user.toProfileJSON(),
      followersCount,
      isFollowing: !!followingRow,
      isMe: user.id === me.id,
      isBlockedByMe: blocks.blockedByMe,
      ...(blocks.blockedByMe ? { online: false, lastSeenAt: null } : {}),
      // Locked photo ka asli URL nahi bhejte — unlock feature baad me
      photos: media.photos,
      videos: media.videos,
      gifts,
      giftTotal: Number(totals?.total ?? 0),
      giftSenders: Number(totals?.senders ?? 0),
    },
  });
});

// POST /api/users/:publicId/follow
usersRouter.post('/:publicId/follow', async (req, res) => {
  const me = req.user!;
  const user = await findVisibleUser(req.params.publicId);
  if (user.id === me.id) throw badRequest('You cannot follow yourself');
  const blocks = await blockState(me.id, user.id);
  if (blocks.blockedByMe || blocks.blockedMe) throw badRequest('You can’t follow this user');
  const [, created] = await Follow.findOrCreate({ where: { followerId: me.id, followingId: user.id } });
  if (created) notifyLater(user.id, 'follow', { actorId: me.id, uniqueKey: `follow:${me.id}:${user.id}:${new Date().toISOString().slice(0, 10)}` });
  res.json({ isFollowing: true, followersCount: await Follow.count({ where: { followingId: user.id } }) });
});

// DELETE /api/users/:publicId/follow
usersRouter.delete('/:publicId/follow', async (req, res) => {
  const me = req.user!;
  const user = await findVisibleUser(req.params.publicId);
  await Follow.destroy({ where: { followerId: me.id, followingId: user.id } });
  res.json({ isFollowing: false, followersCount: await Follow.count({ where: { followingId: user.id } }) });
});

/* --------------------------------- Safety --------------------------------- */

// Block/report ke liye: review wale user ko bhi (Discover se chhupa ho tab bhi) block/report kar sakte hain
async function findAnyUser(rawId: string, me: User) {
  const publicId = publicIdSchema.safeParse(rawId);
  if (!publicId.success) throw notFound('User not found');
  const user = await User.findOne({ where: { publicId: publicId.data } });
  if (!user) throw notFound('User not found');
  if (user.id === me.id) throw badRequest('You cannot do this to yourself');
  return user;
}

// POST /api/users/:publicId/block
usersRouter.post('/:publicId/block', async (req, res) => {
  const me = req.user!;
  await blockUser(me, await findAnyUser(req.params.publicId, me));
  res.json({ blocked: true });
});

// DELETE /api/users/:publicId/block
usersRouter.delete('/:publicId/block', async (req, res) => {
  const me = req.user!;
  await unblockUser(me, await findAnyUser(req.params.publicId, me));
  res.json({ blocked: false });
});

// POST /api/users/:publicId/report { reason, details?, conversationId?, block? }
const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, 'Please choose a reason'),
  details: z.string().trim().max(500).optional(),
  conversationId: z.number().int().positive().optional(),
  block: z.boolean().optional(),
});
usersRouter.post('/:publicId/report', async (req, res) => {
  const me = req.user!;
  const p = reportSchema.parse(req.body);
  const other = await findAnyUser(req.params.publicId, me);
  await reportUser(me, other, p.reason, p.details || null, p.conversationId ?? null);
  if (p.block) await blockUser(me, other);
  res.status(201).json({ ok: true, blocked: !!p.block });
});

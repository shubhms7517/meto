import { HttpError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { getSettings } from '../lib/settings.js';
import { Op } from 'sequelize';
import { Call, Conversation, MediaUnlock, User, UserPhoto, UserVideo } from '../models/index.js';
import type { MediaKind } from '../models/Media.js';
import { applyHostTx } from './host.js';
import { applyTx } from './wallet.js';

// Do log aapas me baat kar chuke? (koi message ya call)
async function haveTalked(a: number, b: number) {
  const pair = a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };
  const conv = await Conversation.findOne({ where: { ...pair, lastMessageId: { [Op.ne]: null } }, attributes: ['id'] });
  if (conv) return true;
  const call = await Call.findOne({ where: { [Op.or]: [{ callerId: a, calleeId: b }, { callerId: b, calleeId: a }] }, attributes: ['id'] });
  return !!call;
}

export type MediaItem = { id: number; url: string | null; isLocked: boolean; price: number };

// Host ki photos / videos — viewer ke hisaab se: pehle N free, baaki lock (jab tak kholi na ho)
export async function profileMedia(owner: User, viewerId: number) {
  const s = await getSettings();
  const [photos, videos] = await Promise.all([
    UserPhoto.findAll({ where: { userId: owner.id }, order: [['position', 'ASC'], ['id', 'ASC']], limit: 12 }),
    owner.isHost ? UserVideo.findAll({ where: { userId: owner.id }, order: [['position', 'ASC'], ['id', 'ASC']] }) : Promise.resolve([] as UserVideo[]),
  ]);
  const self = owner.id === viewerId;
  const unlocked = self || !owner.isHost ? [] : await MediaUnlock.findAll({ where: { userId: viewerId }, attributes: ['kind', 'mediaId'] });
  const has = (k: MediaKind, id: number) => unlocked.some(u => u.kind === k && Number(u.mediaId) === id);
  // Aam user ki private photo: sirf unhe jinse chat ya call hui ho
  const talked = self || owner.isHost ? false : await haveTalked(owner.id, viewerId);

  const photoItems: MediaItem[] = photos.map((p, i) => {
    // Host: index se lock (pehli N free). Aam user: purana "private" nishaan
    const locked = !self && (owner.isHost ? i >= s.freePhotos && !has('photo', p.id) : p.isLocked && !talked);
    return { id: p.id, url: locked ? null : p.url, isLocked: locked, price: owner.isHost ? s.photoUnlockPrice : 0 };
  });
  const videoItems: MediaItem[] = videos.map((v, i) => {
    const locked = !self && i >= s.freeVideos && !has('video', v.id);
    return { id: v.id, url: locked ? null : v.url, isLocked: locked, price: s.videoUnlockPrice };
  });
  return { photos: photoItems, videos: videoItems };
}

// User gems dekar host ki photo / video kholta hai → host ko points. Ek baar = hamesha.
export async function unlockMedia(viewer: User, hostPublicId: number, kind: MediaKind, mediaId: number) {
  const host = await User.findOne({ where: { publicId: hostPublicId } });
  if (!host || !host.isHost) throw notFound('Host not found');
  if (host.id === viewer.id) throw badRequest('This is your own profile');
  const item =
    kind === 'photo'
      ? await UserPhoto.findOne({ where: { id: mediaId, userId: host.id } })
      : await UserVideo.findOne({ where: { id: mediaId, userId: host.id } });
  if (!item) throw notFound('Not found');

  const existing = await MediaUnlock.findOne({ where: { userId: viewer.id, kind, mediaId } });
  if (existing) return { url: item.url, balance: null };

  const s = await getSettings();
  const price = kind === 'photo' ? s.photoUnlockPrice : s.videoUnlockPrice;
  if (viewer.isHost) throw forbidden('not_allowed', 'Hosts can’t unlock media');
  const key = `unlock:${viewer.id}:${kind}:${mediaId}`;
  const { tx } = await applyTx(viewer.id, -price, {
    kind: 'unlock',
    title: `${kind === 'photo' ? 'Photo' : 'Video'} · ${host.name ?? 'Host'}`,
    subtitle: 'Unlocked',
    uniqueKey: key,
    meta: { host: host.publicId, kind, mediaId },
  });
  try {
    await MediaUnlock.create({ userId: viewer.id, kind, mediaId, price });
  } catch {
    // dobara tap (race) — unique index; gems ek hi baar kate (uniqueKey)
  }
  await applyHostTx(host.id, Math.floor(price * s.hostPointsPerGem), {
    kind: 'unlock',
    title: `${kind === 'photo' ? 'Photo' : 'Video'} unlocked · ${viewer.name ?? 'User'}`,
    uniqueKey: key,
  }).catch(e => console.error('host unlock credit', e));
  return { url: item.url, balance: tx.balanceAfter };
}

export async function addHostVideo(user: User, url: string) {
  if (!user.isHost) throw forbidden('not_host', 'Only hosts can add profile videos');
  const s = await getSettings();
  const n = await UserVideo.count({ where: { userId: user.id } });
  if (n >= s.maxHostVideos) throw new HttpError(409, 'too_many_videos', `You can add up to ${s.maxHostVideos} videos`);
  return UserVideo.create({ userId: user.id, url, position: n });
}

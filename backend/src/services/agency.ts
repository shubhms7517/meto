import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { env } from '../config/env.js';
import { ONLINE_WINDOW_MS } from '../lib/age.js';
import { badRequest, notFound } from '../lib/errors.js';
import { agencyCommission } from '../lib/settings.js';
import { Agency, AgencyGemTx, HostProfile, User } from '../models/index.js';
import { applyTx } from './wallet.js';
import { addXp } from './level.js';
import { notifyLater } from './notifications.js';

const utc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const q = <T extends object>(sql: string, replacements: Record<string, unknown> = {}) =>
  sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
const abs = (url: string | null) => (!url ? null : url.startsWith('/') ? env.PUBLIC_BASE_URL + url : url);
const days30 = () => utc(new Date(Date.now() - 30 * 86_400_000));

// Abhi PC ka server (same WiFi wale phone khol sakte hain). Domain live → .env me INVITE_BASE_URL=https://meto.app
export const inviteLink = (code: string) => `${(env.INVITE_BASE_URL ?? env.PUBLIC_BASE_URL).replace(/\/+$/, '')}/join?agency=${encodeURIComponent(code)}`;

// Agency ke apne hosts (host_profiles.agency_id)
async function hostRows(agency: Agency) {
  return q<{ user_id: number; status: string; reviewed_at: Date | null; pts: number; ptsAll: number; calls: number }>(
    `SELECT hp.user_id, hp.status, hp.reviewed_at,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= :d THEN ht.points ELSE 0 END), 0) pts,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= :since THEN ht.points ELSE 0 END), 0) ptsAll,
            COALESCE(SUM(CASE WHEN ht.kind = 'call' AND ht.created_at >= :d THEN 1 ELSE 0 END), 0) calls
       FROM host_profiles hp
       LEFT JOIN host_transactions ht ON ht.user_id = hp.user_id
      WHERE hp.agency_id = :aid
      GROUP BY hp.user_id, hp.status, hp.reviewed_at`,
    { aid: agency.id, d: days30(), since: utc(agency.createdAt) },
  );
}

export async function agencyDashboard(agency: Agency) {
  const rows = await hostRows(agency);
  const ids = rows.map((r) => Number(r.user_id));
  const users = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map((u) => [u.id, u]));
  const online = (uid: number) => {
    const u = users.get(uid);
    return !!u?.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  };
  const approved = rows.filter((r) => r.status === 'approved');
  const hostGems = rows.reduce((n, r) => n + Number(r.ptsAll), 0); // agency banne ke baad se
  const hostGems30 = rows.reduce((n, r) => n + Number(r.pts), 0);
  // Commission sirf beans me (% / rate agency ko nahi dikhate)
  const commissionBeans = agencyCommission(agency, hostGems).beans;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const usersThisMonth = await AgencyGemTx.count({
    where: { agencyId: agency.id, kind: 'send', createdAt: { [Op.gte]: monthStart } },
    distinct: true,
    col: 'userId',
  });

  // recent activity (agency ke hosts ke latest host_transactions)
  const recent = ids.length
    ? await q<{ uid: number; title: string; subtitle: string | null; points: number; at: Date }>(
        `SELECT user_id uid, title, subtitle, points, created_at at
           FROM host_transactions
          WHERE user_id IN (:ids) AND points > 0 AND kind IN ('call','gift','message','unlock')
          ORDER BY id DESC LIMIT 12`,
        { ids },
      )
    : [];

  return {
    agency: { ...agency.toPortalJSON(), inviteLink: inviteLink(agency.code) },
    counts: {
      hosts: rows.length,
      approved: approved.length,
      pending: rows.filter((r) => r.status === 'pending').length,
      online: rows.filter((r) => online(Number(r.user_id))).length,
    },
    gemBalance: Number(agency.gemBalance),
    hostGems,
    hostGems30,
    commissionBeans,
    usersThisMonth,
    calls30d: approved.reduce((n, r) => n + Number(r.calls), 0),
    recent: recent.map((r) => {
      const u = users.get(Number(r.uid));
      return {
        host: u ? { name: u.name, publicId: u.publicId, avatarUrl: abs(u.avatarUrl), online: online(u.id) } : null,
        title: r.title,
        subtitle: r.subtitle,
        gems: Number(r.points),
        at: r.at,
      };
    }),
  };
}

export async function agencyHosts(agency: Agency) {
  const rows = await hostRows(agency);
  const users = new Map((rows.length ? await User.findAll({ where: { id: rows.map((r) => Number(r.user_id)) } }) : []).map((u) => [u.id, u]));
  return {
    items: rows
      .map((r) => {
        const u = users.get(Number(r.user_id));
        return {
          name: u?.name ?? null,
          publicId: u?.publicId ?? null,
          avatarUrl: abs(u?.avatarUrl ?? null),
          age: u?.age ?? null,
          online: !!u?.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
          status: r.status,
          calls: Number(r.calls),
          gems30: Number(r.pts), // 30 din ke gems
          gems: Number(r.ptsAll), // agency banne ke baad se
          joinedAt: r.reviewed_at,
        };
      })
      .sort((a, b) => b.gems30 - a.gems30),
  };
}

// Invite link page: link + is link se kitne aaye
export async function agencyInvite(agency: Agency) {
  const [st] = await q<{ signed: number; pending: number; approved: number; rejected: number }>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE invite_agency_id = :aid) signed,
       (SELECT COUNT(*) FROM host_profiles WHERE agency_id = :aid AND status = 'pending') pending,
       (SELECT COUNT(*) FROM host_profiles WHERE agency_id = :aid AND status IN ('approved','suspended')) approved,
       (SELECT COUNT(*) FROM host_profiles WHERE agency_id = :aid AND status = 'rejected') rejected`,
    { aid: agency.id },
  );
  return {
    code: agency.code,
    link: inviteLink(agency.code),
    counts: { signedUp: Number(st?.signed ?? 0), pending: Number(st?.pending ?? 0), approved: Number(st?.approved ?? 0), rejected: Number(st?.rejected ?? 0) },
  };
}

/* ---------------- Gems: agency → user ---------------- */

const userLite = (u: User) => ({ publicId: u.publicId, name: u.name, age: u.age, avatarUrl: abs(u.avatarUrl), isHost: u.isHost });

// Meto ID se user dhoondo (gems bhejne se pehle naam dikhane ke liye)
export async function findUserForGems(publicId: number) {
  const u = await User.findOne({ where: { publicId } });
  if (!u || u.status !== 'active') throw notFound('No user with this Meto ID');
  if (u.isHost) throw badRequest('This is a host. Gems can be sent only to users');
  return userLite(u);
}

// Agency ke stock se user ko gems. Agency ka balance aur ledger ek transaction me;
// user ke wallet me alag (idempotent key se — dobara nahi judta).
export async function sendGems(agencyId: number, publicId: number, gems: number) {
  if (!Number.isInteger(gems) || gems < 1 || gems > 10_000_000) throw badRequest('Enter gems between 1 and 1,00,00,000');
  const u = await User.findOne({ where: { publicId } });
  if (!u || u.status !== 'active') throw notFound('No user with this Meto ID');
  if (u.isHost) throw badRequest('This is a host. Gems can be sent only to users');
  const { tx, agency } = await sequelize.transaction(async (t) => {
    const a = await Agency.findByPk(agencyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!a || a.status !== 'active') throw notFound('Agency not found');
    if (Number(a.gemBalance) < gems) throw badRequest(`You have only ${Number(a.gemBalance).toLocaleString('en-IN')} gems`);
    a.gemBalance = Number(a.gemBalance) - gems;
    await a.save({ transaction: t });
    const row = await AgencyGemTx.create({ agencyId: a.id, kind: 'send', gems: -gems, balanceAfter: a.gemBalance, userId: u.id, adminId: null }, { transaction: t });
    return { tx: row, agency: a };
  });
  try {
    await applyTx(u.id, gems, { kind: 'agency', title: `Gems from ${agency.name}`, subtitle: agency.code, uniqueKey: `agency:${tx.id}` });
  } catch (e) {
    // User ke wallet me nahi gaye → agency ko wapas (ledger me ulta entry nahi, send wali line hata do)
    await sequelize.transaction(async (t) => {
      const a = await Agency.findByPk(agencyId, { transaction: t, lock: t.LOCK.UPDATE });
      if (a) await a.update({ gemBalance: Number(a.gemBalance) + gems }, { transaction: t });
      await tx.destroy({ transaction: t });
    });
    throw e;
  }
  await addXp(u.id, gems); // kharidari jaisa — level me gina jaata hai
  notifyLater(u.id, 'notice', { data: { title: `${agency.name} sent you ${gems.toLocaleString('en-IN')} gems 💎`, body: 'They are in your wallet now.' } });
  return { gemBalance: Number(agency.gemBalance), user: userLite(u), gems };
}

// Agency ki gems history (admin ne diye / users ko bheje)
export async function agencyGemsHistory(agency: Agency) {
  const rows = await AgencyGemTx.findAll({ where: { agencyId: agency.id }, order: [['id', 'DESC']], limit: 200 });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is number => x != null))];
  const users = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map((u) => [u.id, u]));
  return {
    gemBalance: Number(agency.gemBalance),
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind, // admin_add = Meto team ne diye, send = user ko bheje
      gems: Number(r.gems),
      balanceAfter: Number(r.balanceAfter),
      user: r.userId && users.get(r.userId) ? userLite(users.get(r.userId)!) : null,
      at: r.createdAt,
    })),
  };
}

import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { env } from '../config/env.js';
import { ONLINE_WINDOW_MS } from '../lib/age.js';
import { getSettings } from '../lib/settings.js';
import { Agency, HostProfile, User } from '../models/index.js';

const utc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const q = <T extends object>(sql: string, replacements: Record<string, unknown> = {}) =>
  sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
const abs = (url: string | null) => (!url ? null : url.startsWith('/') ? env.PUBLIC_BASE_URL + url : url);
const days30 = () => utc(new Date(Date.now() - 30 * 86_400_000));

export const inviteLink = (code: string) => `https://meto.app/join?agency=${code}`;

// Agency ke apne hosts (host_profiles.agency_id)
async function hostRows(agencyId: number) {
  return q<{ user_id: number; status: string; reviewed_at: Date | null; pts: number; calls: number }>(
    `SELECT hp.user_id, hp.status, hp.reviewed_at,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= :d THEN ht.points ELSE 0 END), 0) pts,
            COALESCE(SUM(CASE WHEN ht.kind = 'call' AND ht.created_at >= :d THEN 1 ELSE 0 END), 0) calls
       FROM host_profiles hp
       LEFT JOIN host_transactions ht ON ht.user_id = hp.user_id
      WHERE hp.agency_id = :aid
      GROUP BY hp.user_id, hp.status, hp.reviewed_at`,
    { aid: agencyId, d: days30() },
  );
}

export async function agencyDashboard(agency: Agency) {
  const s = await getSettings();
  const rows = await hostRows(agency.id);
  const ids = rows.map((r) => Number(r.user_id));
  const users = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map((u) => [u.id, u]));
  const online = (uid: number) => {
    const u = users.get(uid);
    return !!u?.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  };
  const approved = rows.filter((r) => r.status === 'approved');
  const pts = rows.reduce((n, r) => n + Number(r.pts), 0);
  const earningsInr = Math.round(pts / s.pointsPerInr);

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
    earningsInr,
    calls30d: approved.reduce((n, r) => n + Number(r.calls), 0),
    recent: recent.map((r) => {
      const u = users.get(Number(r.uid));
      return {
        host: u ? { name: u.name, publicId: u.publicId, avatarUrl: abs(u.avatarUrl), online: online(u.id) } : null,
        title: r.title,
        subtitle: r.subtitle,
        inr: Math.round(Number(r.points) / s.pointsPerInr),
        at: r.at,
      };
    }),
  };
}

export async function agencyHosts(agency: Agency) {
  const s = await getSettings();
  const rows = await hostRows(agency.id);
  const users = new Map((rows.length ? await User.findAll({ where: { id: rows.map((r) => Number(r.user_id)) } }) : []).map((u) => [u.id, u]));
  return {
    items: rows
      .map((r) => {
        const u = users.get(Number(r.user_id));
        const earningsInr = Math.round(Number(r.pts) / s.pointsPerInr);
        return {
          name: u?.name ?? null,
          publicId: u?.publicId ?? null,
          avatarUrl: abs(u?.avatarUrl ?? null),
          age: u?.age ?? null,
          online: !!u?.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
          status: r.status,
          calls: Number(r.calls),
          earningsInr,
          joinedAt: r.reviewed_at,
        };
      })
      .sort((a, b) => b.earningsInr - a.earningsInr),
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

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import agoraToken from "agora-token";
import { Op, QueryTypes, type WhereOptions } from "sequelize";
import { sequelize } from "../db/sequelize.js";
import { env } from "../config/env.js";
import { ONLINE_WINDOW_MS } from "../lib/age.js";
import { badRequest, notFound } from "../lib/errors.js";
import {
  agencyCommission,
  gemsPerInr,
  gemsToBeans,
  getSettings,
  hostRange,
  SETTING_DEFAULTS,
  setSetting,
  type SettingKey,
  type Settings,
} from "../lib/settings.js";
import {
  Admin,
  Agency,
  AgencyGemTx,
  AuditLog,
  Call,
  DeletedAccount,
  DeviceToken,
  Gift,
  HostProfile,
  HostTx,
  HostWallet,
  Message,
  PayoutAccount,
  Report,
  SupportMessage,
  SupportTicket,
  User,
  UserPhoto,
  UserVideo,
  Wallet,
  WalletTx,
  Withdrawal,
} from "../models/index.js";
import { applyHostTx } from "./host.js";
import { applyTx } from "./wallet.js";
import { notify } from "./notifications.js";

const { RtcTokenBuilder, RtcRole } = agoraToken;

/* ---------------- helpers ---------------- */

const utc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const fixDates = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v instanceof Date ? utc(v) : v]),
  );
const q = <T extends object>(
  sql: string,
  replacements: Record<string, unknown> = {},
) =>
  sequelize.query<T>(sql, {
    type: QueryTypes.SELECT,
    replacements: fixDates(replacements),
  });
const one = async <T extends object>(
  sql: string,
  replacements: Record<string, unknown> = {},
) => (await q<T>(sql, replacements))[0]!;
const startOfDay = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) =>
  new Date(startOfDay().getTime() - n * 86_400_000);
const json = <T>(v: unknown): T | null =>
  typeof v === "string" ? (JSON.parse(v) as T) : ((v as T) ?? null);
const maskPhone = (p: string | null) =>
  p ? p.replace(/^(\+\d{2})(\d{2})\d+(\d{2})$/, "$1 $2•••••$3") : null;
const maskPan = (p: string) =>
  p.length === 10 ? `${p.slice(0, 5)}••••${p.slice(9)}` : "••••";
const abs = (url: string | null) =>
  !url
    ? url
    : url.startsWith("/")
      ? env.PUBLIC_BASE_URL + url
      : url.replace(
          /^https?:\/\/[^/]+:4000\/uploads\//,
          `${env.PUBLIC_BASE_URL}/uploads/`,
        );

export const userCard = (u: User) => ({
  id: u.id,
  publicId: u.publicId,
  name: u.name,
  age: u.age,
  gender: u.gender,
  avatarUrl: abs(u.avatarUrl),
  role: u.role,
  status: u.status,
  online:
    !!u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
});

async function findUser(publicId: number) {
  const u = await User.findOne({ where: { publicId } });
  if (!u) throw notFound("User not found");
  return u;
}

/* ---------------- private files ---------------- */

const FILE_SECRET = randomBytes(32);
const sign = (path: string, exp: number) =>
  createHmac("sha256", FILE_SECRET)
    .update(`${path}|${exp}`)
    .digest("base64url");

export function signedPrivateUrl(path: string) {
  const exp = Date.now() + 15 * 60_000;
  return `${env.PUBLIC_BASE_URL}/api/admin/private?p=${encodeURIComponent(path)}&e=${exp}&s=${sign(path, exp)}`;
}

export function verifyPrivate(path: string, exp: number, sig: string) {
  if (!path || !Number.isFinite(exp) || exp < Date.now() || path.includes(".."))
    return false;
  const want = Buffer.from(sign(path, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/* ---------------- dashboard ---------------- */

const RECHARGE_INR =
  "SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.priceInr')) AS UNSIGNED))";

export async function dashboard(range: "today" | "7d" | "30d") {
  const from =
    range === "today" ? startOfDay() : daysAgo(range === "7d" ? 6 : 29);
  const s = await getSettings();
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const [rech, earn, newUsers, newHosts, vip, online, live, calls, pend] =
    await Promise.all([
      one<{ inr: number | null; n: number }>(
        `SELECT ${RECHARGE_INR} inr, COUNT(*) n FROM wallet_transactions WHERE kind='recharge' AND created_at >= :from`,
        { from },
      ),
      one<{ pts: number | null }>(
        `SELECT SUM(points) pts FROM host_transactions WHERE points > 0 AND kind IN ('call','gift','message','unlock') AND created_at >= :from`,
        { from },
      ),
      one<{ n: number }>(
        `SELECT COUNT(*) n FROM users WHERE created_at >= :from AND firebase_uid NOT LIKE 'seed_%'`,
        { from },
      ),
      one<{ n: number }>(
        `SELECT COUNT(*) n FROM host_profiles WHERE status='approved' AND reviewed_at >= :from`,
        { from },
      ),
      one<{ n: number }>(
        `SELECT COUNT(*) n FROM vip_orders WHERE created_at >= :from`,
        { from },
      ),
      q<{ role: string; n: number }>(
        `SELECT role, COUNT(*) n FROM users WHERE last_seen_at > :since AND status='active' GROUP BY role`,
        { since: onlineSince },
      ),
      one<{ n: number; avg: number | null }>(
        `SELECT COUNT(*) n, AVG(TIMESTAMPDIFF(SECOND, answered_at, UTC_TIMESTAMP())) avg FROM calls WHERE status='accepted'`,
      ),
      one<{ n: number; sec: number | null; short: number | null }>(
        `SELECT COUNT(*) n, SUM(duration_sec) sec, SUM(duration_sec < 60) short FROM calls WHERE answered_at IS NOT NULL AND answered_at >= :from`,
        { from },
      ),
      pending(),
    ]);

  const rechargeInr = Number(rech.inr ?? 0);
  const hostInr = Number(earn.pts ?? 0) / gemsPerInr(s);
  const callsN = Number(calls.n ?? 0);

  const days = range === "30d" ? 30 : 7;
  const chartFrom = daysAgo(days - 1);
  const [rc, hc] = await Promise.all([
    q<{ d: string; v: number }>(
      `SELECT DATE(created_at + INTERVAL 330 MINUTE) d, ${RECHARGE_INR} v FROM wallet_transactions WHERE kind='recharge' AND created_at >= :f GROUP BY DATE(created_at + INTERVAL 330 MINUTE)`,
      { f: chartFrom },
    ),
    q<{ d: string; v: number }>(
      `SELECT DATE(created_at + INTERVAL 330 MINUTE) d, SUM(points) v FROM host_transactions WHERE points > 0 AND kind IN ('call','gift','message','unlock') AND created_at >= :f GROUP BY DATE(created_at + INTERVAL 330 MINUTE)`,
      { f: chartFrom },
    ),
  ]);
  const key = (d: Date | string) =>
    typeof d === "string"
      ? d.slice(0, 10)
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rcm = new Map(rc.map((r) => [key(r.d), Number(r.v ?? 0)]));
  const hcm = new Map(
    hc.map((r) => [key(r.d), Number(r.v ?? 0) / gemsPerInr(s)]),
  );
  const chart = Array.from({ length: days }, (_, i) => {
    const d = new Date(chartFrom.getTime() + i * 86_400_000);
    return {
      day: key(d),
      recharge: rcm.get(key(d)) ?? 0,
      hosts: Math.round(hcm.get(key(d)) ?? 0),
    };
  });

  const [topHosts, topSpenders] = await Promise.all([
    q<{ uid: number; v: number }>(
      `SELECT user_id uid, SUM(points) v FROM host_transactions WHERE points > 0 AND kind IN ('call','gift','message','unlock') AND created_at >= :from GROUP BY user_id ORDER BY v DESC LIMIT 5`,
      { from },
    ),
    q<{ uid: number; v: number }>(
      `SELECT user_id uid, ${RECHARGE_INR} v FROM wallet_transactions WHERE kind='recharge' AND created_at >= :from GROUP BY user_id ORDER BY v DESC LIMIT 5`,
      { from },
    ),
  ]);
  const people = new Map(
    (
      await User.findAll({
        where: { id: [...topHosts, ...topSpenders].map((r) => r.uid) },
        include: [{ model: HostProfile, as: "host", required: false }],
      })
    ).map((u) => [u.id, u]),
  );
  const agencyNames = new Map(
    (await Agency.findAll()).map((a) => [a.id, a.name]),
  );

  return {
    range,
    recharge: { inr: rechargeInr, count: Number(rech.n ?? 0) },
    paidToHostsInr: Math.round(hostInr),
    ownerEarningsInr: Math.round(rechargeInr - hostInr),
    newUsers: Number(newUsers.n),
    newHosts: Number(newHosts.n),
    vipBought: Number(vip.n),
    online: {
      hosts: Number(online.find((o) => o.role === "host")?.n ?? 0),
      users: Number(online.find((o) => o.role === "user")?.n ?? 0),
    },
    liveCalls: {
      count: Number(live.n ?? 0),
      avgSec: Math.round(Number(live.avg ?? 0)),
    },
    calls: {
      count: callsN,
      minutes: Math.round(Number(calls.sec ?? 0) / 60),
      shortPct: callsN
        ? Math.round((Number(calls.short ?? 0) / callsN) * 1000) / 10
        : 0,
    },
    pending: pend,
    chart,
    topHosts: topHosts.map((r) => {
      const u = people.get(r.uid);
      return {
        user: u ? userCard(u) : null,
        agency: u?.host?.agencyId
          ? (agencyNames.get(u.host.agencyId) ?? null)
          : null,
        inr: Math.round(Number(r.v) / gemsPerInr(s)),
      };
    }),
    topSpenders: topSpenders.map((r) => ({
      user: people.get(r.uid) ? userCard(people.get(r.uid)!) : null,
      inr: Number(r.v ?? 0),
    })),
  };
}

// Sidebar ki laal ginti
export async function pending() {
  const [apps, wd, sup, rep, live, agencies] = await Promise.all([
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM host_profiles WHERE status='pending'`,
    ),
    one<{ n: number; paise: number | null }>(
      `SELECT COUNT(*) n, SUM(net_paise) paise FROM withdrawals WHERE status='pending'`,
    ),
    one<{ n: number; late: number | null }>(
      `SELECT COUNT(*) n, SUM(last_message_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR) late FROM support_tickets WHERE status='open'`,
    ),
    one<{ n: number; urgent: number | null }>(
      `SELECT COUNT(*) n, SUM(priority='urgent') urgent FROM reports WHERE status='open'`,
    ),
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM calls WHERE status IN ('ringing','accepted')`,
    ),
    one<{ n: number }>(`SELECT COUNT(*) n FROM agencies`),
  ]);
  return {
    applications: Number(apps.n),
    withdrawals: Number(wd.n),
    withdrawalsInr: Math.round(Number(wd.paise ?? 0) / 100),
    support: Number(sup.n),
    supportLate: Number(sup.late ?? 0),
    reports: Number(rep.n),
    reportsUrgent: Number(rep.urgent ?? 0),
    live: Number(live.n),
    agencies: Number(agencies.n),
  };
}

/* ---------------- host applications ---------------- */

export async function listApplications(
  status: "pending" | "approved" | "rejected",
) {
  const rows = await HostProfile.findAll({
    where: { status },
    order: [["updatedAt", status === "pending" ? "ASC" : "DESC"]],
    limit: 200,
  });
  const [users, agencies] = await Promise.all([
    User.findAll({ where: { id: rows.map((r) => r.userId) } }),
    Agency.findAll(),
  ]);
  const um = new Map(users.map((u) => [u.id, u]));
  const am = new Map(agencies.map((a) => [a.id, a]));
  return rows
    .filter((r) => um.has(r.userId))
    .map((r) => ({
      user: userCard(um.get(r.userId)!),
      agency: r.agencyId
        ? {
            name: am.get(r.agencyId)?.name ?? "—",
            code: am.get(r.agencyId)?.code ?? "",
          }
        : null,
      status: r.status,
      appliedAt:
        json<{ submittedAt?: string }>(r.application)?.submittedAt ??
        r.createdAt,
      reviewedAt: r.reviewedAt,
      rejectReason: r.rejectReason,
    }));
}

export async function applicationDetail(publicId: number) {
  const user = await findUser(publicId);
  const hp = await HostProfile.findByPk(user.id);
  if (!hp) throw notFound("No application");
  const app =
    json<{
      photos?: string[];
      selfies?: string[];
      video?: string;
      submittedAt?: string;
    }>(hp.application) ?? {};
  const agency = hp.agencyId ? await Agency.findByPk(hp.agencyId) : null;
  const tokens = (
    await DeviceToken.findAll({ where: { userId: user.id } })
  ).map((t) => t.token);
  const sameDevice = tokens.length
    ? await DeviceToken.count({
        where: { token: tokens, userId: { [Op.ne]: user.id } },
      })
    : 0;
  return {
    user: {
      ...userCard(user),
      phone: maskPhone(user.phone),
      birthday: user.birthday,
      languages: user.languageList,
      city: user.city,
    },
    agency: agency ? { name: agency.name, code: agency.code } : null,
    status: hp.status,
    rejectReason: hp.rejectReason,
    submittedAt: app.submittedAt ?? hp.createdAt,
    photos: (app.photos ?? []).map(signedPrivateUrl),
    selfies: (app.selfies ?? []).map(signedPrivateUrl),
    video: app.video ? signedPrivateUrl(app.video) : null,
    checks: { sameDevice, adult: (user.age ?? 0) >= 18 },
  };
}

/* ---------------- users ---------------- */

export async function listUsers(p: {
  q?: string;
  filter?: "all" | "vip" | "new" | "reported" | "banned";
  page: number;
}) {
  const where: WhereOptions = { role: "user" };
  const and: WhereOptions[] = [];
  if (p.q) {
    const t = p.q.trim();
    and.push({
      [Op.or]: [
        { name: { [Op.like]: `%${t}%` } },
        ...(/^\d{6,12}$/.test(t) ? [{ publicId: Number(t) }] : []),
        { phone: { [Op.like]: `%${t.replace(/[\s()-]/g, "")}%` } },
        { email: { [Op.like]: `%${t}%` } },
      ],
    });
  }
  if (p.filter === "vip") and.push({ vipUntil: { [Op.gt]: new Date() } });
  if (p.filter === "new") and.push({ createdAt: { [Op.gt]: daysAgo(7) } });
  if (p.filter === "banned") and.push({ status: "banned" });
  if (p.filter === "reported")
    and.push({
      id: { [Op.in]: sequelize.literal(`(SELECT reported_id FROM reports)`) },
    });
  const rows = await User.findAll({
    where: and.length ? { [Op.and]: [where, ...and] } : where,
    order: [["id", "DESC"]],
    limit: 51,
    offset: (p.page - 1) * 50,
  });
  const ids = rows.map((r) => r.id);
  const [wallets, rech, reps] = await Promise.all([
    Wallet.findAll({ where: { userId: ids } }),
    ids.length
      ? q<{ uid: number; v: number }>(
          `SELECT user_id uid, ${RECHARGE_INR} v FROM wallet_transactions WHERE kind='recharge' AND user_id IN (:ids) GROUP BY user_id`,
          { ids },
        )
      : [],
    ids.length
      ? q<{ uid: number; n: number }>(
          `SELECT reported_id uid, COUNT(*) n FROM reports WHERE reported_id IN (:ids) GROUP BY reported_id`,
          { ids },
        )
      : [],
  ]);
  const wm = new Map(wallets.map((w) => [w.userId, w.balance]));
  const rm = new Map(rech.map((r) => [r.uid, Number(r.v ?? 0)]));
  const pm = new Map(reps.map((r) => [r.uid, Number(r.n)]));
  return {
    items: rows
      .slice(0, 50)
      .map((u) => ({
        ...userCard(u),
        phone: maskPhone(u.phone),
        gems: wm.get(u.id) ?? 0,
        vipUntil: u.isVip ? u.vipUntil : null,
        rechargedInr: rm.get(u.id) ?? 0,
        level: u.level,
        reports: pm.get(u.id) ?? 0,
      })),
    hasMore: rows.length > 50,
  };
}

const strikesOf = (userId: number) =>
  AuditLog.count({
    where: {
      action: "report.warn",
      targetType: "user",
      targetId: String(userId),
    },
  });

export async function userDetail(publicId: number) {
  const u = await findUser(publicId);
  const [wallet, rech, calls, gifts, reportsAgainst, blocked, txs, strikes] =
    await Promise.all([
      Wallet.findByPk(u.id),
      one<{ inr: number | null }>(
        `SELECT ${RECHARGE_INR} inr FROM wallet_transactions WHERE kind='recharge' AND user_id=:id`,
        { id: u.id },
      ),
      one<{ n: number; sec: number | null }>(
        `SELECT COUNT(*) n, SUM(duration_sec) sec FROM calls WHERE answered_at IS NOT NULL AND (caller_id=:id OR callee_id=:id)`,
        { id: u.id },
      ),
      one<{ n: number }>(
        `SELECT COUNT(*) n FROM gift_transactions WHERE sender_id=:id`,
        { id: u.id },
      ),
      Report.count({ where: { reportedId: u.id } }),
      one<{ n: number }>(`SELECT COUNT(*) n FROM blocks WHERE blocker_id=:id`, {
        id: u.id,
      }),
      WalletTx.findAll({
        where: { userId: u.id },
        order: [["id", "DESC"]],
        limit: 25,
      }),
      strikesOf(u.id),
    ]);
  return {
    user: {
      ...userCard(u),
      phone: maskPhone(u.phone),
      email: u.email,
      authProvider: u.authProvider,
      joinedAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      city: u.city,
      level: u.level,
      vipUntil: u.isVip ? u.vipUntil : null,
    },
    gems: wallet?.balance ?? 0,
    rechargedInr: Number(rech.inr ?? 0),
    calls: {
      count: Number(calls.n),
      minutes: Math.round(Number(calls.sec ?? 0) / 60),
    },
    giftsSent: Number(gifts.n),
    reports: reportsAgainst,
    blockedCount: Number(blocked.n ?? 0),
    strikes,
    history: txs.map((t) => ({
      id: t.id,
      kind: t.kind,
      amount: t.amount,
      title: t.title,
      subtitle: t.subtitle,
      at: t.createdAt,
    })),
  };
}

export async function adjustGems(
  publicId: number,
  amount: number,
  reason: string,
  adminName: string,
) {
  const u = await findUser(publicId);
  if (!amount) throw badRequest("Amount cannot be 0");
  const before = (await Wallet.findByPk(u.id))?.balance ?? 0;
  if (amount < 0 && before + amount < 0)
    throw badRequest(`User has only ${before} gems`);
  await applyTx(u.id, amount, {
    kind: "admin",
    title: amount > 0 ? "Added by Meto team" : "Removed by Meto team",
    subtitle: reason,
    meta: { by: adminName },
  });
  return { user: u, before, after: before + amount };
}

export async function setUserStatus(
  publicId: number,
  status: "active" | "banned",
  reason?: string,
) {
  const u = await findUser(publicId);
  const before = u.status;
  await u.update({ status });
  if (status === "banned" && u.isHost)
    await HostProfile.update({ available: false }, { where: { userId: u.id } });
  if (status === "active" && before === "banned")
    notify(u.id, "notice", {
      data: {
        title: "Your account is active again",
        body: reason ?? "Please follow the Meto rules.",
      },
    }).catch(() => {});
  return { user: u, before };
}

export async function giveVip(publicId: number, days: number) {
  const u = await findUser(publicId);
  const from = u.isVip && u.vipUntil ? u.vipUntil : new Date();
  const until = new Date(from.getTime() + days * 86_400_000);
  const before = u.vipUntil;
  await u.update({ vipUntil: until });
  notify(u.id, "vip", { data: { until, months: 0, bonus: 0 } }).catch(() => {});
  return { user: u, before, after: until };
}

/* ---------------- agencies ---------------- */

export async function listAgencies() {
  const agencies = await Agency.findAll({ order: [['id', 'ASC']] });
  // har agency: hosts, 30 din ke gems, aur agency banne ke baad se hosts ke saare gems (commission ke liye)
  const stats = await q<{ aid: number; hosts: number; pts30: number; ptsAll: number }>(
    `SELECT hp.agency_id aid, COUNT(DISTINCT hp.user_id) hosts,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= :d THEN ht.points ELSE 0 END), 0) pts30,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= a.created_at THEN ht.points ELSE 0 END), 0) ptsAll
       FROM host_profiles hp
       JOIN agencies a ON a.id = hp.agency_id
       LEFT JOIN host_transactions ht ON ht.user_id = hp.user_id
      GROUP BY hp.agency_id`,
    { d: daysAgo(30) },
  );
  const gemTx = await q<{ aid: number; added: number; sent: number; users: number }>(
    `SELECT agency_id aid,
            COALESCE(SUM(CASE WHEN kind='admin_add' THEN gems ELSE 0 END), 0) added,
            COALESCE(SUM(CASE WHEN kind='send' THEN -gems ELSE 0 END), 0) sent,
            COUNT(DISTINCT CASE WHEN kind='send' THEN user_id END) users
       FROM agency_gem_txs GROUP BY agency_id`,
  );
  const m = new Map(stats.map((r) => [Number(r.aid), r]));
  const gm = new Map(gemTx.map((r) => [Number(r.aid), r]));
  const items = agencies.map((a) => {
    const st = m.get(a.id);
    const g = gm.get(a.id);
    const hostGems = Number(st?.ptsAll ?? 0);
    const c = agencyCommission(a, hostGems);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      email: a.email,
      commissionPct: Number(a.commissionPct),
      gemsPerBean: a.gemsPerBean,
      status: a.status,
      hosts: Number(st?.hosts ?? 0),
      hostGems30: Number(st?.pts30 ?? 0),
      hostGems,
      commissionGems: c.gems,
      commissionBeans: c.beans,
      gemBalance: Number(a.gemBalance),
      gemsAdded: Number(g?.added ?? 0),
      gemsSent: Number(g?.sent ?? 0),
      usersSent: Number(g?.users ?? 0),
      lastLoginAt: a.lastLoginAt,
    };
  });
  return {
    items,
    totals: {
      agencies: agencies.length,
      active: agencies.filter((a) => a.status === 'active').length,
      hosts: items.reduce((n, x) => n + x.hosts, 0),
      gemsAdded: items.reduce((n, x) => n + x.gemsAdded, 0),
      gemsSent: items.reduce((n, x) => n + x.gemsSent, 0),
      commissionBeans: items.reduce((n, x) => n + x.commissionBeans, 0),
    },
  };
}

// Admin → agency ke stock me gems (paisa app ke bahar liya). Ledger + balance ek transaction me.
export async function agencyAddGems(agencyId: number, gems: number, adminId: number) {
  if (!Number.isInteger(gems) || gems < 1 || gems > 100_000_000) throw badRequest('Enter gems between 1 and 10,00,00,000');
  return sequelize.transaction(async (t) => {
    const a = await Agency.findByPk(agencyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!a) throw notFound('Agency not found');
    const before = Number(a.gemBalance);
    a.gemBalance = before + gems;
    await a.save({ transaction: t });
    await AgencyGemTx.create({ agencyId: a.id, kind: 'admin_add', gems, balanceAfter: a.gemBalance, userId: null, adminId }, { transaction: t });
    return { agency: a, before, after: a.gemBalance };
  });
}

// Agency ke gems ka hisaab: admin ne kab diye, kis user ko bheje
export async function agencyGemHistory(agencyId: number) {
  const rows = await AgencyGemTx.findAll({ where: { agencyId }, order: [['id', 'DESC']], limit: 300 });
  const uids = [...new Set(rows.map((r) => r.userId).filter((x): x is number => x != null))];
  const aids = [...new Set(rows.map((r) => r.adminId).filter((x): x is number => x != null))];
  const [users, admins] = await Promise.all([
    uids.length ? User.findAll({ where: { id: uids } }) : [],
    aids.length ? Admin.findAll({ where: { id: aids } }) : [],
  ]);
  const um = new Map(users.map((u) => [u.id, u]));
  const am = new Map(admins.map((x) => [x.id, x.name]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      gems: Number(r.gems),
      balanceAfter: Number(r.balanceAfter),
      user: r.userId && um.get(r.userId) ? userCard(um.get(r.userId)!) : null,
      by: r.adminId ? (am.get(r.adminId) ?? null) : null,
      at: r.createdAt,
    })),
  };
}

// Ek agency ka poora hisaab: kaun link se aaya, kaun host bana, har host ke gems + commission beans
export async function agencyDetail(id: number) {
  const a = await Agency.findByPk(id);
  if (!a) throw notFound('Agency not found');
  const pct = Number(a.commissionPct);
  const row = (await listAgencies()).items.find((x) => x.id === a.id)!;
  const hostRows = await q<{ uid: number; status: string; joined: Date; pts: number; calls: number }>(
    `SELECT hp.user_id uid, hp.status, hp.created_at joined,
            COALESCE(SUM(CASE WHEN ht.points > 0 AND ht.kind IN ('call','gift','message','unlock') AND ht.created_at >= :since THEN ht.points ELSE 0 END), 0) pts,
            COALESCE(SUM(CASE WHEN ht.kind = 'call' AND ht.points > 0 AND ht.created_at >= :since THEN 1 ELSE 0 END), 0) calls
       FROM host_profiles hp
       LEFT JOIN host_transactions ht ON ht.user_id = hp.user_id
      WHERE hp.agency_id = :aid
      GROUP BY hp.user_id, hp.status, hp.created_at`,
    { aid: a.id, since: a.createdAt },
  );
  // Link se aaye log + is agency ke saare host applicants (reject & block me link record mit jaata hai, par yahan dikhna chahiye)
  const signed = await User.findAll({
    where: { [Op.or]: [{ inviteAgencyId: a.id }, ...(hostRows.length ? [{ id: hostRows.map((h) => Number(h.uid)) }] : [])] },
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
  const formOf = new Map(hostRows.map((h) => [Number(h.uid), h.status]));
  const ids = [...new Set([...hostRows.map((h) => Number(h.uid)), ...signed.map((u) => u.id)])];
  const users = new Map((ids.length ? await User.findAll({ where: { id: ids } }) : []).map((u) => [u.id, u]));
  const hosts = hostRows
    .map((h) => {
      const u = users.get(Number(h.uid));
      const live = h.status === 'approved' || h.status === 'suspended';
      const gems = Number(h.pts);
      return {
        user: u ? userCard(u) : null,
        status: h.status,
        joinedAt: h.joined,
        calls: live ? Number(h.calls) : null,
        gems: live ? gems : null,
        commissionBeans: live ? agencyCommission(a, gems).beans : null,
      };
    })
    .sort((x, y) => (y.gems ?? -1) - (x.gems ?? -1));
  const count = (st: string[]) => hostRows.filter((h) => st.includes(h.status)).length;
  return {
    agency: { id: a.id, code: a.code, name: a.name, email: a.email, commissionPct: pct, gemsPerBean: a.gemsPerBean, status: a.status, createdAt: a.createdAt },
    counts: {
      signedUp: signed.length,
      approved: count(['approved', 'suspended']),
      pending: count(['pending']),
      rejected: count(['rejected']),
    },
    hostGems: row.hostGems,
    commissionGems: row.commissionGems,
    commissionBeans: row.commissionBeans,
    gemBalance: row.gemBalance,
    gemsAdded: row.gemsAdded,
    gemsSent: row.gemsSent,
    usersSent: row.usersSent,
    hosts,
    signedUp: signed.map((u) => {
      const st = formOf.get(u.id);
      return {
        user: userCard(users.get(u.id) ?? u),
        signedUpAt: u.createdAt,
        // host form ka haal: approved / pending / rejected / not_applied / not_allowed (mard)
        form: st ? (st === 'suspended' ? 'approved' : st) : u.gender === 'male' ? 'not_allowed' : 'not_applied',
      };
    }),
  };
}

/* ---------------- live calls ---------------- */

const callHostId = (c: Call) => Number(c.hostId ?? c.calleeId);
const callPayerId = (c: Call) =>
  callHostId(c) === Number(c.callerId)
    ? Number(c.calleeId)
    : Number(c.callerId);

export async function liveCalls(
  opts: { status?: "all" | "ringing" | "connected"; q?: string } = {},
) {
  const want =
    opts.status === "ringing"
      ? ["ringing"]
      : opts.status === "connected"
        ? ["accepted"]
        : ["ringing", "accepted"];
  const rows = await Call.findAll({
    where: { status: want },
    order: [["id", "DESC"]],
    limit: 200,
  });
  const ids = [...new Set(rows.flatMap((c) => [c.callerId, c.calleeId]))];
  const users = new Map(
    (await User.findAll({ where: { id: ids } })).map((u) => [u.id, u]),
  );

  const since15 = new Date(Date.now() - 15 * 60_000);
  const [ringing, connected, endedRecent] = await Promise.all([
    Call.count({ where: { status: "ringing" } }),
    Call.count({ where: { status: "accepted" } }),
    Call.count({
      where: {
        status: ["ended", "declined", "missed", "cancelled", "busy"],
        endedAt: { [Op.gte]: since15 },
      },
    }),
  ]);

  const needle = opts.q?.trim();
  const items = rows
    .map((c) => {
      const host = users.get(callHostId(c));
      const payer = users.get(callPayerId(c));
      return {
        id: c.id,
        status: c.status === "accepted" ? "connected" : "ringing",
        host: host ? userCard(host) : null,
        user: payer ? userCard(payer) : null,
        rate: c.rate,
        startedAt: c.answeredAt ?? c.createdAt,
        answeredAt: c.answeredAt,
      };
    })
    .filter((it) => {
      if (!needle) return true;
      const hit = (u: ReturnType<typeof userCard> | null) =>
        !!u &&
        (String(u.publicId).includes(needle) ||
          (u.name ?? "").toLowerCase().includes(needle.toLowerCase()));
      return hit(it.host) || hit(it.user);
    });

  return {
    counts: { active: ringing + connected, ringing, connected, endedRecent },
    items,
  };
}

/* ---------------- live call stream (Agora) — admin monitor ---------------- */

const AGORA_TOKEN_TTL_SEC = 2 * 60 * 60;

export async function getCallStream(callId: number, adminId: number) {
  const call = await Call.findByPk(callId);
  if (!call) throw notFound("Call not found");
  if (call.status !== "ringing" && call.status !== "accepted") {
    throw badRequest("Call is not live anymore");
  }

  const appId = env.AGORA_APP_ID;
  const appCert = env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCert)
    throw badRequest("Agora is not configured on the server");

  const adminUid = 900_000 + adminId;
  const expire = AGORA_TOKEN_TTL_SEC;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCert,
    call.channel,
    adminUid,
    RtcRole.SUBSCRIBER,
    expire,
    expire,
  );

  return {
    provider: "agora" as const,
    appId,
    channel: call.channel,
    uid: adminUid,
    token,
    expiresAt: Date.now() + expire * 1000,
  };
}

/* ---------------- hosts ---------------- */

export async function listHosts(p: {
  q?: string;
  status?: "all" | "approved" | "suspended";
  online?: boolean;
  agencyId?: number;
  sort?: "today" | "total" | "short";
}) {
  const s = await getSettings();
  const hpWhere: WhereOptions = {
    status:
      p.status === "suspended"
        ? "suspended"
        : p.status === "approved"
          ? "approved"
          : ["approved", "suspended"],
  };
  if (p.agencyId) Object.assign(hpWhere, { agencyId: p.agencyId });
  const uWhere: WhereOptions[] = [];
  if (p.q)
    uWhere.push({
      [Op.or]: [
        { name: { [Op.like]: `%${p.q}%` } },
        ...(/^\d{6,12}$/.test(p.q) ? [{ publicId: Number(p.q) }] : []),
      ],
    });
  if (p.online)
    uWhere.push({
      lastSeenAt: { [Op.gt]: new Date(Date.now() - ONLINE_WINDOW_MS) },
    });
  const users = await User.findAll({
    where: uWhere.length ? { [Op.and]: uWhere } : {},
    include: [
      { model: HostProfile, as: "host", required: true, where: hpWhere },
    ],
    limit: 300,
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { items: [] };
  const [today, wallets, callStats, agencies] = await Promise.all([
    q<{ uid: number; v: number }>(
      `SELECT user_id uid, SUM(points) v FROM host_transactions WHERE points > 0 AND kind IN ('call','gift','message','unlock') AND created_at >= :d AND user_id IN (:ids) GROUP BY user_id`,
      { d: startOfDay(), ids },
    ),
    HostWallet.findAll({ where: { userId: ids } }),
    q<{ uid: number; total: number; answered: number; short: number }>(
      `SELECT COALESCE(host_id, callee_id) uid, COUNT(*) total, SUM(answered_at IS NOT NULL) answered, SUM(answered_at IS NOT NULL AND duration_sec < 60 AND ended_by = COALESCE(host_id, callee_id)) short
       FROM calls WHERE created_at >= :d AND COALESCE(host_id, callee_id) IN (:ids) AND callee_id = COALESCE(host_id, callee_id) GROUP BY uid`,
      { d: daysAgo(29), ids },
    ),
    Agency.findAll(),
  ]);
  const tm = new Map(today.map((r) => [r.uid, Number(r.v) / gemsPerInr(s)]));
  const wm = new Map(wallets.map((w) => [w.userId, w]));
  const cm = new Map(callStats.map((c) => [c.uid, c]));
  const am = new Map(agencies.map((a) => [a.id, a]));
  const items = users.map((u) => {
    const c = cm.get(u.id);
    const answered = Number(c?.answered ?? 0);
    return {
      ...userCard(u),
      agency: u.host?.agencyId ? (am.get(u.host.agencyId)?.name ?? null) : null,
      agencyCode: u.host?.agencyId ? (am.get(u.host.agencyId)?.code ?? null) : null,
      hostStatus: u.host!.status,
      rate: u.host!.rate,
      rateMin: hostRange(u.host!, s).min,
      rateMax: hostRange(u.host!, s).max,
      rateOwn: hostRange(u.host!, s).own,
      todayInr: Math.round(tm.get(u.id) ?? 0),
      totalInr: Math.round(
        Number(wm.get(u.id)?.totalEarned ?? 0) / gemsPerInr(s),
      ),
      pickupPct:
        c && Number(c.total)
          ? Math.round((answered / Number(c.total)) * 100)
          : null,
      shortPct: answered
        ? Math.round((Number(c?.short ?? 0) / answered) * 100)
        : null,
    };
  });
  const sort = p.sort ?? "today";
  items.sort((a, b) =>
    sort === "total"
      ? b.totalInr - a.totalInr
      : sort === "short"
        ? (b.shortPct ?? -1) - (a.shortPct ?? -1)
        : b.todayInr - a.todayInr,
  );
  return { items };
}

export async function hostDetail(publicId: number) {
  const u = await findUser(publicId);
  const hp = await HostProfile.findByPk(u.id);
  if (!hp) throw notFound("Not a host");
  const s = await getSettings();
  const [wallet, agency, photos, videos, wds, stats, reports, recent] =
    await Promise.all([
      HostWallet.findByPk(u.id),
      hp.agencyId ? Agency.findByPk(hp.agencyId) : null,
      UserPhoto.findAll({
        where: { userId: u.id },
        order: [["position", "ASC"]],
      }),
      UserVideo.findAll({
        where: { userId: u.id },
        order: [["position", "ASC"]],
      }),
      Withdrawal.findAll({
        where: { userId: u.id },
        order: [["id", "DESC"]],
        limit: 10,
      }),
      one<{
        total: number;
        answered: number;
        sec: number | null;
        short: number | null;
      }>(
        `SELECT COUNT(*) total, SUM(answered_at IS NOT NULL) answered, SUM(duration_sec) sec, SUM(answered_at IS NOT NULL AND duration_sec < 60 AND ended_by=:id) short FROM calls WHERE callee_id=:id AND created_at >= :d`,
        { id: u.id, d: daysAgo(29) },
      ),
      Report.count({ where: { reportedId: u.id } }),
      HostTx.findAll({
        where: { userId: u.id },
        order: [["id", "DESC"]],
        limit: 20,
      }),
    ]);
  const answered = Number(stats.answered ?? 0);
  return {
    user: { ...userCard(u), phone: maskPhone(u.phone), joinedAt: u.createdAt },
    host: {
      status: hp.status,
      rate: hp.rate,
      rateMin: hostRange(hp, s).min,
      rateMax: hostRange(hp, s).max,
      rateOwn: hostRange(hp, s).own, // true = admin ne is host ki range set ki
      limitMin: s.hostRateMin, // Settings ki limit (range isse bahar nahi)
      limitMax: s.hostRateOpenMax,
      step: s.hostRateStep,
      since: hp.reviewedAt,
      agency: agency ? { name: agency.name, code: agency.code } : null,
    },
    points: Number(wallet?.points ?? 0),
    pointsInr: Number(wallet?.points ?? 0) / gemsPerInr(s),
    beans: gemsToBeans(Number(wallet?.points ?? 0), s), // host ko withdraw me itne beans dikhte hain
    totalEarnedInr: Number(wallet?.totalEarned ?? 0) / gemsPerInr(s),
    metrics: {
      pickupPct: Number(stats.total)
        ? Math.round((answered / Number(stats.total)) * 100)
        : null,
      avgCallSec: answered ? Math.round(Number(stats.sec ?? 0) / answered) : 0,
      shortPct: answered
        ? Math.round((Number(stats.short ?? 0) / answered) * 100)
        : null,
      reports,
    },
    photos: photos.map((ph) => ({
      id: ph.id,
      url: abs(ph.url),
      isLocked: ph.isLocked,
    })),
    videos: videos.map((v) => ({ id: v.id, url: abs(v.url) })),
    withdrawals: wds.map((w) => ({
      id: w.id,
      netInr: w.netPaise / 100,
      status: w.status,
      at: w.createdAt,
    })),
    history: recent.map((t) => ({
      id: t.id,
      kind: t.kind,
      points: t.points,
      title: t.title,
      at: t.createdAt,
    })),
  };
}

export async function setHostStatus(
  publicId: number,
  status: "approved" | "suspended",
  reason?: string,
) {
  const u = await findUser(publicId);
  const hp = await HostProfile.findByPk(u.id);
  if (!hp) throw notFound("Not a host");
  const before = hp.status;
  await hp.update({ status, available: status === "approved" });
  notify(u.id, "notice", {
    data:
      status === "suspended"
        ? {
            title: "Your host account is suspended",
            body: reason ?? "Contact customer service.",
          }
        : {
            title: "Your host account is active again",
            body: "You can go online and take calls.",
          },
  }).catch(() => {});
  return { user: u, before };
}

// Admin: host ka rate + uski range. range = null → Settings wali default range.
export async function setHostRate(
  publicId: number,
  rate: number,
  range: { min: number; max: number } | null,
) {
  const u = await findUser(publicId);
  const hp = await HostProfile.findByPk(u.id);
  if (!hp) throw notFound("Not a host");
  const s = await getSettings();
  const step = s.hostRateStep;
  const lo = range?.min ?? s.hostRateMin;
  const hi = range?.max ?? s.hostRateOpenMax;
  if (range) {
    if (range.min < s.hostRateMin || range.max > s.hostRateOpenMax)
      throw badRequest(`Range must stay inside ${s.hostRateMin}–${s.hostRateOpenMax}`);
    if (range.max < range.min)
      throw badRequest("Maximum must be more than Minimum");
    if (range.min % step || range.max % step)
      throw badRequest(`Minimum and Maximum must be in steps of ${step}`);
  }
  if (rate < lo || rate > hi) throw badRequest(`Rate must be ${lo}–${hi}`);
  if (rate % step) throw badRequest(`Rate must be in steps of ${step}`);
  const before = { rate: hp.rate, rateMin: hp.rateMin ?? null, rateMax: hp.rateMax ?? null };
  await hp.update({ rate, rateMin: range?.min ?? null, rateMax: range?.max ?? null });
  if (before.rate !== rate)
    notify(u.id, "notice", {
      data: {
        title: "Your call rate was changed",
        body: `Meto team set your call rate to ${rate} gems/min.`,
      },
    }).catch(() => {});
  return { user: u, before };
}

export async function adjustPoints(
  publicId: number,
  points: number,
  reason: string,
) {
  const u = await findUser(publicId);
  if (!points) throw badRequest("Gems cannot be 0");
  const w = await HostWallet.findByPk(u.id);
  const before = Number(w?.points ?? 0);
  if (points < 0 && before + points < 0)
    throw badRequest(`Host has only ${before} gems`);
  await applyHostTx(u.id, points, {
    kind: "admin",
    title: points > 0 ? "Added by Meto team" : "Removed by Meto team",
    subtitle: reason,
  });
  return { user: u, before, after: before + points };
}

export async function removeMedia(
  publicId: number,
  kind: "photo" | "video",
  id: number,
) {
  const u = await findUser(publicId);
  const row =
    kind === "photo"
      ? await UserPhoto.findOne({ where: { id, userId: u.id } })
      : await UserVideo.findOne({ where: { id, userId: u.id } });
  if (!row) throw notFound("Not found");
  const url = row.url;
  await row.destroy();
  notify(u.id, "notice", {
    data: {
      title: `A ${kind} was removed`,
      body: "It broke the Meto rules. Please upload only your own, decent photos and videos.",
    },
  }).catch(() => {});
  return { user: u, url };
}

/* ---------------- reports ---------------- */

export async function listReports(status: "open" | "reviewed" | "dismissed") {
  const rows = await Report.findAll({
    where: { status },
    order:
      status === "open"
        ? [
            ["priority", "ASC"],
            ["createdAt", "ASC"],
          ]
        : [["updatedAt", "DESC"]],
    limit: 200,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.reportedId, r.reporterId]))];
  const users = new Map(
    (await User.findAll({ where: { id: ids } })).map((u) => [u.id, u]),
  );
  const counts = ids.length
    ? await q<{ uid: number; n: number }>(
        `SELECT reported_id uid, COUNT(*) n FROM reports WHERE reported_id IN (:ids) GROUP BY reported_id`,
        { ids },
      )
    : [];
  const cm = new Map(counts.map((c) => [c.uid, Number(c.n)]));
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    priority: r.priority,
    details: r.details,
    at: r.createdAt,
    reported: users.get(r.reportedId)
      ? userCard(users.get(r.reportedId)!)
      : null,
    reporter: users.get(r.reporterId)
      ? userCard(users.get(r.reporterId)!)
      : null,
    count: cm.get(r.reportedId) ?? 1,
  }));
}

export async function reportDetail(id: number) {
  const r = await Report.findByPk(id);
  if (!r) throw notFound("Report not found");
  const [reported, reporter, others, strikes] = await Promise.all([
    User.findByPk(r.reportedId),
    User.findByPk(r.reporterId),
    Report.findAll({
      where: { reportedId: r.reportedId, id: { [Op.ne]: r.id } },
      order: [["id", "DESC"]],
      limit: 10,
    }),
    strikesOf(r.reportedId),
  ]);
  const chat = r.conversationId
    ? await Message.findAll({
        where: {
          conversationId: r.conversationId,
          createdAt: { [Op.lte]: new Date(r.createdAt.getTime() + 60_000) },
        },
        order: [["id", "DESC"]],
        limit: 20,
      })
    : [];
  const photos = reported
    ? await UserPhoto.findAll({
        where: { userId: reported.id },
        order: [["position", "ASC"]],
      })
    : [];
  return {
    report: {
      id: r.id,
      reason: r.reason,
      priority: r.priority,
      details: r.details,
      status: r.status,
      at: r.createdAt,
    },
    reported: reported
      ? {
          ...userCard(reported),
          photos: photos.map((p) => ({ id: p.id, url: abs(p.url) })),
        }
      : null,
    reporter: reporter ? userCard(reporter) : null,
    strikes,
    others: others.map((o) => ({
      id: o.id,
      reason: o.reason,
      status: o.status,
      at: o.createdAt,
    })),
    chat: chat
      .reverse()
      .map((m) => ({
        id: m.id,
        fromReported: m.senderId === r.reportedId,
        type: m.type,
        body: m.type === "text" ? m.body : `[${m.type}]`,
        at: m.createdAt,
      })),
  };
}

export async function actOnReport(
  id: number,
  action: "dismiss" | "warn" | "suspend" | "ban",
  note?: string,
) {
  const r = await Report.findByPk(id);
  if (!r) throw notFound("Report not found");
  const reported = await User.findByPk(r.reportedId);
  if (!reported) throw notFound("User not found");
  await Report.update(
    { status: action === "dismiss" ? "dismissed" : "reviewed" },
    { where: { reportedId: r.reportedId, status: "open" } },
  );
  if (action === "warn")
    await notify(reported.id, "notice", {
      data: {
        title: "Warning from Meto",
        body:
          note ??
          "We received reports about your behaviour. Repeated reports can get your account banned.",
      },
    });
  if (action === "suspend" && reported.isHost)
    await HostProfile.update(
      { status: "suspended", available: false },
      { where: { userId: reported.id } },
    );
  if (action === "ban" || (action === "suspend" && !reported.isHost))
    await reported.update({ status: "banned" });
  if (action !== "dismiss")
    notify(r.reporterId, "notice", {
      data: {
        title: "Thanks for your report",
        body: "We reviewed it and took action.",
      },
    }).catch(() => {});
  return {
    reported,
    strikes:
      action === "warn"
        ? (await strikesOf(reported.id)) + 1
        : await strikesOf(reported.id),
  };
}

/* ---------------- withdrawals ---------------- */

export async function listWithdrawalsAdmin(
  status: "pending" | "paid" | "rejected",
  search?: string,
) {
  const rows = await Withdrawal.findAll({
    where: { status },
    order: [["id", status === "pending" ? "ASC" : "DESC"]],
    limit: 300,
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [users, accounts, agencies, hps] = await Promise.all([
    User.findAll({ where: { id: userIds } }),
    PayoutAccount.findAll({ where: { userId: userIds } }),
    Agency.findAll(),
    HostProfile.findAll({ where: { userId: userIds } }),
  ]);
  const um = new Map(users.map((u) => [u.id, u]));
  const pm = new Map(accounts.map((a) => [a.userId, a]));
  const hm = new Map(hps.map((h) => [h.userId, h.agencyId]));
  const am = new Map(agencies.map((a) => [a.id, a.name]));
  const upis = [...new Set(rows.map((r) => r.upiId))];
  const shared = upis.length
    ? await q<{ upi: string; n: number }>(
        `SELECT upi_id upi, COUNT(DISTINCT user_id) n FROM withdrawals WHERE upi_id IN (:upis) GROUP BY upi_id`,
        { upis },
      )
    : [];
  const paidBefore = upis.length
    ? await q<{ upi: string; uid: number }>(
        `SELECT DISTINCT upi_id upi, user_id uid FROM withdrawals WHERE status='paid' AND upi_id IN (:upis)`,
        { upis },
      )
    : [];
  const sm = new Map(shared.map((x) => [x.upi, Number(x.n)]));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  let items = rows.map((w) => {
    const u = um.get(w.userId);
    const acc = pm.get(w.userId);
    const checks: string[] = [];
    if (
      acc &&
      norm(w.upiName) !== norm(acc.panName) &&
      !norm(acc.panName).includes(norm(w.upiName)) &&
      !norm(w.upiName).includes(norm(acc.panName))
    )
      checks.push("name_mismatch");
    if ((sm.get(w.upiId) ?? 1) > 1) checks.push("upi_shared");
    if (!paidBefore.some((x) => x.upi === w.upiId && x.uid === w.userId))
      checks.push("new_upi");
    return {
      id: w.id,
      beans: Number(w.beans),
      user: u ? userCard(u) : null,
      agency: hm.get(w.userId) ? (am.get(hm.get(w.userId)!) ?? null) : null,
      requestedInr: w.amountPaise / 100,
      tdsInr: w.tdsPaise / 100,
      netInr: w.netPaise / 100,
      upiId: w.upiId,
      upiName: w.upiName,
      pan: acc ? maskPan(acc.pan) : null,
      panName: acc?.panName ?? null,
      status: w.status,
      utr: w.utr,
      reason: w.reason,
      at: w.createdAt,
      paidAt: w.paidAt,
      checks,
    };
  });
  if (search) {
    const t = search.toLowerCase();
    items = items.filter(
      (i) =>
        i.user?.name?.toLowerCase().includes(t) ||
        String(i.user?.publicId).includes(t) ||
        i.upiId.toLowerCase().includes(t),
    );
  }
  return { items, totalInr: items.reduce((a, i) => a + i.netInr, 0) };
}

/* ---------------- support ---------------- */

export async function listTickets(status: "open" | "solved" | "all") {
  const rows = await SupportTicket.findAll({
    where: status === "all" ? {} : { status },
    order: [["lastMessageAt", status === "open" ? "ASC" : "DESC"]],
    limit: 200,
  });
  const users = new Map(
    (await User.findAll({ where: { id: rows.map((r) => r.userId) } })).map(
      (u) => [u.id, u],
    ),
  );
  const last = rows.length
    ? await SupportMessage.findAll({
        where: {
          id: {
            [Op.in]: sequelize.literal(
              `(SELECT MAX(id) FROM support_messages WHERE ticket_id IN (${rows.map((r) => Number(r.id)).join(",")}) GROUP BY ticket_id)`,
            ),
          },
        },
      })
    : [];
  const lm = new Map(last.map((m) => [m.ticketId, m]));
  return rows.map((t) => ({
    id: t.id,
    topic: t.topic,
    status: t.status,
    lastMessageAt: t.lastMessageAt,
    waitingForTeam: !lm.get(t.id)?.fromTeam,
    late:
      t.status === "open" &&
      !lm.get(t.id)?.fromTeam &&
      Date.now() - t.lastMessageAt.getTime() > 24 * 3600_000,
    user: users.get(t.userId) ? userCard(users.get(t.userId)!) : null,
    last: lm.get(t.id)
      ? {
          body: lm.get(t.id)!.body ?? "📷 Screenshot",
          fromTeam: lm.get(t.id)!.fromTeam,
        }
      : null,
  }));
}

export async function ticketThread(id: number) {
  const t = await SupportTicket.findByPk(id);
  if (!t) throw notFound("Ticket not found");
  const [user, msgs] = await Promise.all([
    User.findByPk(t.userId),
    SupportMessage.findAll({ where: { ticketId: id }, order: [["id", "ASC"]] }),
  ]);
  return {
    ticket: {
      id: t.id,
      topic: t.topic,
      status: t.status,
      createdAt: t.createdAt,
    },
    user: user
      ? {
          ...userCard(user),
          gems: (await Wallet.findByPk(user.id))?.balance ?? 0,
        }
      : null,
    messages: msgs.map((m) => ({
      id: m.id,
      fromTeam: m.fromTeam,
      body: m.body,
      imageUrl: abs(m.imageUrl),
      at: m.createdAt,
    })),
  };
}

export async function solveTicket(id: number) {
  const t = await SupportTicket.findByPk(id);
  if (!t) throw notFound("Ticket not found");
  await t.update({ status: "solved" });
  return t;
}

/* ---------------- settings ---------------- */

export const MONEY_KEYS: SettingKey[] = [
  "gemsPerBean",
  "beansPerInr",
  "minWithdrawBeans",
  "tdsPct",
  "matchRate",
  "vipCallDiscountPct",
  "messagePrice",
];

export function validateSettings(patch: Partial<Settings>) {
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const [k, v] of Object.entries(patch) as [SettingKey, unknown][]) {
    if (!(k in SETTING_DEFAULTS)) throw badRequest(`Unknown setting ${k}`);
    const def = SETTING_DEFAULTS[k];
    if (Array.isArray(def)) {
      if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x > 0))
        throw badRequest(`${k} must be a list of numbers`);
    } else if (typeof def === "boolean") {
      if (typeof v !== "boolean") throw badRequest(`${k} must be on / off`);
    } else if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      throw badRequest(`${k} must be a positive number`);
    out[k] = v;
  }
  const merged = { ...SETTING_DEFAULTS, ...out } as Settings;
  if ("hostRateMin" in out || "hostRateOpenMax" in out)
    if (merged.hostRateMin >= merged.hostRateOpenMax)
      throw badRequest("Minimum rate must be lower than maximum rate");
  if ("tdsPct" in out && merged.tdsPct > 30)
    throw badRequest("TDS looks too high");
  if ("gemsPerBean" in out && !(Number.isInteger(merged.gemsPerBean) && merged.gemsPerBean >= 1))
    throw badRequest("1 bean must be at least 1 gem");
  if ("beansPerInr" in out && !(merged.beansPerInr > 0))
    throw badRequest("Beans for ₹1 must be more than 0");
  return out as Partial<Settings>;
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  const changed: { key: SettingKey; before: unknown; after: unknown }[] = [];
  for (const [k, v] of Object.entries(patch) as [SettingKey, never][]) {
    if (JSON.stringify(current[k]) === JSON.stringify(v)) continue;
    await setSetting(k, v);
    changed.push({ key: k, before: current[k], after: v });
  }
  return changed;
}

/* ---------------- gifts (store) ---------------- */

export async function listGifts() {
  const gifts = await Gift.findAll({ order: [["price", "ASC"]] });
  const sent = await q<{ gid: number; n: number }>(
    `SELECT gift_id gid, SUM(quantity) n FROM gift_transactions GROUP BY gift_id`,
  );
  const sm = new Map(sent.map((s) => [s.gid, Number(s.n)]));
  return gifts.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    iconUrl: abs(g.iconUrl ?? null),
    svgaUrl: abs(g.svgaUrl ?? null),
    price: g.price,
    isRare: g.isRare,
    isActive: g.isActive,
    sent: sm.get(g.id) ?? 0,
  }));
}

/* ---------------- audit + admins ---------------- */

export async function listAudit(p: {
  adminId?: number;
  action?: string;
  target?: string;
  days: number;
}) {
  const where: WhereOptions = { createdAt: { [Op.gt]: daysAgo(p.days) } };
  if (p.adminId) Object.assign(where, { adminId: p.adminId });
  if (p.action) Object.assign(where, { action: { [Op.like]: `${p.action}%` } });
  if (p.target)
    Object.assign(where, {
      [Op.or]: [
        { targetId: p.target },
        { summary: { [Op.like]: `%${p.target}%` } },
      ],
    });
  const rows = await AuditLog.findAll({
    where,
    order: [["id", "DESC"]],
    limit: 300,
  });
  const admins = new Map((await Admin.findAll()).map((a) => [a.id, a]));
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    admin: admins.get(r.adminId)
      ? { name: admins.get(r.adminId)!.name, role: admins.get(r.adminId)!.role }
      : null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    summary: r.summary,
    before: json(r.before),
    after: json(r.after),
    ip: r.ip,
  }));
}

export const callOf = (id: number) => Call.findByPk(id);

/* ---------------- compliance (IT Rules 2021 · DPDP) ---------------- */

const HOUR = 3600_000;
export async function compliance() {
  const tickets = await SupportTicket.findAll({
    where: { topic: "report" },
    order: [["id", "DESC"]],
    limit: 100,
  });
  const firstReply = tickets.length
    ? await q<{ tid: number; at: Date }>(
        `SELECT ticket_id tid, MIN(created_at) at FROM support_messages WHERE from_team = 1 AND ticket_id IN (:ids) GROUP BY ticket_id`,
        { ids: tickets.map((t) => t.id) },
      )
    : [];
  const fr = new Map(firstReply.map((r) => [r.tid, new Date(r.at)]));
  const users = new Map(
    (await User.findAll({ where: { id: tickets.map((t) => t.userId) } })).map(
      (u) => [u.id, u],
    ),
  );
  const grievances = tickets.map((t) => {
    const replied = fr.get(t.id) ?? null;
    const age = Date.now() - t.createdAt.getTime();
    return {
      id: t.id,
      user: users.get(t.userId) ? userCard(users.get(t.userId)!) : null,
      receivedAt: t.createdAt,
      acknowledgedAt: replied,
      status: t.status,
      ackLate: !replied && age > 24 * HOUR,
      ackDueAt: new Date(t.createdAt.getTime() + 24 * HOUR),
      resolveDueAt: new Date(t.createdAt.getTime() + 15 * 24 * HOUR),
      resolveLate: t.status !== "solved" && age > 15 * 24 * HOUR,
    };
  });
  const urgent = await Report.findAll({
    where: { status: "open", reason: ["inappropriate_content", "underage"] },
    order: [["createdAt", "ASC"]],
  });
  const reported = new Map(
    (
      await User.findAll({ where: { id: urgent.map((r) => r.reportedId) } })
    ).map((u) => [u.id, u]),
  );
  const deleted = await DeletedAccount.findAll({
    order: [["id", "DESC"]],
    limit: 100,
  });
  return {
    grievances,
    urgentReports: urgent.map((r) => ({
      id: r.id,
      reason: r.reason,
      at: r.createdAt,
      dueAt: new Date(r.createdAt.getTime() + 24 * HOUR),
      late: Date.now() - r.createdAt.getTime() > 24 * HOUR,
      reported: reported.get(r.reportedId)
        ? userCard(reported.get(r.reportedId)!)
        : null,
    })),
    deletions: deleted.map((d) => ({
      id: d.id,
      publicId: d.publicId,
      role: d.role,
      joinedAt: d.joinedAt,
      deletedAt: d.createdAt,
      reason: d.reason,
    })),
    counts: {
      grievancesOpen: grievances.filter((g) => g.status !== "solved").length,
      ackLate: grievances.filter((g) => g.ackLate).length,
      urgent: urgent.length,
      urgentLate: urgent.filter(
        (r) => Date.now() - r.createdAt.getTime() > 24 * HOUR,
      ).length,
      deletions30d: deleted.filter(
        (d) => Date.now() - d.createdAt.getTime() < 30 * 24 * HOUR,
      ).length,
    },
  };
}

import { useState } from 'react';
import { api } from '../api';
import { date, Empty, inr, num, Pill, useApi, useDebounced, useAuth, useUi, when, Who, type UserCard } from '../ui';

type Row = UserCard & { phone: string | null; gems: number; vipUntil: string | null; rechargedInr: number; level: number; reports: number };
type Detail = {
  user: UserCard & { phone: string | null; email: string | null; authProvider: string; joinedAt: string; lastSeenAt: string | null; city: string | null; level: number; vipUntil: string | null };
  gems: number;
  rechargedInr: number;
  calls: { count: number; minutes: number };
  giftsSent: number;
  reports: number;
  blockedCount: number;
  strikes: number;
  history: { id: number; kind: string; amount: number; title: string; subtitle: string | null; at: string }[];
};

export default function Users({ id }: { id?: string }) {
  const { go, can } = useAuth();
  const { ask, run } = useUi();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [filter, setFilter] = useState('all');
  const list = useApi<{ items: Row[]; hasMore: boolean }>(`/users?filter=${filter}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const detail = useApi<Detail>(id ? `/users/${id}` : null);
  const d = detail.data;

  const after = () => {
    detail.reload();
    list.reload();
  };
  const gems = async () => {
    const r = await ask({
      title: `Add / remove gems · ${d!.user.name}`,
      text: `Now: ${num(d!.gems)} gems. Use a minus sign to remove (e.g. -500).${!can('finance') ? ' Support can add up to 2,000.' : ''}`,
      input: { label: 'Gems', type: 'number', placeholder: '1000 or -500', check: v => (/^-?\d+$/.test(v) && +v !== 0 ? (+v < 0 && -v > d!.gems ? `They have only ${num(d!.gems)} gems` : null) : 'Whole number, not 0') },
      confirm: 'Next',
    });
    if (!r) return;
    const amount = Math.round(Number(r.value));
    const why = await ask({ title: 'Reason', input: { label: 'Why? (saved in audit log)', chips: ['Refund · call issue', 'Refund · payment issue', 'Compensation', 'Correction'], multiline: true }, confirm: `${amount > 0 ? 'Add' : 'Remove'} ${num(Math.abs(amount))} gems`, tone: 'gold' });
    if (why && (await run(() => api(`/users/${id}/gems`, { body: { amount, reason: why.value } }), 'Gems updated'))) after();
  };
  const vip = async () => {
    const r = await ask({ title: `Give VIP · ${d!.user.name}`, input: { label: 'Days', type: 'number', initial: '30', check: v => (/^\d+$/.test(v) && +v >= 1 && +v <= 366 ? null : 'Enter 1–366 days') }, confirm: 'Next' });
    if (!r) return;
    const why = await ask({ title: 'Reason', input: { label: 'Why?', chips: ['Compensation', 'Promotion', 'Payment issue'], multiline: true }, confirm: `Give ${r.value} days VIP`, tone: 'gold' });
    if (why && (await run(() => api(`/users/${id}/vip`, { body: { days: Math.round(Number(r.value)), reason: why.value } }), 'VIP given'))) after();
  };
  const status = async (s: 'active' | 'banned') => {
    const why = await ask({
      title: s === 'banned' ? `Ban ${d!.user.name}?` : `Unban ${d!.user.name}?`,
      text: s === 'banned' ? 'They can no longer use Meto.' : 'Their account works again.',
      input: { label: 'Reason', chips: s === 'banned' ? ['Abuse / harassment', 'Asked for money', 'Fake account', 'Under 18'] : ['Appeal accepted', 'Mistake'], multiline: true },
      confirm: s === 'banned' ? 'Ban' : 'Unban',
      tone: s === 'banned' ? 'red' : 'green',
    });
    if (why && (await run(() => api(`/users/${id}/status`, { body: { status: s, reason: why.value } }), s === 'banned' ? 'Banned' : 'Unbanned'))) after();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Users</h2>
          <div className="sub">Search · adjust gems · VIP · ban / unban</div>
        </div>
        <div className="right">
          <input className="search" placeholder="🔍 Name / Meto ID / phone / email" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="filters">
        <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All users</option>
          <option value="vip">👑 VIP</option>
          <option value="new">New (7 days)</option>
          <option value="reported">Reported</option>
          <option value="banned">Banned</option>
        </select>
      </div>
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>USER</th>
                <th className="r">GEMS</th>
                <th>VIP</th>
                <th className="r">RECHARGED</th>
                <th>LEVEL</th>
                <th>REPORTS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map(u => (
                <tr key={u.publicId} className={`click${String(u.publicId) === id ? ' sel' : ''}`} onClick={() => go('users', String(u.publicId))}>
                  <td>
                    <Who u={u} sub={`ID ${u.publicId}${u.phone ? ` · ${u.phone}` : ''}`} />
                  </td>
                  <td className="r">{num(u.gems)}</td>
                  <td>{u.vipUntil ? <Pill tone="pend">👑 {date(u.vipUntil)}</Pill> : '—'}</td>
                  <td className="r">{inr(u.rechargedInr)}</td>
                  <td>Lv.{u.level}</td>
                  <td className={u.reports > 2 ? 'red' : ''}>{u.reports}</td>
                  <td>{u.status === 'banned' ? <Pill tone="no">Banned</Pill> : <Pill tone="ok">Active</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.items.length && <Empty>No users found</Empty>}
        </div>
        <div className="card sticky">
          {!d ? (
            <Empty>{id ? 'Loading…' : 'Select a user'}</Empty>
          ) : (
            <>
              <h3>
                {d.user.name} · ID {d.user.publicId}
                {d.user.status === 'banned' ? <Pill tone="no">Banned</Pill> : <Pill tone="ok">Active</Pill>}
              </h3>
              <div className="metric">
                <div>
                  <small>Gems</small>
                  <b>{num(d.gems)}</b>
                </div>
                <div>
                  <small>Recharged</small>
                  <b>{inr(d.rechargedInr)}</b>
                </div>
                <div>
                  <small>Calls</small>
                  <b>
                    {d.calls.count} · {d.calls.minutes}m
                  </b>
                </div>
                <div>
                  <small>Reports · strikes</small>
                  <b className={d.reports ? 'red' : ''}>
                    {d.reports} · {d.strikes}
                  </b>
                </div>
              </div>
              <div className="kv">
                <span>Joined</span>
                <b>
                  {date(d.user.joinedAt)} · {d.user.authProvider}
                </b>
                <span>Phone / email</span>
                <b>{d.user.phone ?? d.user.email ?? '—'}</b>
                <span>Last seen</span>
                <b>{d.user.online ? '🟢 online now' : when(d.user.lastSeenAt)}</b>
                <span>VIP</span>
                <b>{d.user.vipUntil ? `till ${date(d.user.vipUntil)}` : 'no'}</b>
                <span>Level · gifts sent</span>
                <b>
                  Lv.{d.user.level} · {d.giftsSent}
                </b>
                <span>Blocked people</span>
                <b>{d.blockedCount}</b>
              </div>
              <div className="acts mt">
                {can('support', 'finance') && (
                  <button className="btn b-ghost" onClick={gems}>
                    ± Gems
                  </button>
                )}
                {can('finance') && (
                  <button className="btn b-ghost" onClick={vip}>
                    Give VIP
                  </button>
                )}
                {can('moderator') &&
                  (d.user.status === 'banned' ? (
                    <button className="btn b-green" onClick={() => status('active')}>
                      Unban
                    </button>
                  ) : (
                    <button className="btn b-red" onClick={() => status('banned')}>
                      Ban
                    </button>
                  ))}
              </div>
              <h4>Recent gems</h4>
              <div className="timeline">
                {d.history.map(h => (
                  <div key={h.id}>
                    <span>{when(h.at)}</span>
                    <span style={{ color: 'var(--text)' }}>
                      {h.title}
                      {h.subtitle && <span className="dimtxt">{h.subtitle}</span>}
                    </span>
                    <b className={h.amount > 0 ? 'green' : ''}>
                      {h.amount > 0 ? '+' : ''}
                      {num(h.amount)}
                    </b>
                  </div>
                ))}
              </div>
              {!d.history.length && <Empty>No gem activity yet</Empty>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

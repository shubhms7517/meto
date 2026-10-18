import { useState } from 'react';
import { api } from '../api';
import { date, Empty, Img, inr, num, Pill, useApi, useDebounced, useAuth, useUi, Vid, when, Who, type UserCard } from '../ui';

type Row = UserCard & { agency: string | null; hostStatus: string; rate: number; todayInr: number; totalInr: number; pickupPct: number | null; shortPct: number | null };
type Detail = {
  user: UserCard & { phone: string | null; joinedAt: string };
  host: { status: string; rate: number; rateMin: number; rateMax: number; since: string | null; agency: { name: string; code: string } | null };
  points: number;
  pointsInr: number;
  totalEarnedInr: number;
  metrics: { pickupPct: number | null; avgCallSec: number; shortPct: number | null; reports: number };
  photos: { id: number; url: string; isLocked: boolean }[];
  videos: { id: number; url: string }[];
  withdrawals: { id: number; netInr: number; status: string; at: string }[];
  history: { id: number; kind: string; points: number; title: string; at: string }[];
};

const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

export default function Hosts({ id }: { id?: string }) {
  const { go, can } = useAuth();
  const { ask, run, zoom } = useUi();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [status, setStatus] = useState('all');
  const [online, setOnline] = useState(false);
  const [sort, setSort] = useState('today');
  const list = useApi<{ items: Row[] }>(`/hosts?status=${status}&sort=${sort}${online ? '&online=1' : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const detail = useApi<Detail>(id ? `/hosts/${id}` : null);
  const d = detail.data;
  const after = () => {
    detail.reload();
    list.reload();
  };

  const rate = async () => {
    const r = await ask({ title: `Change rate · ${d!.user.name}`, text: `Now ${num(d!.host.rate)} gems/min.`, input: { label: 'New rate (gems / min)', type: 'number', initial: String(d!.host.rate), check: v => (/^\d+$/.test(v) && +v >= d!.host.rateMin && +v <= d!.host.rateMax ? null : `Enter ${num(d!.host.rateMin)}–${num(d!.host.rateMax)}`) }, confirm: 'Save rate' });
    if (r && (await run(() => api(`/hosts/${id}/rate`, { body: { rate: Math.round(Number(r.value)) } }), 'Rate changed'))) after();
  };
  const points = async () => {
    const r = await ask({ title: `Add / remove points · ${d!.user.name}`, text: `Now ${num(d!.points)} points (${inr(d!.pointsInr)}). Minus to remove.`, input: { label: 'Points', type: 'number', check: v => (/^-?\d+$/.test(v) && +v !== 0 ? null : 'Whole number, not 0') }, confirm: 'Next' });
    if (!r) return;
    const n = Math.round(Number(r.value));
    const why = await ask({ title: 'Reason', input: { label: 'Why?', chips: ['Missed call earnings', 'Correction', 'Fraud reversal'], multiline: true }, confirm: `${n > 0 ? 'Add' : 'Remove'} ${num(Math.abs(n))} points`, tone: 'gold' });
    if (why && (await run(() => api(`/hosts/${id}/points`, { body: { points: n, reason: why.value } }), 'Points updated'))) after();
  };
  const setStatusHost = async (s: 'approved' | 'suspended') => {
    const why = await ask({
      title: s === 'suspended' ? `Suspend ${d!.user.name}?` : `Re-activate ${d!.user.name}?`,
      text: s === 'suspended' ? 'She disappears from Discover and can’t take calls.' : 'She can go online and take calls again.',
      input: { label: 'Reason (shown to host)', chips: s === 'suspended' ? ['Too many short calls', 'Reports from users', 'Fake photos', 'Rule break'] : ['Appeal accepted', 'Fixed the issue'], multiline: true },
      confirm: s === 'suspended' ? 'Suspend' : 'Re-activate',
      tone: s === 'suspended' ? 'red' : 'green',
    });
    if (why && (await run(() => api(`/hosts/${id}/status`, { body: { status: s, reason: why.value } }), 'Done'))) after();
  };
  const removeMedia = async (kind: 'photo' | 'video', mediaId: number) => {
    const ok = await ask({ title: `Remove this ${kind}?`, text: 'Host gets a notice that it broke the rules.', confirm: 'Remove', tone: 'red' });
    if (ok && (await run(() => api(`/hosts/${id}/media/${kind}/${mediaId}`, { method: 'DELETE' }), 'Removed'))) after();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Hosts</h2>
          <div className="sub">Earnings, pickup rate and short calls (host ended before 1 min) · last 30 days</div>
        </div>
        <div className="right">
          <input className="search" placeholder="🔍 Name / Meto ID" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="filters">
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All hosts</option>
          <option value="approved">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="today">Sort: earnings today</option>
          <option value="total">Sort: total earnings</option>
          <option value="short">Sort: short-call % (worst first)</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} /> Online only
        </label>
      </div>
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>HOST</th>
                <th className="r">RATE</th>
                <th className="r">TODAY</th>
                <th className="r">TOTAL</th>
                <th>PICKUP</th>
                <th>SHORT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map(h => (
                <tr key={h.publicId} className={`click${String(h.publicId) === id ? ' sel' : ''}`} onClick={() => go('hosts', String(h.publicId))}>
                  <td>
                    <Who u={h} sub={h.agency ?? 'No agency'} />
                  </td>
                  <td className="r">{num(h.rate)}</td>
                  <td className="r gold">{inr(h.todayInr)}</td>
                  <td className="r">{inr(h.totalInr)}</td>
                  <td className={h.pickupPct != null && h.pickupPct < 50 ? 'red' : ''}>{pct(h.pickupPct)}</td>
                  <td className={h.shortPct != null && h.shortPct > 20 ? 'red' : ''}>
                    <b>{pct(h.shortPct)}</b>
                  </td>
                  <td>{h.hostStatus === 'suspended' ? <Pill tone="no">Suspended</Pill> : <Pill tone="ok">Active</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.items.length && <Empty>No hosts found</Empty>}
        </div>
        <div className="card sticky">
          {!d ? (
            <Empty>{id ? 'Loading…' : 'Select a host'}</Empty>
          ) : (
            <>
              <h3>
                <Who u={d.user} />
                {d.host.status === 'suspended' ? <Pill tone="no">Suspended</Pill> : <Pill tone="ok">Active</Pill>}
              </h3>
              <div className="metric">
                <div>
                  <small>Pickup</small>
                  <b>{pct(d.metrics.pickupPct)}</b>
                </div>
                <div>
                  <small>Avg call</small>
                  <b>
                    {Math.floor(d.metrics.avgCallSec / 60)}m {d.metrics.avgCallSec % 60}s
                  </b>
                </div>
                <div>
                  <small>Short calls</small>
                  <b className={(d.metrics.shortPct ?? 0) > 20 ? 'red' : 'green'}>{pct(d.metrics.shortPct)}</b>
                </div>
                <div>
                  <small>Reports</small>
                  <b className={d.metrics.reports ? 'red' : ''}>{d.metrics.reports}</b>
                </div>
              </div>
              <div className="kv">
                <span>Agency</span>
                <b>{d.host.agency ? `${d.host.agency.name} · ${d.host.agency.code}` : '—'}</b>
                <span>Rate</span>
                <b>{num(d.host.rate)} gems/min</b>
                <span>Points balance</span>
                <b className="gold">
                  {num(d.points)} pts · {inr(d.pointsInr)}
                </b>
                <span>Total earned</span>
                <b>{inr(d.totalEarnedInr)}</b>
                <span>Host since</span>
                <b>{date(d.host.since)}</b>
                <span>Phone</span>
                <b>{d.user.phone ?? '—'}</b>
              </div>
              <div className="acts mt">
                {can('moderator') && (
                  <button className="btn b-ghost" onClick={rate}>
                    Change rate
                  </button>
                )}
                {can('finance') && (
                  <button className="btn b-ghost" onClick={points}>
                    ± Points
                  </button>
                )}
                {can('moderator') &&
                  (d.host.status === 'suspended' ? (
                    <button className="btn b-green" onClick={() => setStatusHost('approved')}>
                      Re-activate
                    </button>
                  ) : (
                    <button className="btn b-amb" onClick={() => setStatusHost('suspended')}>
                      Suspend…
                    </button>
                  ))}
              </div>
              <h4>Photos &amp; videos</h4>
              <div className="media">
                {d.photos.map(p => (
                  <div className="m" key={`p${p.id}`}>
                    <Img src={p.url} onClick={() => zoom(p.url)} />
                    {can('moderator') && (
                      <button title="Remove" onClick={() => removeMedia('photo', p.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {d.videos.map(v => (
                  <div className="m" key={`v${v.id}`}>
                    <Vid src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {can('moderator') && (
                      <button title="Remove" onClick={() => removeMedia('video', v.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!d.photos.length && !d.videos.length && <Empty>No photos or videos</Empty>}
              <h4>Recent points</h4>
              <div className="timeline">
                {d.history.map(h => (
                  <div key={h.id}>
                    <span>{when(h.at)}</span>
                    <span style={{ color: 'var(--text)' }}>{h.title}</span>
                    <b className={h.points > 0 ? 'green' : ''}>
                      {h.points > 0 ? '+' : ''}
                      {num(h.points)}
                    </b>
                  </div>
                ))}
              </div>
              {!d.history.length && <Empty>No points yet</Empty>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

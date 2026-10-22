import { useState } from 'react';
import { api } from '../api';
import { date, Empty, Img, inr, num, Pill, useApi, useDebounced, useAuth, useUi, Vid, when, Who, type UserCard } from '../ui';

type Row = UserCard & { agency: string | null; agencyCode: string | null; hostStatus: string; rate: number; rateMin: number; rateMax: number; rateOwn: boolean; todayInr: number; totalInr: number; pickupPct: number | null; shortPct: number | null };
type Detail = {
  user: UserCard & { phone: string | null; joinedAt: string };
  host: { status: string; rate: number; rateMin: number; rateMax: number; rateOwn: boolean; limitMin: number; limitMax: number; step: number; since: string | null; agency: { name: string; code: string } | null };
  points: number;
  pointsInr: number;
  beans: number;
  totalEarnedInr: number;
  metrics: { pickupPct: number | null; avgCallSec: number; shortPct: number | null; reports: number };
  photos: { id: number; url: string; isLocked: boolean }[];
  videos: { id: number; url: string }[];
  withdrawals: { id: number; netInr: number; status: string; at: string }[];
  history: { id: number; kind: string; points: number; title: string; at: string }[];
};

const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

// Admin: host ka rate + uski apni min/max range (ya Settings wali default)
function RateDialog({ d, id, onClose, onSaved }: { d: Detail; id: string; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const h = d.host;
  const [useDefault, setUseDefault] = useState(!h.rateOwn);
  const [min, setMin] = useState(String(h.rateMin));
  const [max, setMax] = useState(String(h.rateMax));
  const [rate, setRate] = useState(String(h.rate));
  const [busy, setBusy] = useState(false);
  const lo = useDefault ? h.limitMin : Math.round(Number(min));
  const hi = useDefault ? h.limitMax : Math.round(Number(max));
  const r = Math.round(Number(rate));
  const ok = (v: number) => Number.isFinite(v) && v > 0 && v % h.step === 0;
  let err = '';
  if (!useDefault) {
    if (!ok(lo) || !ok(hi)) err = `Minimum and Maximum must be in steps of ${num(h.step)}`;
    else if (lo < h.limitMin || hi > h.limitMax) err = `Range must stay inside ${num(h.limitMin)} – ${num(h.limitMax)}`;
    else if (hi < lo) err = 'Maximum must be more than Minimum';
  }
  if (!err && !ok(r)) err = `Rate must be in steps of ${num(h.step)}`;
  else if (!err && (r < lo || r > hi)) err = `Current rate must be ${num(lo)} – ${num(hi)}`;
  const save = async () => {
    setBusy(true);
    const done = await run(() => api(`/hosts/${id}/rate`, { body: useDefault ? { rate: r } : { rate: r, min: lo, max: hi } }), 'Rate saved');
    setBusy(false);
    if (done) onSaved();
  };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 440 }}>
        <h3>Rate &amp; range · {d.user.name}</h3>
        <p>She can only choose a rate between Minimum and Maximum in the app.</p>
        <div className="g2" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12 }}>
          <label className="lbl">
            Minimum
            <input className="input" type="number" step={h.step} disabled={useDefault} value={useDefault ? h.limitMin : min} onChange={e => setMin(e.target.value)} />
          </label>
          <label className="lbl">
            Maximum
            <input className="input" type="number" step={h.step} disabled={useDefault} value={useDefault ? h.limitMax : max} onChange={e => setMax(e.target.value)} />
          </label>
          <label className="lbl">
            Current rate
            <input className="input" type="number" step={h.step} value={rate} onChange={e => setRate(e.target.value)} />
          </label>
        </div>
        <label className="check mt">
          <input type="checkbox" checked={useDefault} onChange={e => setUseDefault(e.target.checked)} /> Use default range ({num(h.limitMin)} – {num(h.limitMax)} from Settings)
        </label>
        <div className="note-blue mt">
          Range must stay inside {num(h.limitMin)} – {num(h.limitMax)} (Settings limits) and go in steps of {num(h.step)}. If her rate changes, she gets a notice in the app.
        </div>
        <div className="acts end mt">
          {err && (
            <span className="red ml-auto" style={{ fontSize: 12 }}>
              {err}
            </span>
          )}
          <button className="btn b-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn b-gold" disabled={busy || !!err} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Side panel: rate + range bar (Settings limit ke andar)
function RateBar({ h }: { h: Detail['host'] }) {
  const span = Math.max(1, h.limitMax - h.limitMin);
  const at = (v: number) => Math.min(100, Math.max(0, ((v - h.limitMin) / span) * 100));
  return (
    <div className="ratebox">
      <small>Call rate</small>
      <b>{num(h.rate)} gems/min</b>
      <div className="rbar">
        <div className="fill" style={{ left: `${at(h.rateMin)}%`, right: `${100 - at(h.rateMax)}%` }} />
        <div className="pin" style={{ left: `${at(h.rate)}%` }} />
      </div>
      <div className="ticks">
        <span>{num(h.limitMin)}</span>
        <span className={h.rateOwn ? 'blue' : ''}>{h.rateOwn ? `her range ${num(h.rateMin)} – ${num(h.rateMax)}` : 'default range'}</span>
        <span>{num(h.limitMax)}</span>
      </div>
    </div>
  );
}

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

  const [rateOpen, setRateOpen] = useState(false);
  const points = async () => {
    const r = await ask({ title: `Add / remove gems · ${d!.user.name}`, text: `Now ${num(d!.points)} gems (${inr(d!.pointsInr)}). Minus to remove.`, input: { label: 'Gems', type: 'number', check: v => (/^-?\d+$/.test(v) && +v !== 0 ? null : 'Whole number, not 0') }, confirm: 'Next' });
    if (!r) return;
    const n = Math.round(Number(r.value));
    const why = await ask({ title: 'Reason', input: { label: 'Why?', chips: ['Missed call earnings', 'Correction', 'Fraud reversal'], multiline: true }, confirm: `${n > 0 ? 'Add' : 'Remove'} ${num(Math.abs(n))} gems`, tone: 'gold' });
    if (why && (await run(() => api(`/hosts/${id}/points`, { body: { points: n, reason: why.value } }), 'Gems updated'))) after();
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
    <section className="hosts-page">
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
                <th>AGENCY</th>
                <th className="r">RATE · RANGE</th>
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
                    <Who u={h} sub={`ID ${h.publicId}`} />
                  </td>
                  <td className="stack">
                    {h.agency ? (
                      <>
                        <b>{h.agency}</b>
                        <small>{h.agencyCode}</small>
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="r stack">
                    <b>{num(h.rate)}</b>
                    <small className={h.rateOwn ? 'blue' : ''}>
                      {num(h.rateMin)} – {num(h.rateMax)}
                      {h.rateOwn ? '' : ' · default'}
                    </small>
                  </td>
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
                <span>Gems balance</span>
                <b className="gold">
                  {num(d.points)} gems · {num(d.beans)} beans · {inr(d.pointsInr)}
                </b>
                <span>Total earned</span>
                <b>{inr(d.totalEarnedInr)}</b>
                <span>Host since</span>
                <b>{date(d.host.since)}</b>
                <span>Phone</span>
                <b>{d.user.phone ?? '—'}</b>
              </div>
              <RateBar h={d.host} />
              <div className="acts mt">
                {can('moderator') && (
                  <button className="btn b-gold" onClick={() => setRateOpen(true)}>
                    Edit rate &amp; range
                  </button>
                )}
                {can('finance') && (
                  <button className="btn b-ghost" onClick={points}>
                    ± Gems
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
              <h4>Recent gems</h4>
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
              {!d.history.length && <Empty>No gems yet</Empty>}
              {rateOpen && (
                <RateDialog
                  d={d}
                  id={id!}
                  onClose={() => setRateOpen(false)}
                  onSaved={() => {
                    setRateOpen(false);
                    after();
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

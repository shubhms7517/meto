import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Empty, Pill, Tabs, useAuth, useDebounced, Who, type UserCard } from '../ui';

type Call = { id: number; status: 'ringing' | 'connected'; host: UserCard | null; user: UserCard | null; rate: number; startedAt: string; answeredAt: string | null };
type Data = { counts: { active: number; ringing: number; connected: number; endedRecent: number }; items: Call[] };

const REFRESH_MS = 3000;

// mm:ss (ek ghante se upar h:mm:ss)
function fmtDur(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function LiveCalls() {
  const { go } = useAuth();
  const [status, setStatus] = useState<'all' | 'connected' | 'ringing'>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const qs = new URLSearchParams({ status });
    if (dq) qs.set('q', dq);
    try {
      const d = await api<Data>(`/live-calls?${qs}`);
      if (my !== seq.current) return;
      setData(d);
      setError('');
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    }
  }, [status, dq]);

  // filter/search badalte hi turant naya data (purana hata do)
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // har 3 second refresh
  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // duration har second tick kare
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const c = data?.counts;

  return (
    <section className="live-calls-page">
      <div className="top">
        <div>
          <h2>Live calls</h2>
          <div className="sub">Calls in progress · refreshes every 3 seconds · no video, information only</div>
        </div>
        <div className="right live-badge">
          <span className="live-dot" /> Live
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <small>Active now</small>
          <b className="green">{c?.active ?? '—'}</b>
          <em>ringing + connected</em>
        </div>
        <div className="kpi">
          <small>Ringing</small>
          <b className="amber">{c?.ringing ?? '—'}</b>
          <em>phone is ringing</em>
        </div>
        <div className="kpi">
          <small>Connected</small>
          <b className="blue">{c?.connected ?? '—'}</b>
          <em>talking now</em>
        </div>
        <div className="kpi">
          <small>Ended · 15 min</small>
          <b>{c?.endedRecent ?? '—'}</b>
          <em>just ended</em>
        </div>
      </div>

      <div className="filters">
        <input className="search" placeholder="🔍 Search by name / Meto ID" value={q} onChange={e => setQ(e.target.value)} />
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            ['all', 'All'],
            ['connected', 'Connected'],
            ['ringing', 'Ringing'],
          ]}
        />
      </div>

      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>USER</th>
              <th>HOST</th>
              <th>STATUS</th>
              <th>STARTED</th>
              <th className="r">DURATION</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(call => (
              <tr key={call.id} className="click" onClick={() => call.user && go('users', String(call.user.publicId))}>
                <td>
                  <Who u={call.user} />
                </td>
                <td>
                  <Who u={call.host} sub={call.host ? `host · ${call.host.publicId}` : undefined} />
                </td>
                <td>
                  {call.status === 'connected' ? <Pill tone="ok">● Connected</Pill> : <Pill tone="amb">● Ringing</Pill>}
                </td>
                <td className="nowrap dimtxt">
                  {new Date(call.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="r">
                  {call.status === 'connected' && call.answeredAt ? <b className="dur">{fmtDur(call.answeredAt, now)}</b> : <span className="dimtxt">{fmtDur(call.startedAt, now)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="alert a-red">Couldn't load live calls · {error}</div>}
        {!error && data && !data.items.length && <Empty>{dq ? 'No live calls match this search' : 'No calls right now — they will appear here as they start'}</Empty>}
        {!error && !data && <Empty>Loading…</Empty>}
      </div>
    </section>
  );
}

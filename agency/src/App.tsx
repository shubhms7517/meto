import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, getToken, setSignedOutHandler, setToken } from './api';

type Agency = { id: number; code: string; name: string; email: string | null; commissionPct: number };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const num = (n: number) => Math.round(n).toLocaleString('en-IN');

function Avatar({ name, url }: { name: string | null; url?: string | null }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) return <img className="av" src={url} alt="" onError={() => setBad(true)} />;
  return <span className="av">{(name ?? '?').slice(0, 1).toUpperCase()}</span>;
}

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

/* ---------- Login ---------- */
function Login({ onIn }: { onIn: (a: Agency) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ token: string; agency: Agency }>('/auth/login', { body: { email, password } });
      setToken(r.token);
      onIn(r.agency);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="lbox" onSubmit={submit}>
        <div className="logo">
          Meto <small>PARTNERS</small>
        </div>
        <p>Agency login · bring hosts, earn commission</p>
        <input type="email" placeholder="Agency email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        {err && <div className="err">{err}</div>}
        <button className="btn b-rose" style={{ marginTop: 4 }} disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="note">Only for agencies · 5 wrong tries = locked 15 min</div>
      </form>
    </div>
  );
}

/* ---------- Dashboard ---------- */
type Dash = {
  agency: Agency & { inviteLink: string };
  counts: { hosts: number; approved: number; pending: number; online: number };
  earningsInr: number;
  commissionInr: number;
  commissionPct: number;
  recent: { host: { name: string | null; publicId: number; avatarUrl: string | null; online: boolean } | null; title: string; subtitle: string | null; inr: number; at: string }[];
};

function Dashboard({ agency }: { agency: Agency }) {
  const { data: d } = useLoad<Dash>('/dashboard');
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!d) return;
    navigator.clipboard?.writeText(d.agency.inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <section>
      <div className="top">
        <h2>Dashboard</h2>
        <div className="sub">
          {agency.name} · last 30 days
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <small>My hosts</small>
          <b>{d?.counts.hosts ?? '—'}</b>
          <em>{d ? `${d.counts.approved} approved · ${d.counts.pending} pending` : ''}</em>
        </div>
        <div className="kpi green">
          <small>Online now</small>
          <b>{d?.counts.online ?? '—'}</b>
          <em>taking calls</em>
        </div>
        <div className="kpi gold">
          <small>Host earnings · 30d</small>
          <b>{d ? inr(d.earningsInr) : '—'}</b>
          <em>gross</em>
        </div>
        <div className="kpi gold">
          <small>My commission · {d?.commissionPct ?? agency.commissionPct}%</small>
          <b>{d ? inr(d.commissionInr) : '—'}</b>
          <em>on their earnings</em>
        </div>
      </div>

      {d && (
        <div className="invite">
          <b>🔗 Your invite link</b>
          <p>Share with women to recruit them as hosts — they join under your agency.</p>
          <div className="link">
            <input value={d.agency.inviteLink} readOnly />
            <button className="btn b-rose" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="card mt">
        <h3>Recent host activity</h3>
        <table>
          <tbody>
            {d?.recent.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="u">
                    <Avatar name={r.host?.name ?? null} url={r.host?.avatarUrl} />
                    <span>
                      <b>{r.host?.name ?? 'Host'}</b>
                      <small>{r.host?.online ? 'online now' : r.host ? `ID ${r.host.publicId}` : ''}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {r.title}
                  {r.subtitle ? <span className="dim"> · {r.subtitle}</span> : ''}
                </td>
                <td className="r gold">+{inr(r.inr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && !d.recent.length && <div className="empty">No activity yet — share your invite link to get hosts</div>}
      </div>
    </section>
  );
}

/* ---------- My hosts ---------- */
type Hosts = { items: { name: string | null; publicId: number | null; avatarUrl: string | null; age: number | null; online: boolean; status: string; calls: number; earningsInr: number; myCutInr: number; joinedAt: string | null }[] };

function MyHosts() {
  const { data: d } = useLoad<Hosts>('/hosts');
  return (
    <section>
      <div className="top">
        <h2>My hosts</h2>
        <div className="sub">Hosts who joined via your link</div>
      </div>
      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>HOST</th>
              <th>STATUS</th>
              <th>CALLS 30d</th>
              <th className="r">EARNINGS 30d</th>
              <th className="r">MY CUT</th>
              <th>JOINED</th>
            </tr>
          </thead>
          <tbody>
            {d?.items.map((h, i) => (
              <tr key={i}>
                <td>
                  <div className="u">
                    <Avatar name={h.name} url={h.avatarUrl} />
                    <span>
                      <b>
                        {h.name}
                        {h.age ? `, ${h.age}` : ''}
                      </b>
                      <small>
                        {h.online && <span className="dot" />}
                        {h.online ? 'online' : `ID ${h.publicId ?? '—'}`}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{h.status === 'approved' ? <span className="pill p-ok">Approved</span> : <span className="pill p-pend">Pending review</span>}</td>
                <td>{h.status === 'approved' ? num(h.calls) : '—'}</td>
                <td className="r gold">{h.status === 'approved' ? inr(h.earningsInr) : '—'}</td>
                <td className="r green">{h.status === 'approved' ? inr(h.myCutInr) : '—'}</td>
                <td className="dim nowrap">{h.joinedAt ? new Date(h.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && !d.items.length && <div className="empty">No hosts yet — share your invite link</div>}
      </div>
    </section>
  );
}

/* ---------- Shell ---------- */
export default function App() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<'dashboard' | 'hosts'>('dashboard');

  useEffect(() => {
    setSignedOutHandler(() => setAgency(null));
    if (!getToken()) return setReady(true);
    api<{ agency: Agency }>('/me')
      .then(r => setAgency(r.agency))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!agency) return <Login onIn={setAgency} />;

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setAgency(null);
  };

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          Meto <small>PARTNERS</small>
        </div>
        <div className="who">
          <i />
          <div>
            <b>{agency.name}</b>
            <span>{agency.code}</span>
          </div>
        </div>
        <nav className="nav">
          <button className={page === 'dashboard' ? 'on' : ''} onClick={() => setPage('dashboard')}>
            📊 Dashboard
          </button>
          <button className={page === 'hosts' ? 'on' : ''} onClick={() => setPage('hosts')}>
            💖 My hosts
          </button>
          <button className="out" onClick={signOut}>
            ↩ Sign out
          </button>
        </nav>
      </aside>
      <main className="main">{page === 'dashboard' ? <Dashboard agency={agency} /> : <MyHosts />}</main>
    </div>
  );
}

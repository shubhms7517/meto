import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, getToken, setSignedOutHandler, setToken } from './api';

// Commission agency ko kahin nahi dikhana — sirf hosts, unki kamai aur invite link
type Agency = { id: number; code: string; name: string; email: string | null; lastLoginAt: string | null };
type Page = 'dashboard' | 'hosts' | 'invite' | 'account';
const PAGES: Page[] = ['dashboard', 'hosts', 'invite', 'account'];
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

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return { copied, copy };
}

const StatusPill = ({ s }: { s: string }) =>
  s === 'approved' ? <span className="pill p-ok">Approved</span> : s === 'pending' ? <span className="pill p-pend">Pending review</span> : s === 'suspended' ? <span className="pill p-no">Suspended</span> : <span className="pill p-no">Rejected</span>;

/* ---------- Dashboard ---------- */
type Dash = {
  agency: Agency & { inviteLink: string };
  counts: { hosts: number; approved: number; pending: number; online: number };
  earningsInr: number;
  calls30d: number;
  recent: { host: { name: string | null; publicId: number; avatarUrl: string | null; online: boolean } | null; title: string; subtitle: string | null; inr: number; at: string }[];
};

function Dashboard({ agency, go }: { agency: Agency; go: (p: Page) => void }) {
  const { data: d, error } = useLoad<Dash>('/dashboard');
  const { copied, copy } = useCopy();
  return (
    <section>
      <div className="top">
        <h2>Dashboard</h2>
        <div className="sub">{agency.name} · last 30 days</div>
      </div>
      {error && <div className="alert">{error}</div>}
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
          <em>all your hosts</em>
        </div>
        <div className="kpi">
          <small>Calls · 30d</small>
          <b>{d ? num(d.calls30d) : '—'}</b>
          <em>by your hosts</em>
        </div>
      </div>

      {d && (
        <div className="invite">
          <b>🔗 Your invite link</b>
          <p>Share with women to recruit them as hosts — they join under your agency.</p>
          <div className="link">
            <input value={d.agency.inviteLink} readOnly />
            <button className="btn b-rose" onClick={() => copy(d.agency.inviteLink)}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button className="btn b-ghost" onClick={() => go('invite')}>
              QR & share
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
type Hosts = { items: { name: string | null; publicId: number | null; avatarUrl: string | null; age: number | null; online: boolean; status: string; calls: number; earningsInr: number; joinedAt: string | null }[] };

function MyHosts() {
  const { data: d, error } = useLoad<Hosts>('/hosts');
  return (
    <section>
      <div className="top">
        <h2>My hosts</h2>
        <div className="sub">Hosts who joined via your link</div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>HOST</th>
              <th>STATUS</th>
              <th>CALLS 30d</th>
              <th className="r">EARNINGS 30d</th>
              <th>JOINED</th>
            </tr>
          </thead>
          <tbody>
            {d?.items.map((h, i) => {
              const live = h.status === 'approved' || h.status === 'suspended';
              return (
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
                  <td>
                    <StatusPill s={h.status} />
                  </td>
                  <td>{live ? num(h.calls) : '—'}</td>
                  <td className="r gold">{live ? inr(h.earningsInr) : '—'}</td>
                  <td className="dim nowrap">{h.joinedAt ? new Date(h.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d && !d.items.length && <div className="empty">No hosts yet — share your invite link</div>}
      </div>
    </section>
  );
}

/* ---------- Invite link ---------- */
type Invite = { code: string; link: string; counts: { signedUp: number; pending: number; approved: number; rejected: number } };

function InviteLink() {
  const { data: d, error } = useLoad<Invite>('/invite');
  const { copied, copy } = useCopy();
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!d) return;
    QRCode.toDataURL(d.link, { width: 360, margin: 1 }).then(setQr).catch(() => setQr(''));
  }, [d]);
  const shareText = d ? `Join Meto as a host and earn from video calls. Sign up with my link: ${d.link}` : '';
  return (
    <section>
      <div className="top">
        <h2>Invite link</h2>
        <div className="sub">Women who sign up with this link join your agency</div>
      </div>
      {error && <div className="alert">{error}</div>}
      {d && (
        <>
          <div className="grid2 mt">
            <div className="card pad">
              <h4>Your link</h4>
              <div className="link mt-s">
                <input className="field" value={d.link} readOnly />
              </div>
              <div className="acts mt-s">
                <button className="btn b-rose" onClick={() => copy(d.link)}>
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a className="btn b-ghost" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                  Share on WhatsApp
                </a>
              </div>
              <div className="code-row mt">
                Invite code <b>{d.code}</b>
              </div>
              <h4 className="mt">How it works</h4>
              <ol className="steps">
                <li>Send your link (or QR) to women who want to become hosts.</li>
                <li>They install Meto from the link and fill the host form (photos + 30 sec video).</li>
                <li>Meto team checks and approves — then they show in My hosts.</li>
              </ol>
            </div>
            <div className="card pad center">
              <h4>QR code</h4>
              {qr ? <img className="qr" src={qr} alt="Invite QR code" /> : <div className="empty">Making QR…</div>}
              {qr && (
                <a className="btn b-ghost mt-s" href={qr} download={`meto-invite-${d.code}.png`}>
                  Download QR
                </a>
              )}
            </div>
          </div>
          <div className="kpis">
            <div className="kpi">
              <small>Signed up via link</small>
              <b>{num(d.counts.signedUp)}</b>
              <em>opened the app with it</em>
            </div>
            <div className="kpi">
              <small>Pending review</small>
              <b className="amber">{num(d.counts.pending)}</b>
              <em>form sent</em>
            </div>
            <div className="kpi green">
              <small>Approved</small>
              <b>{num(d.counts.approved)}</b>
              <em>now hosts</em>
            </div>
            <div className="kpi">
              <small>Rejected</small>
              <b className="red">{num(d.counts.rejected)}</b>
              <em>not approved</em>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- Account ---------- */
function Account({ agency, signOut }: { agency: Agency; signOut: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = next && (next.length < 10 ? 'At least 10 characters' : !/[A-Za-z]/.test(next) || !/\d/.test(next) ? 'Use letters and numbers' : again && next !== again ? 'Passwords do not match' : '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/account/password', { body: { current, next } });
      setCurrent('');
      setNext('');
      setAgain('');
      setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' });
    } catch (e2) {
      setMsg({ ok: false, text: e2 instanceof ApiError ? e2.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <div className="top">
        <h2>Account</h2>
        <div className="sub">Your agency details and password</div>
      </div>
      <div className="grid2 mt">
        <div className="card pad">
          <h4>Agency details</h4>
          <div className="kv">
            <span>Agency name</span>
            <b>{agency.name}</b>
            <span>Invite code</span>
            <b>{agency.code}</b>
            <span>Login email</span>
            <b>{agency.email ?? '—'}</b>
            <span>Last login</span>
            <b>{agency.lastLoginAt ? new Date(agency.lastLoginAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</b>
          </div>
          <p className="dim mt-s small">To change these details, contact the Meto team.</p>
          <button className="btn b-ghost mt" onClick={signOut}>
            ↩ Sign out
          </button>
        </div>
        <form className="card pad" onSubmit={save}>
          <h4>Change password</h4>
          <label className="lbl">
            Current password
            <input className="field" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="lbl">
            New password
            <input className="field" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" placeholder="10+ letters and numbers" />
          </label>
          <label className="lbl">
            New password again
            <input className="field" type="password" value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" />
          </label>
          {problem && <div className="err">{problem}</div>}
          {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
          <button className="btn b-rose mt" disabled={busy || !current || !next || !!problem || next !== again}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ---------- Shell ---------- */
const toLogin = () => {
  location.href = '/admin/';
};
const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '') as Page;
  return PAGES.includes(h) ? h : 'dashboard';
};

export default function App() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>(pageFromHash);

  useEffect(() => {
    // Login ek hi jagah hota hai: admin panel ka login page
    setSignedOutHandler(toLogin);
    if (!getToken()) return toLogin();
    api<{ agency: Agency }>('/me')
      .then(r => setAgency(r.agency))
      .catch(() => {
        setToken(null);
        toLogin();
      })
      .finally(() => setReady(true));
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (p: Page) => {
    location.hash = `#/${p}`;
    setPage(p);
  };

  if (!ready || !agency) return null;

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    toLogin();
  };

  const NAV: [Page, string][] = [
    ['dashboard', '📊 Dashboard'],
    ['hosts', '💖 My hosts'],
    ['invite', '🔗 Invite link'],
    ['account', '⚙️ Account'],
  ];

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
          {NAV.map(([k, label]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)}>
              {label}
            </button>
          ))}
          <button className="out" onClick={signOut}>
            ↩ Sign out
          </button>
        </nav>
      </aside>
      <main className="main">
        {page === 'dashboard' && <Dashboard agency={agency} go={go} />}
        {page === 'hosts' && <MyHosts />}
        {page === 'invite' && <InviteLink />}
        {page === 'account' && <Account agency={agency} signOut={signOut} />}
      </main>
    </div>
  );
}

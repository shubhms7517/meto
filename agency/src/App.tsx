import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, getToken, setSignedOutHandler, setToken } from './api';

// Agency ko ₹, commission % ya bean rate kabhi nahi dikhana — sirf gems aur commission beans
type Agency = { id: number; code: string; name: string; email: string | null; lastLoginAt: string | null };
type Page = 'dashboard' | 'gems' | 'hosts' | 'invite' | 'account';
const PAGES: Page[] = ['dashboard', 'gems', 'hosts', 'invite', 'account'];
const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const Gems = ({ n, sign }: { n: number; sign?: boolean }) => (
  <span className="gem">
    {sign && n > 0 ? '+' : ''}
    {num(n)}
  </span>
);
const Beans = ({ n }: { n: number }) => <span className="bean">{num(n)}</span>;

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
  gemBalance: number; // users ko bhejne ke liye
  hostGems: number; // agency banne ke baad se hosts ke gems
  hostGems30: number;
  commissionBeans: number;
  usersThisMonth: number;
  calls30d: number;
  recent: { host: { name: string | null; publicId: number; avatarUrl: string | null; online: boolean } | null; title: string; subtitle: string | null; gems: number; at: string }[];
};

function Dashboard({ agency, go }: { agency: Agency; go: (p: Page) => void }) {
  const { data: d, error } = useLoad<Dash>('/dashboard');
  const { copied, copy } = useCopy();
  return (
    <section>
      <div className="top">
        <h2>Dashboard</h2>
        <div className="sub">{agency.name}</div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="kpis">
        <div className="kpi">
          <small>Gems stock</small>
          <b>{d ? <Gems n={d.gemBalance} /> : '—'}</b>
          <em>
            to send to users ·{' '}
            <button className="link-btn" onClick={() => go('gems')}>
              Send gems →
            </button>
          </em>
        </div>
        <div className="kpi">
          <small>Your hosts earned</small>
          <b>{d ? <Gems n={d.hostGems} /> : '—'}</b>
          <em>gems, since you joined{d ? ` · ${num(d.hostGems30)} in 30 days` : ''}</em>
        </div>
        <div className="kpi">
          <small>Commission</small>
          <b>{d ? <Beans n={d.commissionBeans} /> : '—'}</b>
          <em>beans · from your hosts</em>
        </div>
        <div className="kpi">
          <small>My hosts</small>
          <b>{d?.counts.hosts ?? '—'}</b>
          <em>{d ? `${d.counts.approved} approved · ${d.counts.online} online · ${num(d.usersThisMonth)} users got gems this month` : ''}</em>
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
                <td className="r">
                  <Gems n={r.gems} sign />
                </td>
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
type Hosts = { items: { name: string | null; publicId: number | null; avatarUrl: string | null; age: number | null; online: boolean; status: string; calls: number; gems30: number; gems: number; joinedAt: string | null }[] };

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
              <th className="r">GEMS 30d</th>
              <th className="r">GEMS SINCE JOINING YOU</th>
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
                  <td className="r">{live ? <Gems n={h.gems30} /> : '—'}</td>
                  <td className="r">{live ? <Gems n={h.gems} /> : '—'}</td>
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

/* ---------- Send gems ---------- */
type Lite = { publicId: number; name: string | null; age: number | null; avatarUrl: string | null };
type GemHistory = { gemBalance: number; items: { id: number; kind: 'admin_add' | 'send'; gems: number; balanceAfter: number; user: Lite | null; at: string }[] };

// Meto ID se user dhoondo → gems daalo → confirm → bhejo. Stock se zyada nahi, host ko nahi.
function SendGems() {
  const h = useLoad<GemHistory>('/gems');
  const [id, setId] = useState('');
  const [user, setUser] = useState<Lite | null>(null);
  const [findErr, setFindErr] = useState('');
  const [gems, setGems] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stock = h.data?.gemBalance ?? 0;
  const g = Math.round(Number(gems));
  const gemsErr = !gems ? '' : !(g >= 1) ? 'Enter gems' : g > stock ? `You have only ${num(stock)} gems` : '';

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setUser(null);
    setFindErr('');
    setMsg(null);
    setStep('edit');
    const clean = id.replace(/\D/g, '');
    if (!clean) return setFindErr('Enter the Meto ID');
    try {
      setUser((await api<{ user: Lite }>(`/users/${clean}`)).user);
    } catch (e2) {
      setFindErr(e2 instanceof ApiError ? e2.message : 'Something went wrong');
    }
  };
  const send = async () => {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/gems/send', { body: { publicId: user.publicId, gems: g } });
      setMsg({ ok: true, text: `Sent ${num(g)} gems to ${user.name ?? 'user'} (ID ${user.publicId}).` });
      setGems('');
      setUser(null);
      setId('');
      setStep('edit');
      h.reload();
    } catch (e2) {
      setMsg({ ok: false, text: e2 instanceof ApiError ? e2.message : 'Something went wrong' });
      setStep('edit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="top">
        <h2>Send gems</h2>
        <div className="sub">Send gems from your stock to a user · search by Meto ID</div>
      </div>
      {h.error && <div className="alert">{h.error}</div>}
      <div className="grid2 mt">
        <div className="card pad">
          <div className="stock">
            <span className="dim">Your gems stock</span>
            <b>
              <Gems n={stock} />
            </b>
          </div>
          <form onSubmit={find}>
            <label className="lbl">
              User’s Meto ID
              <div className="row mt-s">
                <input className="field" inputMode="numeric" value={id} placeholder="e.g. 448708254" onChange={e => setId(e.target.value)} />
                <button className="btn b-ghost">Find</button>
              </div>
            </label>
          </form>
          {findErr && <div className="err">{findErr}</div>}
          {user && (
            <>
              <div className="found">
                <Avatar name={user.name} url={user.avatarUrl} />
                <div>
                  <b>
                    {user.name ?? 'User'}
                    {user.age ? `, ${user.age}` : ''}
                  </b>
                  <small>Meto ID {user.publicId}</small>
                </div>
              </div>
              <label className="lbl">
                Gems to send
                <input className="field" type="number" min={1} value={gems} placeholder="e.g. 10000" onChange={e => (setGems(e.target.value), setStep('edit'))} />
              </label>
              <div className="chips">
                {[5_000, 10_000, 50_000, 1_00_000].map(v => (
                  <button type="button" key={v} className={g === v ? 'on' : ''} onClick={() => (setGems(String(v)), setStep('edit'))}>
                    {num(v)}
                  </button>
                ))}
              </div>
              {gemsErr && <div className="err">{gemsErr}</div>}
              {step === 'confirm' && !gemsErr && (
                <div className="confirm">
                  Send <b>{num(g)} gems</b> to <b>{user.name ?? 'user'}</b> (ID {user.publicId})? This can’t be undone. Stock after: {num(stock - g)}.
                </div>
              )}
              <div className="acts mt-s">
                {step === 'edit' ? (
                  <button className="btn b-rose" disabled={!gems || !!gemsErr} onClick={() => setStep('confirm')}>
                    Send {g >= 1 ? num(g) : ''} gems
                  </button>
                ) : (
                  <>
                    <button className="btn b-ghost" onClick={() => setStep('edit')}>
                      Back
                    </button>
                    <button className="btn b-rose" disabled={busy || !!gemsErr} onClick={send}>
                      {busy ? 'Sending…' : 'Yes, send'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
        </div>
        <div className="card pad">
          <h4>How it works</h4>
          <ol className="steps">
            <li>Take the money from the user yourself (outside the app).</li>
            <li>Find the user by their Meto ID (they can see it on their profile).</li>
            <li>Send gems — they reach the user’s wallet at once with a notice.</li>
          </ol>
          <p className="dim small mt-s">Gems can be sent only to users, not to hosts. Sent gems can’t be taken back. Need more stock? Contact the Meto team.</p>
        </div>
      </div>

      <div className="card mt">
        <h3>Gems history</h3>
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>WHAT</th>
              <th className="r">GEMS</th>
              <th className="r">STOCK AFTER</th>
            </tr>
          </thead>
          <tbody>
            {h.data?.items.map(x => (
              <tr key={x.id}>
                <td className="dim nowrap">{new Date(x.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                  {x.kind === 'admin_add' ? (
                    'Added by Meto team'
                  ) : (
                    <div className="u">
                      <Avatar name={x.user?.name ?? null} url={x.user?.avatarUrl} />
                      <span>
                        <b>{x.user?.name ?? 'User'}</b>
                        <small>ID {x.user?.publicId ?? '—'}</small>
                      </span>
                    </div>
                  )}
                </td>
                <td className="r">
                  <Gems n={x.gems} sign />
                </td>
                <td className="r dim">{num(x.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {h.data && !h.data.items.length && <div className="empty">No gems yet — the Meto team adds gems to your stock</div>}
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
    ['gems', '💎 Send gems'],
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
        {page === 'gems' && <SendGems />}
        {page === 'hosts' && <MyHosts />}
        {page === 'invite' && <InviteLink />}
        {page === 'account' && <Account agency={agency} signOut={signOut} />}
      </main>
    </div>
  );
}

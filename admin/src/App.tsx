import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setSignedOutHandler, setToken } from './api';
import { AuthContext, UiProvider, type AdminMe, type Pending, type Role } from './ui';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import Reports from './pages/Reports';
import LiveCalls from './pages/LiveCalls';
import Withdrawals from './pages/Withdrawals';
import Support from './pages/Support';
import Users from './pages/Users';
import Hosts from './pages/Hosts';
import Transactions from './pages/Transactions';
import Store from './pages/Store';
import Notices from './pages/Notices';
import Settings from './pages/Settings';
import Audit from './pages/Audit';
import Agencies from './pages/Agencies';
import Compliance from './pages/Compliance';
import Admins from './pages/Admins';

type Page = { key: string; label: string; icon: string; roles: Role[]; el: (id?: string) => ReactNode; badge?: (p: Pending) => number; section?: string };

// roles: kis role ko ye page dikhe (owner ko sab)
const PAGES: Page[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['moderator', 'support', 'finance'], el: () => <Dashboard /> },
  { key: 'applications', label: 'Host applications', icon: '🎙️', roles: ['moderator'], el: id => <Applications id={id} />, badge: p => p.applications, section: 'QUEUES' },
  { key: 'reports', label: 'Reports', icon: '🚩', roles: ['moderator'], el: id => <Reports id={id} />, badge: p => p.reports },
  { key: 'live-calls', label: 'Live calls', icon: '🔴', roles: ['moderator'], el: () => <LiveCalls />, badge: p => p.live },
  { key: 'withdrawals', label: 'Withdrawals', icon: '💸', roles: ['finance'], el: () => <Withdrawals />, badge: p => p.withdrawals },
  { key: 'support', label: 'Support', icon: '🎧', roles: ['support'], el: id => <Support id={id} />, badge: p => p.support },
  { key: 'users', label: 'Users', icon: '👥', roles: ['moderator', 'support', 'finance'], el: id => <Users id={id} />, section: 'PEOPLE' },
  { key: 'hosts', label: 'Hosts', icon: '💖', roles: ['moderator', 'support', 'finance'], el: id => <Hosts id={id} /> },
  { key: 'agencies', label: 'Agencies', icon: '🏢', roles: [], el: () => <Agencies />, badge: p => p.agencies },
  { key: 'transactions', label: 'Transactions', icon: '💎', roles: ['finance', 'support'], el: () => <Transactions />, section: 'MONEY' },
  { key: 'store', label: 'Store · gifts', icon: '🛍️', roles: [], el: () => <Store /> },
  { key: 'notices', label: 'Notices & push', icon: '📢', roles: [], el: () => <Notices />, section: 'PLATFORM' },
  { key: 'settings', label: 'Settings', icon: '⚙️', roles: [], el: () => <Settings /> },
  { key: 'compliance', label: 'Compliance', icon: '🧾', roles: ['moderator'], el: () => <Compliance /> },
  { key: 'audit', label: 'Audit log', icon: '📜', roles: [], el: () => <Audit /> },
  { key: 'admins', label: 'Admin team', icon: '🔐', roles: [], el: () => <Admins /> },
];

const parseHash = () => {
  const [, page = 'dashboard', id] = window.location.hash.split('/');
  return { page, id };
};

export default function App() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [checking, setChecking] = useState(!!getToken());
  const [route, setRoute] = useState(parseHash());

  const refreshPending = useCallback(() => {
    api<{ admin: AdminMe; pending: Pending }>('/auth/me')
      .then(r => {
        setMe(r.admin);
        setPending(r.pending);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    if (!getToken()) return;
    api<{ admin: AdminMe; pending: Pending }>('/auth/me')
      .then(r => {
        setMe(r.admin);
        setPending(r.pending);
      })
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  // Laal ginti har minute taaza
  useEffect(() => {
    if (!me) return;
    const t = window.setInterval(refreshPending, 60_000);
    return () => window.clearInterval(t);
  }, [me, refreshPending]);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((page: string, id?: string) => {
    window.location.hash = `/${page}${id ? `/${id}` : ''}`;
  }, []);

  if (checking) return <div className="login" />;
  if (!me) return <Login onIn={(a, p) => (setMe(a), setPending(p))} />;

  const can = (...roles: Role[]) => me.role === 'owner' || roles.includes(me.role);
  const visible = PAGES.filter(p => me.role === 'owner' || p.roles.includes(me.role));
  const current = visible.find(p => p.key === route.page) ?? visible[0]!;

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setMe(null);
  };

  return (
    <UiProvider>
      <AuthContext.Provider value={{ me, pending, refreshPending, can, go }}>
        <div className="app">
          <aside className="side">
            <div className="logo">
              Meto <small>ADMIN</small>
            </div>
            <div className="role">
              <i />
              <span>
                <b>{me.name}</b>
                {me.role[0]!.toUpperCase() + me.role.slice(1)}
              </span>
            </div>
            <nav className="nav">
              {visible.map(p => {
                const n = pending && p.badge ? p.badge(pending) : 0;
                return (
                  <div key={p.key} style={{ display: 'contents' }}>
                    {p.section && <div className="sep">{p.section}</div>}
                    <a className={p.key === current.key ? 'on' : ''} onClick={() => go(p.key)}>
                      {p.icon} {p.label}
                      {n > 0 && <span className="n">{n}</span>}
                    </a>
                  </div>
                );
              })}
              <div className="sep" />
              <a onClick={signOut}>↩ Sign out</a>
            </nav>
          </aside>
          <main className="main" key={current.key}>
            {current.el(route.page === current.key ? route.id : undefined)}
          </main>
        </div>
      </AuthContext.Provider>
    </UiProvider>
  );
}

function Login({ onIn }: { onIn: (a: AdminMe, p: Pending) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ token: string; admin: AdminMe }>('/auth/login', { body: { email, password } });
      setToken(r.token);
      const m = await api<{ admin: AdminMe; pending: Pending }>('/auth/me');
      onIn(m.admin, m.pending);
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
          Meto <small>ADMIN</small>
        </div>
        <p>Meto team only</p>
        <input className="input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        {err && <div className="err">{err}</div>}
        <button className="btn b-rose big mt" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="note">Each admin has their own login · 5 wrong tries = locked 15 min · every action is logged</div>
      </form>
    </div>
  );
}

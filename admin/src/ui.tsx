import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from './api';

/* ---------- types ---------- */

export type Role = 'owner' | 'moderator' | 'support' | 'finance';
export type AdminMe = { id: number; email: string; name: string; role: Role; status: string; lastLoginAt: string | null };
export type Pending = { applications: number; withdrawals: number; withdrawalsInr: number; support: number; supportLate: number; reports: number; reportsUrgent: number; live: number; agencies: number };
export type UserCard = { id: number; publicId: number; name: string | null; age: number | null; gender: string | null; avatarUrl: string | null; role: string; status: string; online: boolean };

/* ---------- format ---------- */

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const num = (n: number) => Math.round(n).toLocaleString('en-IN');
export const ago = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/* ---------- small components ---------- */

export function Avatar({ u, size = 32 }: { u: { name: string | null; avatarUrl: string | null } | null; size?: number }) {
  const [bad, setBad] = useState(false);
  const style = { width: size, height: size };
  if (u?.avatarUrl && !bad) return <img className="av" style={style} src={u.avatarUrl} alt="" onError={() => setBad(true)} />;
  return (
    <span className="av" style={style}>
      {(u?.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

// Photo / video jo server pe na mile → khaali jagah ki jagah saaf "File missing" box
export function Img({ src, onClick }: { src: string; onClick?: () => void }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className="missing">File missing</div>;
  return <img src={src} alt="" onClick={onClick} onError={() => setBad(true)} />;
}
export function Vid({ src, className, style }: { src: string; className?: string; style?: CSSProperties }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className={`missing${className ? ` ${className}` : ''}`}>Video file missing</div>;
  return <video className={className} style={style} src={src} controls preload="metadata" onError={() => setBad(true)} />;
}

export function Who({ u, sub }: { u: UserCard | null; sub?: ReactNode }) {
  if (!u) return <span className="dimtxt">deleted</span>;
  return (
    <div className="who">
      <Avatar u={u} />
      <span>
        {u.online && <span className="dot" />}
        {u.name ?? 'User'}
        {u.age ? `, ${u.age}` : ''}
        <small>{sub ?? `ID ${u.publicId}`}</small>
      </span>
    </div>
  );
}

export const Pill = ({ tone, children }: { tone: 'pend' | 'ok' | 'no' | 'blue' | 'amb' | 'gray'; children: ReactNode }) => <span className={`pill p-${tone}`}>{children}</span>;

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return (
    <div className="tabs">
      {items.map(([k, label]) => (
        <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export const Toggle = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <button type="button" className={`tog${on ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on} />
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/* ---------- data loading ---------- */

// Search box: har akshar pe request nahi — rukne ke 300 ms baad
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  // Path badla (tab / filter) to purana data turant hatao, warna pichhle tab ki list dikhti hai
  const last = useRef(path);
  if (last.current !== path) {
    last.current = path;
    seq.current++;
    if (data !== null) setData(null);
  }
  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: load, setData };
}

/* ---------- toast + dialogs ---------- */

type DialogState = {
  title: string;
  text?: ReactNode;
  input?: { label: string; placeholder?: string; type?: string; multiline?: boolean; initial?: string; chips?: string[]; check?: (v: string) => string | null };
  password?: boolean;
  confirm: string;
  tone?: 'rose' | 'red' | 'green' | 'gold';
  resolve: (v: { value: string; password: string } | null) => void;
};

type Ctx = {
  toast: (msg: string, bad?: boolean) => void;
  ask: (d: Omit<DialogState, 'resolve'>) => Promise<{ value: string; password: string } | null>;
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;
  zoom: (url: string) => void;
};
const UiCtx = createContext<Ctx | null>(null);
export const useUi = () => useContext(UiCtx)!;

export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToast] = useState<{ msg: string; bad: boolean } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [zoomUrl, setZoom] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const ask = useCallback(
    (d: Omit<DialogState, 'resolve'>) =>
      new Promise<{ value: string; password: string } | null>(resolve => {
        setValue(d.input?.initial ?? '');
        setPassword('');
        setDialog({ ...d, resolve });
      }),
    [],
  );
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string) => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Something went wrong', true);
        return undefined;
      }
    },
    [toast],
  );

  const close = (v: { value: string; password: string } | null) => {
    dialog?.resolve(v);
    setDialog(null);
  };
  const problem = dialog?.input?.check && value.trim() ? dialog.input.check(value.trim()) : null;
  const canGo = !problem && (!dialog?.input || value.trim().length > 0) && (!dialog?.password || password.length > 0);
  const toneClass = { rose: 'b-rose', red: 'b-red', green: 'b-green', gold: 'b-gold' }[dialog?.tone ?? 'rose'];

  return (
    <UiCtx.Provider value={{ toast, ask, run, zoom: setZoom }}>
      {children}
      {dialog && (
        <div className="overlay" onMouseDown={e => e.target === e.currentTarget && close(null)}>
          <form
            className="modal"
            onSubmit={e => {
              e.preventDefault();
              if (canGo) close({ value: value.trim(), password });
            }}>
            <h3>{dialog.title}</h3>
            {dialog.text && <p>{dialog.text}</p>}
            {dialog.input && (
              <label className="lbl">
                {dialog.input.label}
                {dialog.input.chips && (
                  <div className="chips">
                    {dialog.input.chips.map(c => (
                      <button type="button" key={c} onClick={() => setValue(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {dialog.input.multiline ? (
                  <textarea className="textarea" autoFocus value={value} placeholder={dialog.input.placeholder} onChange={e => setValue(e.target.value)} />
                ) : (
                  <input className="input" autoFocus type={dialog.input.type ?? 'text'} value={value} placeholder={dialog.input.placeholder} onChange={e => setValue(e.target.value)} />
                )}
                {problem && <span className="red" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{problem}</span>}
              </label>
            )}
            {dialog.password && (
              <label className="lbl">
                Your admin password (the one you log in with)
                <input className="input" type="password" autoFocus={!dialog.input} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
            )}
            <div className="acts end mt">
              <button type="button" className="btn b-ghost" onClick={() => close(null)}>
                Cancel
              </button>
              <button type="submit" className={`btn ${toneClass}`} disabled={!canGo}>
                {dialog.confirm}
              </button>
            </div>
          </form>
        </div>
      )}
      {toastMsg && <div className={`toast${toastMsg.bad ? ' bad' : ''}`}>{toastMsg.msg}</div>}
      {zoomUrl && (
        <div className="zoom" onClick={() => setZoom(null)}>
          <img src={zoomUrl} alt="" />
        </div>
      )}
    </UiCtx.Provider>
  );
}

/* ---------- auth context ---------- */

type AuthCtx = { me: AdminMe; pending: Pending | null; refreshPending: () => void; can: (...roles: Role[]) => boolean; go: (page: string, id?: string) => void };
export const AuthContext = createContext<AuthCtx | null>(null);
export const useAuth = () => useContext(AuthContext)!;

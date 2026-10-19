import { useState } from 'react';
import { api } from '../api';
import { Avatar, Empty, inr, num, Pill, useApi, useUi } from '../ui';

type Agency = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  commissionPct: number;
  status: 'active' | 'disabled';
  hosts: number;
  earningsInr: number;
  commissionInr: number;
  lastLoginAt: string | null;
};
type Data = { items: Agency[]; totals: { agencies: number; active: number; hosts: number; earningsInr: number; commissionInr: number } };

// Naya / edit agency — modal (owner password se confirm)
function AgencyEditor({ agency, onClose, onSaved }: { agency: Agency | null; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [name, setName] = useState(agency?.name ?? '');
  const [code, setCode] = useState(agency?.code ?? '');
  const [email, setEmail] = useState(agency?.email ?? '');
  const [pct, setPct] = useState(String(agency?.commissionPct ?? 10));
  const [password, setPassword] = useState('');
  const [myPassword, setMyPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = !!agency;

  // Kya bharna baaki hai
  const miss: string[] = [];
  if (name.trim().length < 2) miss.push('name');
  if (!editing && !/^[A-Za-z0-9]{2,20}$/.test(code.trim())) miss.push('code');
  if (!editing && !/^\S+@\S+\.\S+$/.test(email.trim())) miss.push('email');
  if (!(Number(pct) >= 0 && Number(pct) <= 50)) miss.push('commission 0–50%');
  if (!editing && password.length < 10) miss.push('password (10+)');
  if (!myPassword) miss.push('your password');

  const save = async () => {
    setBusy(true);
    const body = editing
      ? { name: name.trim(), commissionPct: Number(pct), ...(password ? { password } : {}), myPassword }
      : { name: name.trim(), code: code.trim().toUpperCase(), email: email.trim(), commissionPct: Number(pct), password, myPassword };
    const ok = await run(() => api(editing ? `/agencies/${agency!.id}` : '/agencies', { method: editing ? 'PATCH' : 'POST', body }), editing ? 'Agency saved' : 'Agency created');
    setBusy(false);
    if (ok) onSaved();
  };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }}>
        <h3>{editing ? `Edit · ${agency!.name}` : 'New agency'}</h3>
        <p>They log in to the separate agency portal with this email + password.</p>
        <div className="g2" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
          <label className="lbl">
            Agency name *
            <input className="input" value={name} placeholder="e.g. Star Agency" onChange={e => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="lbl">
            Invite code {editing ? '(fixed)' : '*'}
            <input className="input" value={code} placeholder="e.g. AG1045" disabled={editing} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={20} />
          </label>
          <label className="lbl">
            Login email {editing ? '(fixed)' : '*'}
            <input className="input" type="email" value={email} placeholder="agency@email.com" disabled={editing} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="lbl">
            Commission % *
            <input className="input" type="number" min={0} max={50} value={pct} onChange={e => setPct(e.target.value)} />
          </label>
          <label className="lbl" style={{ gridColumn: '1 / 3' }}>
            {editing ? 'New password (leave blank to keep)' : 'First password (10+ chars) *'}
            <input className="input" type="password" value={password} placeholder={editing ? '••••••••••' : '10+ letters and numbers'} onChange={e => setPassword(e.target.value)} />
          </label>
        </div>
        <label className="lbl mt">
          Your password (to confirm) *
          <input className="input" type="password" value={myPassword} onChange={e => setMyPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <div className="acts end mt">
          {miss.length > 0 && <span className="red ml-auto" style={{ fontSize: 12 }}>Enter {miss.slice(0, 2).join(' and ')}</span>}
          <button className="btn b-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn b-rose" disabled={busy || miss.length > 0} onClick={save}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Create agency'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Agencies() {
  const { ask, run } = useUi();
  const list = useApi<Data>('/agencies');
  const [edit, setEdit] = useState<Agency | 'new' | null>(null);
  const t = list.data?.totals;

  const toggle = async (a: Agency) => {
    const next = a.status === 'active' ? 'disabled' : 'active';
    const r = await ask({
      title: next === 'disabled' ? `Pause ${a.name}?` : `Re-activate ${a.name}?`,
      text: next === 'disabled' ? 'Their invite link stops working and they can’t log in.' : 'They can log in and recruit hosts again.',
      password: true,
      confirm: next === 'disabled' ? 'Pause' : 'Re-activate',
      tone: next === 'disabled' ? 'red' : 'green',
    });
    if (r && (await run(() => api(`/agencies/${a.id}`, { method: 'PATCH', body: { status: next, myPassword: r.password } }), 'Saved'))) list.reload();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Agencies</h2>
          <div className="sub">Partners who bring hosts · they earn a commission on their hosts’ income</div>
        </div>
        <div className="right">
          <button className="btn b-rose" onClick={() => setEdit('new')}>
            + New agency
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <small>Agencies</small>
          <b>{t?.agencies ?? '—'}</b>
          <em>{t ? `${t.active} active` : ''}</em>
        </div>
        <div className="kpi">
          <small>Hosts via agencies</small>
          <b>{t?.hosts ?? '—'}</b>
          <em>joined through a link</em>
        </div>
        <div className="kpi gold">
          <small>Host earnings · 30d</small>
          <b>{t ? inr(t.earningsInr) : '—'}</b>
          <em>gross</em>
        </div>
        <div className="kpi">
          <small>Commission · 30d</small>
          <b className="green">{t ? inr(t.commissionInr) : '—'}</b>
          <em>to agencies</em>
        </div>
      </div>

      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>AGENCY</th>
              <th>CODE</th>
              <th>HOSTS</th>
              <th className="r">EARNINGS 30d</th>
              <th>COMMISSION</th>
              <th className="r">THEIR CUT 30d</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="who">
                    <Avatar u={{ name: a.name, avatarUrl: null }} />
                    <span>
                      {a.name}
                      <small>{a.email ?? 'no login'}</small>
                    </span>
                  </div>
                </td>
                <td className="dimtxt">{a.code}</td>
                <td>{num(a.hosts)}</td>
                <td className="r gold">{inr(a.earningsInr)}</td>
                <td>{a.commissionPct}%</td>
                <td className="r green">{inr(a.commissionInr)}</td>
                <td>{a.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="no">Paused</Pill>}</td>
                <td className="r nowrap">
                  <button className="link" onClick={() => setEdit(a)}>
                    Edit
                  </button>
                  <button className="link" onClick={() => toggle(a)} style={{ marginLeft: 10 }}>
                    {a.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && !list.data.items.length && <Empty>No agencies yet — add one to start recruiting hosts</Empty>}
      </div>

      {edit && <AgencyEditor agency={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), list.reload())} />}
    </section>
  );
}

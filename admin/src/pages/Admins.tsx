import { useState } from 'react';
import { api } from '../api';
import { ago, Pill, useApi, useAuth, useUi, type AdminMe, type Role } from '../ui';

const ROLES: Role[] = ['owner', 'moderator', 'support', 'finance'];
const TONE: Record<Role, 'pend' | 'gray' | 'blue' | 'ok'> = { owner: 'pend', moderator: 'gray', support: 'blue', finance: 'ok' };
const CAN: [string, Role[]][] = [
  ['Approve hosts · reports · ban', ['owner', 'moderator']],
  ['Support replies', ['owner', 'support']],
  ['Refund gems (support up to 2,000)', ['owner', 'support', 'finance']],
  ['Pay withdrawals · VIP · host points', ['owner', 'finance']],
  ['Settings · store · agencies · notices', ['owner']],
  ['Admin team · audit log', ['owner']],
];

export default function Admins() {
  const { me } = useAuth();
  const { ask, run } = useUi();
  const list = useApi<{ items: AdminMe[] }>('/admins');
  const [form, setForm] = useState({ email: '', name: '', role: 'support' as Role, password: '' });

  const invite = async () => {
    const r = await ask({ title: `Add ${form.name} as ${form.role}?`, text: `Give them the email and password yourself (not by public chat). They can change the password later.`, password: true, confirm: 'Add admin', tone: 'green' });
    if (r && (await run(() => api('/admins', { body: { ...form, myPassword: r.password } }), 'Admin added'))) {
      setForm({ email: '', name: '', role: 'support', password: '' });
      list.reload();
    }
  };
  const change = async (a: AdminMe, patch: { role?: Role; status?: 'active' | 'disabled' }) => {
    const r = await ask({ title: patch.status === 'disabled' ? `Remove access for ${a.name}?` : `Change ${a.name}?`, text: patch.role ? `Role: ${a.role} → ${patch.role}` : undefined, password: true, confirm: 'Confirm', tone: patch.status === 'disabled' ? 'red' : 'rose' });
    if (r && (await run(() => api(`/admins/${a.id}`, { method: 'PATCH', body: { ...patch, myPassword: r.password } }), 'Saved'))) list.reload();
  };
  const reset = async (a: AdminMe) => {
    const r = await ask({ title: `New password for ${a.name}`, text: '10+ characters with letters and numbers. They are signed out everywhere.', input: { label: 'New password', type: 'password' }, password: true, confirm: 'Set password', tone: 'red' });
    if (r && (await run(() => api(`/admins/${a.id}`, { method: 'PATCH', body: { password: r.value, myPassword: r.password } }), 'Password changed'))) list.reload();
  };
  const myPassword = async () => {
    const cur = await ask({ title: 'Change your password', input: { label: 'Current password', type: 'password' }, confirm: 'Next' });
    if (!cur) return;
    const nx = await ask({ title: 'New password', text: '10+ characters with letters and numbers. You will be signed out.', input: { label: 'New password', type: 'password' }, confirm: 'Change password', tone: 'red' });
    if (nx && (await run(() => api('/auth/password', { body: { current: cur.value, next: nx.value } }), 'Password changed'))) window.location.reload();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Admin team</h2>
          <div className="sub">Give each person only what they need</div>
        </div>
        <div className="right">
          <button className="btn b-ghost" onClick={myPassword}>
            Change my password
          </button>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>ADMIN</th>
                <th>ROLE</th>
                <th>LAST LOGIN</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map(a => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    <span className="dimtxt">{a.email}</span>
                  </td>
                  <td>
                    {a.id === me.id ? (
                      <Pill tone={TONE[a.role]}>{a.role}</Pill>
                    ) : (
                      <select className="select" value={a.role} onChange={e => change(a, { role: e.target.value as Role })}>
                        {ROLES.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{ago(a.lastLoginAt)}</td>
                  <td>{a.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="no">Removed</Pill>}</td>
                  <td>
                    {a.id !== me.id && (
                      <div className="acts end">
                        <button className="btn b-ghost" onClick={() => reset(a)}>
                          Reset password
                        </button>
                        {a.status === 'active' ? (
                          <button className="btn b-red" onClick={() => change(a, { status: 'disabled' })}>
                            Remove
                          </button>
                        ) : (
                          <button className="btn b-green" onClick={() => change(a, { status: 'active' })}>
                            Restore
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>Add admin</h4>
          <div className="g2" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0 }}>
            <input className="input" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <select className="select input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input className="input" placeholder="First password (10+ chars)" type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="acts end mt">
            <button className="btn b-rose" disabled={!form.name || !form.email || form.password.length < 10} onClick={invite}>
              Add admin
            </button>
          </div>
        </div>
        <div className="card">
          <h3>What each role can do</h3>
          <table>
            <thead>
              <tr>
                <th />
                {ROLES.map(r => (
                  <th key={r}>{r.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAN.map(([what, roles]) => (
                <tr key={what}>
                  <td>{what}</td>
                  {ROLES.map(r => (
                    <td key={r} className={roles.includes(r) ? 'green' : 'dimtxt'} style={{ display: 'table-cell' }}>
                      {roles.includes(r) ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

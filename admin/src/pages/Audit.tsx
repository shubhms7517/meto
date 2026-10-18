import { useState } from 'react';
import { Empty, Pill, useApi, when } from '../ui';

type Row = { id: number; at: string; admin: { name: string; role: string } | null; action: string; targetType: string | null; targetId: string | null; summary: string | null; before: unknown; after: unknown; ip: string | null };
const ROLE_TONE: Record<string, 'pend' | 'gray' | 'blue' | 'ok'> = { owner: 'pend', moderator: 'gray', support: 'blue', finance: 'ok' };

const short = (v: unknown) => {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  const e = Object.entries(v as Record<string, unknown>);
  return e.length === 1 ? String(Array.isArray(e[0]![1]) ? (e[0]![1] as unknown[]).join(', ') : e[0]![1]) : JSON.stringify(v);
};

export default function Audit() {
  const [days, setDays] = useState('7');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const { data } = useApi<{ items: Row[] }>(`/audit?days=${days}${action ? `&action=${action}` : ''}${target.trim() ? `&target=${encodeURIComponent(target.trim())}` : ''}`);

  return (
    <section>
      <div className="top">
        <div>
          <h2>Audit log</h2>
          <div className="sub">Every admin action · cannot be edited or deleted</div>
        </div>
      </div>
      <div className="filters">
        <select className="select" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All actions</option>
          <option value="host.">Host approve / reject / suspend</option>
          <option value="wallet.">Gems changes</option>
          <option value="withdrawal.">Withdrawals</option>
          <option value="report.">Reports</option>
          <option value="user.">Ban / VIP</option>
          <option value="setting.">Settings</option>
          <option value="gift.">Gifts</option>
          <option value="admin.">Admin logins / team</option>
        </select>
        <select className="select" value={days} onChange={e => setDays(e.target.value)}>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="365">Last year</option>
        </select>
        <input className="search" placeholder="Target · Meto ID / name" value={target} onChange={e => setTarget(e.target.value)} />
      </div>
      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>WHEN</th>
              <th>ADMIN</th>
              <th>ACTION</th>
              <th>DETAIL</th>
              <th>CHANGE</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(r => (
              <tr key={r.id}>
                <td className="nowrap">{when(r.at)}</td>
                <td className="nowrap">
                  {r.admin?.name ?? '—'} {r.admin && <Pill tone={ROLE_TONE[r.admin.role] ?? 'gray'}>{r.admin.role}</Pill>}
                </td>
                <td>
                  <span className="code">{r.action}</span>
                </td>
                <td>{r.summary ?? (r.targetId ? `${r.targetType} ${r.targetId}` : '—')}</td>
                <td className="diff">
                  {r.before != null || r.after != null ? (
                    <>
                      {r.before != null && <s>{short(r.before)}</s>}
                      {r.before != null && r.after != null && ' → '}
                      {r.after != null && <ins>{short(r.after)}</ins>}
                    </>
                  ) : (
                    ''
                  )}
                </td>
                <td className="dimtxt" style={{ display: 'table-cell' }}>
                  {r.ip}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <Empty>Nothing in this period</Empty>}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { api, download } from '../api';
import { ago, date, Empty, inr, Pill, Tabs, useApi, useDebounced, useAuth, useUi, Who, type UserCard } from '../ui';

type W = {
  id: number;
  user: UserCard | null;
  agency: string | null;
  requestedInr: number;
  tdsInr: number;
  netInr: number;
  upiId: string;
  upiName: string;
  pan: string | null;
  panName: string | null;
  status: string;
  utr: string | null;
  reason: string | null;
  at: string;
  paidAt: string | null;
  checks: string[];
};

const CHECK: Record<string, [string, 'no' | 'amb']> = {
  name_mismatch: ['⚠ UPI name ≠ PAN', 'no'],
  upi_shared: ['⚠ UPI used by other hosts', 'amb'],
  new_upi: ['new UPI', 'amb'],
};

export default function Withdrawals() {
  const { refreshPending } = useAuth();
  const { ask, run } = useUi();
  const [status, setStatus] = useState<'pending' | 'paid' | 'rejected'>('pending');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const list = useApi<{ items: W[]; totalInr: number }>(`/withdrawals?status=${status}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);

  const paid = async (w: W) => {
    const r = await ask({
      title: `Mark paid · ${w.user?.name} · ${inr(w.netInr)}`,
      text: `First send ${inr(w.netInr)} to ${w.upiId} (${w.upiName}) from your bank app. Then enter the UTR / reference number here.`,
      input: { label: 'UTR / reference number', placeholder: '12 digit UTR', check: v => (/^[A-Za-z0-9]{6,30}$/.test(v) ? null : '6–30 letters / digits, no spaces') },
      confirm: 'Confirm paid',
      tone: 'green',
    });
    if (r && (await run(() => api(`/withdrawals/${w.id}/paid`, { body: { utr: r.value.replace(/\s/g, '') } }), 'Marked paid · host notified'))) done();
  };
  const reject = async (w: W) => {
    const r = await ask({
      title: `Reject ${inr(w.netInr)} for ${w.user?.name}?`,
      text: 'Her points come back automatically.',
      input: { label: 'Reason (shown to host)', chips: ['UPI name does not match PAN', 'UPI ID is wrong', 'Suspicious activity — contact support'], multiline: true },
      confirm: 'Reject',
      tone: 'red',
    });
    if (r && (await run(() => api(`/withdrawals/${w.id}/reject`, { body: { reason: r.value } }), 'Rejected · points returned'))) done();
  };
  const done = () => {
    list.reload();
    refreshPending();
  };
  const exportCsv = async () => {
    const month = new Date().toISOString().slice(0, 7);
    await run(() => download(`/withdrawals/export?month=${month}`, `meto-payouts-${month}.csv`), 'Downloaded');
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Withdrawals</h2>
          <div className="sub">Pay from your bank app to the UPI below → enter the UTR → Mark paid</div>
        </div>
        <div className="right">
          <button className="btn b-ghost" onClick={exportCsv}>
            ⬇ This month (CSV for CA / TDS)
          </button>
          <input className="search" placeholder="🔍 Host / ID / UPI" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <Tabs
        value={status}
        onChange={setStatus}
        items={[
          ['pending', `Pending${status === 'pending' && list.data ? ` · ${list.data.items.length} · ${inr(list.data.totalInr)}` : ''}`],
          ['paid', 'Paid'],
          ['rejected', 'Rejected'],
        ]}
      />
      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>HOST</th>
              <th>REQUESTED</th>
              <th>TDS</th>
              <th>{status === 'pending' ? 'TO PAY' : 'NET'}</th>
              <th>UPI</th>
              <th>PAN</th>
              <th>{status === 'pending' ? 'CHECKS' : status === 'paid' ? 'UTR' : 'REASON'}</th>
              <th>WHEN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map(w => (
              <tr key={w.id}>
                <td>
                  <Who u={w.user} sub={w.agency ?? '—'} />
                </td>
                <td>{inr(w.requestedInr)}</td>
                <td>{inr(w.tdsInr)}</td>
                <td className="gold">
                  <b>{inr(w.netInr)}</b>
                </td>
                <td>
                  {w.upiId}
                  <span className="dimtxt">{w.upiName}</span>
                </td>
                <td>
                  {w.pan ?? '—'}
                  <span className="dimtxt">{w.panName}</span>
                </td>
                <td>
                  {status === 'pending' ? (
                    w.checks.length ? (
                      <div className="acts">
                        {w.checks.map(c => (
                          <Pill key={c} tone={CHECK[c]?.[1] ?? 'amb'}>
                            {CHECK[c]?.[0] ?? c}
                          </Pill>
                        ))}
                      </div>
                    ) : (
                      <Pill tone="ok">✓ ok</Pill>
                    )
                  ) : status === 'paid' ? (
                    <span className="code">{w.utr}</span>
                  ) : (
                    <span className="red">{w.reason}</span>
                  )}
                </td>
                <td className="nowrap">{status === 'paid' ? date(w.paidAt) : ago(w.at)}</td>
                <td>
                  {status === 'pending' && (
                    <div className="acts end">
                      <button className="btn b-red" onClick={() => reject(w)}>
                        Reject
                      </button>
                      <button className="btn b-green" onClick={() => paid(w)}>
                        Mark paid
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && !list.data.items.length && <Empty>No {status} withdrawals</Empty>}
      </div>
    </section>
  );
}

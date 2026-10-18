import { ago, date, Empty, Pill, useApi, useAuth, when, Who, type UserCard } from '../ui';
import { REASON } from './Reports';

type C = {
  grievances: { id: number; user: UserCard | null; receivedAt: string; acknowledgedAt: string | null; status: string; ackLate: boolean; ackDueAt: string; resolveDueAt: string; resolveLate: boolean }[];
  urgentReports: { id: number; reason: string; at: string; dueAt: string; late: boolean; reported: UserCard | null }[];
  deletions: { id: number; publicId: number; role: string; joinedAt: string | null; deletedAt: string; reason: string }[];
  counts: { grievancesOpen: number; ackLate: number; urgent: number; urgentLate: number; deletions30d: number };
};

export default function Compliance() {
  const { go } = useAuth();
  const { data: d } = useApi<C>('/compliance');

  return (
    <section>
      <div className="top">
        <div>
          <h2>Compliance</h2>
          <div className="sub">IT Rules 2021 (grievances 24 h / 15 days · nudity 24 h) · DPDP account deletions</div>
        </div>
      </div>
      {d && (
        <>
          <div className="kpis">
            <div className="kpi">
              <small>Grievances open</small>
              <b>{d.counts.grievancesOpen}</b>
              <em className={d.counts.ackLate ? 'bad' : ''}>{d.counts.ackLate ? `${d.counts.ackLate} not acknowledged in 24 h` : 'acknowledge ≤ 24 h · resolve ≤ 15 days'}</em>
            </div>
            <div className="kpi">
              <small>Nudity / under-18 reports</small>
              <b>{d.counts.urgent}</b>
              <em className={d.counts.urgentLate ? 'bad' : ''}>{d.counts.urgentLate ? `${d.counts.urgentLate} older than 24 h` : 'act ≤ 24 h'}</em>
            </div>
            <div className="kpi">
              <small>Accounts deleted (30 days)</small>
              <b>{d.counts.deletions30d}</b>
              <em>profile, photos &amp; chats removed</em>
            </div>
            <div className="kpi">
              <small>Grievance officer</small>
              <b style={{ fontSize: 15 }}>Show in Privacy policy</b>
              <em>name + email required by IT Rules</em>
            </div>
          </div>
          <div className="g2">
            <div className="card">
              <h3>
                Grievances · support tickets with topic “Report”
                <button className="link" onClick={() => go('support')}>
                  Open support →
                </button>
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>FROM</th>
                    <th>RECEIVED</th>
                    <th>ACKNOWLEDGED</th>
                    <th>RESOLVE BY</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {d.grievances.map(g => (
                    <tr key={g.id} className="click" onClick={() => go('support', String(g.id))}>
                      <td>
                        <Who u={g.user} sub={`#${g.id}`} />
                      </td>
                      <td className="nowrap">{when(g.receivedAt)}</td>
                      <td className={`nowrap${g.ackLate ? ' red' : ''}`}>{g.acknowledgedAt ? when(g.acknowledgedAt) : g.ackLate ? 'LATE' : `by ${when(g.ackDueAt)}`}</td>
                      <td className={`nowrap${g.resolveLate ? ' red' : ''}`}>{g.status === 'solved' ? '—' : date(g.resolveDueAt)}</td>
                      <td>{g.status === 'solved' ? <Pill tone="ok">Resolved</Pill> : g.ackLate || g.resolveLate ? <Pill tone="no">Late</Pill> : <Pill tone="pend">Open</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.grievances.length && <Empty>No grievances</Empty>}
            </div>
            <div className="card">
              <h3>
                Nudity / under-18 reports · 24 h
                <button className="link" onClick={() => go('reports')}>
                  Reports →
                </button>
              </h3>
              <table>
                <tbody>
                  {d.urgentReports.map(r => (
                    <tr key={r.id} className="click" onClick={() => go('reports', String(r.id))}>
                      <td>
                        <Who u={r.reported} />
                      </td>
                      <td>
                        <Pill tone="no">{REASON[r.reason] ?? r.reason}</Pill>
                      </td>
                      <td className={`r nowrap${r.late ? ' red' : ''}`}>{r.late ? `LATE · ${ago(r.at)}` : `due ${when(r.dueAt)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.urgentReports.length && <Empty>None open 🎉</Empty>}
            </div>
          </div>
          <div className="card mt">
            <h3>Deleted accounts (DPDP)</h3>
            <table>
              <thead>
                <tr>
                  <th>METO ID</th>
                  <th>ROLE</th>
                  <th>JOINED</th>
                  <th>DELETED</th>
                  <th>BY</th>
                </tr>
              </thead>
              <tbody>
                {d.deletions.map(x => (
                  <tr key={x.id}>
                    <td>{x.publicId}</td>
                    <td>{x.role}</td>
                    <td>{date(x.joinedAt)}</td>
                    <td>{when(x.deletedAt)}</td>
                    <td>{x.reason === 'self' ? 'User (in app)' : 'Admin'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.deletions.length && <Empty>No deleted accounts yet</Empty>}
            <div className="alert a-gold">Only this small record is kept. Profile, photos, videos and chats are removed when the user deletes the account. Payment records stay as required by tax law.</div>
          </div>
        </>
      )}
    </section>
  );
}

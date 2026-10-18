import { useState } from 'react';
import { inr, num, Tabs, useApi, useAuth, Who, type Pending, type UserCard } from '../ui';

type Dash = {
  recharge: { inr: number; count: number };
  paidToHostsInr: number;
  ownerEarningsInr: number;
  newUsers: number;
  newHosts: number;
  vipBought: number;
  online: { hosts: number; users: number };
  liveCalls: { count: number; avgSec: number };
  calls: { count: number; minutes: number; shortPct: number };
  pending: Pending;
  chart: { day: string; recharge: number; hosts: number }[];
  topHosts: { user: UserCard | null; agency: string | null; inr: number }[];
  topSpenders: { user: UserCard | null; inr: number }[];
};

const RANGE: Record<string, string> = { today: 'Today', '7d': '7 days', '30d': '30 days' };

export default function Dashboard() {
  const { go } = useAuth();
  const [range, setRange] = useState<'today' | '7d' | '30d'>('today');
  const { data: d, error } = useApi<Dash>(`/dashboard?range=${range}`);
  const max = Math.max(1, ...(d?.chart ?? []).flatMap(c => [c.recharge, c.hosts]));
  const avg = d ? `${Math.floor(d.liveCalls.avgSec / 60)}m ${d.liveCalls.avgSec % 60}s` : '';

  return (
    <section>
      <div className="top">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })} · live</div>
        </div>
        <div className="right">
          <Tabs value={range} onChange={setRange} items={Object.entries(RANGE) as ['today' | '7d' | '30d', string][]} />
        </div>
      </div>
      {error && <div className="alert a-red">{error}</div>}
      {d && (
        <>
          <div className="kpis">
            <div className="kpi gold">
              <small>Recharge</small>
              <b>{inr(d.recharge.inr)}</b>
              <em>{d.recharge.count} purchases</em>
            </div>
            <div className="kpi">
              <small>Paid to hosts</small>
              <b>{inr(d.paidToHostsInr)}</b>
              <em>{d.recharge.inr ? Math.round((d.paidToHostsInr / d.recharge.inr) * 100) : 0}% of recharge</em>
            </div>
            <div className="kpi">
              <small>Owner earnings</small>
              <b>{inr(d.ownerEarningsInr)}</b>
              <em className={d.ownerEarningsInr < 0 ? 'bad' : ''}>recharge − host payouts</em>
            </div>
            <div className="kpi">
              <small>New users · new hosts</small>
              <b>
                {num(d.newUsers)} · {num(d.newHosts)}
              </b>
              <em>VIP bought: {d.vipBought}</em>
            </div>
          </div>
          <div className="kpis">
            <div className="kpi">
              <small>
                <span className="dot" />
                Online now
              </small>
              <b>{num(d.online.hosts + d.online.users)}</b>
              <em>
                {d.online.hosts} hosts · {d.online.users} users
              </em>
            </div>
            <div className="kpi">
              <small>📞 Live calls now</small>
              <b>{d.liveCalls.count}</b>
              <em>{d.liveCalls.count ? `avg ${avg} so far` : 'no live calls'}</em>
            </div>
            <div className="kpi">
              <small>Calls ({RANGE[range]})</small>
              <b>{num(d.calls.count)}</b>
              <em>{num(d.calls.minutes)} min</em>
            </div>
            <div className="kpi">
              <small>Short calls (&lt;1 min, host ended)</small>
              <b>{d.calls.shortPct}%</b>
              <em className={d.calls.shortPct > 15 ? 'bad' : ''}>{d.calls.shortPct > 15 ? 'high · check hosts' : 'healthy'}</em>
            </div>
          </div>
          <div className="g2">
            <div className="card">
              <h3>
                Recharge vs paid to hosts · last {d.chart.length} days
                <button className="link" onClick={() => go('transactions')}>
                  Transactions →
                </button>
              </h3>
              <div className="chart">
                {d.chart.map(c => (
                  <div className="day" key={c.day} title={`${c.day} · recharge ${inr(c.recharge)} · hosts ${inr(c.hosts)}`}>
                    <i style={{ height: `${(c.recharge / max) * 100}%` }} />
                    <i className="g" style={{ height: `${(c.hosts / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="lg">
                <span>
                  <i style={{ background: 'var(--rose-1)' }} />
                  Recharge (₹)
                </span>
                <span>
                  <i style={{ background: 'var(--gold-1)' }} />
                  Paid to hosts (₹)
                </span>
              </div>
            </div>
            <div className="card">
              <h3>Needs your attention</h3>
              <div className="todo">
                <a onClick={() => go('applications')}>
                  🎙️ Host applications<b>{d.pending.applications}</b>
                </a>
                <a onClick={() => go('reports')}>
                  🚩 Reports{d.pending.reportsUrgent ? ` · ${d.pending.reportsUrgent} urgent` : ''}
                  <b className={d.pending.reportsUrgent ? 'late' : ''}>{d.pending.reports}</b>
                </a>
                <a onClick={() => go('withdrawals')}>
                  💸 Withdrawals to pay
                  <b>
                    {d.pending.withdrawals} · {inr(d.pending.withdrawalsInr)}
                  </b>
                </a>
                <a onClick={() => go('support')}>
                  🎧 Support{d.pending.supportLate ? ` · ${d.pending.supportLate} older than 24 h` : ''}
                  <b className={d.pending.supportLate ? 'late' : ''}>{d.pending.support}</b>
                </a>
              </div>
            </div>
          </div>
          <div className="g2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card">
              <h3>Top hosts</h3>
              <table>
                <tbody>
                  {d.topHosts.map((h, i) => (
                    <tr key={i} className="click" onClick={() => h.user && go('hosts', String(h.user.publicId))}>
                      <td>
                        <Who u={h.user} sub={h.agency ?? '—'} />
                      </td>
                      <td className="r gold">
                        <b>{inr(h.inr)}</b>
                      </td>
                    </tr>
                  ))}
                  {!d.topHosts.length && (
                    <tr>
                      <td className="dimtxt">No earnings yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Top spenders</h3>
              <table>
                <tbody>
                  {d.topSpenders.map((s, i) => (
                    <tr key={i} className="click" onClick={() => s.user && go('users', String(s.user.publicId))}>
                      <td>
                        <Who u={s.user} />
                      </td>
                      <td className="r">
                        <b>{inr(s.inr)}</b>
                      </td>
                    </tr>
                  ))}
                  {!d.topSpenders.length && (
                    <tr>
                      <td className="dimtxt">No recharges yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

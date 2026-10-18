import { useState } from 'react';
import { api } from '../api';
import { ago, Empty, Img, Pill, Tabs, useApi, useAuth, useUi, when, Who, type UserCard } from '../ui';

type Row = { id: number; reason: string; priority: 'urgent' | 'high' | 'normal'; details: string | null; at: string; reported: UserCard | null; reporter: UserCard | null; count: number };
type Detail = {
  report: { id: number; reason: string; priority: string; details: string | null; status: string; at: string };
  reported: (UserCard & { photos: { id: number; url: string }[] }) | null;
  reporter: UserCard | null;
  strikes: number;
  others: { id: number; reason: string; status: string; at: string }[];
  chat: { id: number; fromReported: boolean; type: string; body: string; at: string }[];
};

export const REASON: Record<string, string> = {
  fake_profile: 'Fake profile / photos',
  inappropriate_content: '🔞 Nudity / sexual',
  asking_money: 'Asked for money',
  harassment: 'Harassment / abuse',
  underage: 'Under 18',
  other: 'Other',
};

export default function Reports({ id }: { id?: string }) {
  const { go, refreshPending } = useAuth();
  const { ask, run, zoom } = useUi();
  const [status, setStatus] = useState<'open' | 'reviewed' | 'dismissed'>('open');
  const list = useApi<{ items: Row[] }>(`/reports?status=${status}`);
  const sel = id ?? (list.data?.items[0] ? String(list.data.items[0].id) : undefined);
  const detail = useApi<Detail>(sel ? `/reports/${sel}` : null);
  const d = detail.data;

  const act = async (action: 'dismiss' | 'warn' | 'suspend' | 'ban') => {
    const name = d?.reported?.name ?? 'user';
    const copy = {
      dismiss: { title: 'Ignore this report?', text: 'All open reports on this person will be closed.', confirm: 'Ignore', tone: 'rose' as const },
      warn: { title: `Warn ${name}?`, text: `They get a warning notice. Strike ${d!.strikes + 1}.`, confirm: 'Send warning', tone: 'gold' as const },
      suspend: { title: `Suspend ${name}?`, text: d?.reported?.role === 'host' ? 'Host is removed from Discover until you re-activate.' : 'User account is blocked.', confirm: 'Suspend', tone: 'red' as const },
      ban: { title: `Ban ${name}?`, text: 'They can no longer use Meto.', confirm: 'Ban', tone: 'red' as const },
    }[action];
    const r = await ask({ ...copy, input: action === 'warn' ? { label: 'Message to them (optional)', multiline: true, initial: 'We received reports about your behaviour. Repeated reports can get your account banned.' } : undefined });
    if (!r) return;
    if (await run(() => api(`/reports/${sel}/action`, { body: { action, note: r.value || undefined } }), 'Done')) {
      list.reload();
      detail.reload();
      refreshPending();
    }
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Reports</h2>
          <div className="sub">Act quickly — Google Play &amp; IT Rules · nudity / privacy within 24 h</div>
        </div>
      </div>
      <Tabs
        value={status}
        onChange={s => (setStatus(s), go('reports'))}
        items={[
          ['open', 'New'],
          ['reviewed', 'Action taken'],
          ['dismissed', 'Ignored'],
        ]}
      />
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>REPORTED</th>
                <th>REASON</th>
                <th>BY</th>
                <th>COUNT</th>
                <th>WHEN</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map(r => (
                <tr key={r.id} className={`click${String(r.id) === sel ? ' sel' : ''}`} onClick={() => go('reports', String(r.id))}>
                  <td>
                    <Who u={r.reported} sub={`${r.reported?.role ?? ''} · ${r.reported?.publicId ?? ''}`} />
                  </td>
                  <td>
                    <Pill tone={r.priority === 'urgent' ? 'no' : r.priority === 'high' ? 'amb' : 'gray'}>{REASON[r.reason] ?? r.reason}</Pill>
                  </td>
                  <td>{r.reporter?.name ?? '—'}</td>
                  <td className={r.count > 2 ? 'red' : ''}>
                    <b>{r.count}</b>
                  </td>
                  <td className={`nowrap${status === 'open' && r.priority === 'urgent' && Date.now() - new Date(r.at).getTime() > 12 * 3600_000 ? ' red' : ''}`}>{ago(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.items.length && <Empty>Nothing here 🎉</Empty>}
        </div>
        <div className="card sticky">
          {!d ? (
            <Empty>{sel ? 'Loading…' : 'Select a report'}</Empty>
          ) : (
            <>
              <h3>
                {d.reported?.name ?? 'Deleted user'} · strikes {d.strikes}/3
                <Pill tone={d.report.status === 'open' ? 'pend' : 'gray'}>{d.report.status}</Pill>
              </h3>
              <div className="kv">
                <span>Reason</span>
                <b>{REASON[d.report.reason] ?? d.report.reason}</b>
                <span>Reported by</span>
                <b>
                  {d.reporter?.name ?? '—'} · {when(d.report.at)}
                </b>
                {d.report.details && (
                  <>
                    <span>Note</span>
                    <b>“{d.report.details}”</b>
                  </>
                )}
                <span>Other reports</span>
                <b>{d.others.length ? d.others.map(o => REASON[o.reason] ?? o.reason).join(', ') : 'none'}</b>
              </div>
              {d.reported && (
                <div className="acts mt">
                  <button className="link" onClick={() => go(d.reported!.role === 'host' ? 'hosts' : 'users', String(d.reported!.publicId))}>
                    Open profile →
                  </button>
                </div>
              )}
              {!!d.reported?.photos.length && (
                <>
                  <h4>Their photos</h4>
                  <div className="media">
                    {d.reported.photos.slice(0, 6).map(p => (
                      <div className="m" key={p.id}>
                        <Img src={p.url} onClick={() => zoom(p.url)} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!!d.chat.length && (
                <>
                  <h4>Chat before the report</h4>
                  <div className="chat">
                    {d.chat.map(m => (
                      <div key={m.id} className={`msg ${m.fromReported ? 'u flag' : 't'}`} style={m.fromReported ? undefined : { background: '#3a2a30' }}>
                        {m.body}
                        <small>
                          {m.fromReported ? d.reported?.name : d.reporter?.name} · {when(m.at)}
                        </small>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {d.report.status === 'open' && (
                <div className="acts mt">
                  <button className="btn b-ghost" onClick={() => act('dismiss')}>
                    Ignore
                  </button>
                  <button className="btn b-amb" onClick={() => act('warn')}>
                    Warn
                  </button>
                  <button className="btn b-amb" onClick={() => act('suspend')}>
                    Suspend
                  </button>
                  <button className="btn b-red" onClick={() => act('ban')}>
                    Ban
                  </button>
                </div>
              )}
              <div className="alert a-blue">The reporter only hears “we took action” — never who or what.</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

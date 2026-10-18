import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ago, Empty, num, Pill, Tabs, useApi, useAuth, useUi, when, Who, type UserCard } from '../ui';

type T = { id: number; topic: string; status: string; lastMessageAt: string; waitingForTeam: boolean; late: boolean; user: UserCard | null; last: { body: string; fromTeam: boolean } | null };
type Thread = {
  ticket: { id: number; topic: string; status: string; createdAt: string };
  user: (UserCard & { gems: number }) | null;
  messages: { id: number; fromTeam: boolean; body: string | null; imageUrl: string | null; at: string }[];
};

const TOPIC: Record<string, string> = { recharge: '💎 Recharge', call: '📞 Call charge', withdraw: '💸 Withdraw', account: '👤 Account', report: '🚩 Report', other: '💬 Other' };
const TEMPLATES = [
  'We checked and refunded the gems to your wallet ✓',
  'We are checking this and will reply soon.',
  'Your payout was sent. UTR: ',
  'Call charges: each minute is charged when it starts. If the host ends the call, unused time comes back automatically.',
];

export default function Support({ id }: { id?: string }) {
  const { go, refreshPending, can } = useAuth();
  const { ask, run, zoom } = useUi();
  const [status, setStatus] = useState<'open' | 'solved' | 'all'>('open');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useApi<{ items: T[] }>(`/support?status=${status}`);
  const sel = id ?? (list.data?.items[0] ? String(list.data.items[0].id) : undefined);
  const th = useApi<Thread>(sel ? `/support/${sel}` : null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [th.data]);
  useEffect(() => setText(''), [sel]);

  const send = async (solve: boolean) => {
    setBusy(true);
    const ok = await run(() => api(`/support/${sel}/reply`, { body: { body: text, solve } }), solve ? 'Sent · solved' : 'Sent');
    setBusy(false);
    if (ok) {
      setText('');
      th.reload();
      list.reload();
      refreshPending();
    }
  };
  const solve = async () => {
    if (await run(() => api(`/support/${sel}/solve`, { method: 'POST' }), 'Marked solved')) {
      th.reload();
      list.reload();
      refreshPending();
    }
  };
  const refund = async () => {
    const u = th.data?.user;
    if (!u) return;
    const r = await ask({ title: `Refund gems to ${u.name}`, text: `Ticket #${sel}. Support can add up to 2,000 gems.`, input: { label: 'Gems', type: 'number', placeholder: '1000', check: v => (/^\d+$/.test(v) && +v >= 1 && +v <= 2000 ? null : 'Enter 1–2,000 gems') }, confirm: 'Refund', tone: 'gold' });
    if (!r) return;
    const amount = Math.round(Number(r.value));
    if (await run(() => api(`/users/${u.publicId}/gems`, { body: { amount, reason: `Refund · ticket #${sel}` } }), `+${num(amount)} gems refunded`)) th.reload();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Support</h2>
          <div className="sub">Replies reach the app instantly + push · aim: reply within 24 h</div>
        </div>
      </div>
      <Tabs
        value={status}
        onChange={s => (setStatus(s), go('support'))}
        items={[
          ['open', 'Open'],
          ['solved', 'Solved'],
          ['all', 'All'],
        ]}
      />
      <div className="split wide-left">
        <div className="card">
          <table>
            <tbody>
              {list.data?.items.map(t => (
                <tr key={t.id} className={`click${String(t.id) === sel ? ' sel' : ''}`} onClick={() => go('support', String(t.id))}>
                  <td>
                    <Who u={t.user} sub={`#${t.id} · ${TOPIC[t.topic] ?? t.topic} · ${ago(t.lastMessageAt)}`} />
                  </td>
                  <td className="r">{t.status === 'solved' ? <Pill tone="ok">Solved</Pill> : t.late ? <Pill tone="no">Late</Pill> : t.waitingForTeam ? <Pill tone="pend">Waiting</Pill> : <Pill tone="gray">Replied</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.items.length && <Empty>No tickets</Empty>}
        </div>
        <div className="card">
          {!th.data ? (
            <Empty>{sel ? 'Loading…' : 'Select a conversation'}</Empty>
          ) : (
            <>
              <h3>
                <span>
                  {th.data.user?.name ?? 'User'} · {TOPIC[th.data.ticket.topic]} · #{th.data.ticket.id}
                </span>
                <span className="acts">
                  {th.data.user && (
                    <>
                      <button className="link" onClick={() => go(th.data!.user!.role === 'host' ? 'hosts' : 'users', String(th.data!.user!.publicId))}>
                        Profile
                      </button>
                      <span className="dimtxt" style={{ display: 'inline' }}>
                        · {num(th.data.user.gems)} gems
                      </span>
                    </>
                  )}
                </span>
              </h3>
              <div className="chat" ref={box}>
                {th.data.messages.map(m => (
                  <div key={m.id} className={`msg ${m.fromTeam ? 't' : 'u'}`}>
                    {m.imageUrl && <img src={m.imageUrl} alt="" onClick={() => zoom(m.imageUrl!)} style={{ cursor: 'zoom-in' }} />}
                    {m.body}
                    <small>
                      {m.fromTeam ? 'Meto team' : th.data!.user?.name} · {when(m.at)}
                    </small>
                  </div>
                ))}
              </div>
              <div className="chips">
                {TEMPLATES.map(t => (
                  <button key={t} onClick={() => setText(t)}>
                    {t.length > 42 ? `${t.slice(0, 42)}…` : t}
                  </button>
                ))}
              </div>
              <textarea className="textarea" placeholder="Write a reply…" value={text} onChange={e => setText(e.target.value)} />
              <div className="acts mt">
                {can('support', 'finance') && th.data.user && (
                  <button className="btn b-ghost" onClick={refund}>
                    Refund gems…
                  </button>
                )}
                {th.data.ticket.status === 'open' && (
                  <button className="btn b-ghost ml-auto" onClick={solve}>
                    ✓ Mark solved
                  </button>
                )}
                <button className={`btn b-ghost${th.data.ticket.status === 'open' ? '' : ' ml-auto'}`} disabled={!text.trim() || busy} onClick={() => send(true)}>
                  Send &amp; solve
                </button>
                <button className="btn b-rose" disabled={!text.trim() || busy} onClick={() => send(false)}>
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

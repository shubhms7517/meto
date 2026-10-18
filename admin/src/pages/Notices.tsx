import { useState } from 'react';
import { api } from '../api';
import { ago, Tabs, useApi, useUi } from '../ui';

type Aud = 'everyone' | 'users' | 'hosts' | 'vip' | 'one';
type Log = { id: number; at: string; summary: string | null; targetType: string | null };

export default function Notices() {
  const { ask, run } = useUi();
  const [aud, setAud] = useState<Aud>('everyone');
  const [user, setUser] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const sent = useApi<{ items: Log[] }>('/audit?action=notice.send&days=90');

  const send = async () => {
    const ok = await ask({ title: 'Send this notice?', text: `“${title}” → ${aud === 'one' ? `Meto ID ${user}` : aud}. It shows as Official Notice + push notification.`, confirm: 'Send', tone: 'green' });
    if (!ok) return;
    const r = await run(() => api<{ sent: number }>('/notices', { body: { audience: aud, user: aud === 'one' ? Number(user) : undefined, title, body } }));
    if (r) {
      setTitle('');
      setBody('');
      sent.reload();
      await ask({ title: `Sent to ${r.sent} people ✓`, confirm: 'OK' });
    }
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Notices &amp; push</h2>
          <div className="sub">Shows as “Official Notice” in the app + a push notification</div>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <h3>New notice</h3>
          <Tabs
            value={aud}
            onChange={setAud}
            items={[
              ['everyone', 'Everyone'],
              ['users', 'Users'],
              ['hosts', 'Hosts'],
              ['vip', 'VIP'],
              ['one', 'One person'],
            ]}
          />
          {aud === 'one' && <input className="input" placeholder="Meto ID (e.g. 448708254)" value={user} onChange={e => setUser(e.target.value.replace(/\D/g, ''))} />}
          <input className="input" placeholder="Title · e.g. Diwali bonus 🎉" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className="textarea" placeholder="Message…" maxLength={500} value={body} onChange={e => setBody(e.target.value)} />
          <div className="acts end mt">
            <button className="btn b-rose" disabled={title.trim().length < 2 || body.trim().length < 2 || (aud === 'one' && user.length < 6)} onClick={send}>
              Send
            </button>
          </div>
        </div>
        <div className="card">
          <h3>Sent (90 days)</h3>
          <table>
            <tbody>
              {sent.data?.items.map(s => (
                <tr key={s.id}>
                  <td>
                    {s.summary}
                    <span className="dimtxt">{s.targetType}</span>
                  </td>
                  <td className="r nowrap">{ago(s.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

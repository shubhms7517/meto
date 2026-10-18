import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Empty, num, Pill, Tabs, useAuth, useDebounced, when, Who, type UserCard } from '../ui';

type Tx = { id: number; kind: string; amount: number; title: string; subtitle: string | null; meta: Record<string, unknown> | null; at: string; user: UserCard | null };
const TONE: Record<string, 'pend' | 'blue' | 'gray' | 'ok' | 'amb' | 'no'> = { recharge: 'pend', call: 'blue', gift: 'gray', refund: 'ok', admin: 'amb', message: 'gray', unlock: 'gray', bonus: 'ok', checkin: 'ok' };

export default function Transactions() {
  const { go } = useAuth();
  const [kind, setKind] = useState('all');
  const [user, setUser] = useState('');
  const [items, setItems] = useState<Tx[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const du = useDebounced(user.trim());
  const badId = du !== '' && !/^\d{6,12}$/.test(du);

  const load = async (before?: number) => {
    if (badId) return;
    const my = ++seq.current;
    const qs = new URLSearchParams({ kind });
    if (du) qs.set('user', du);
    if (before) qs.set('before', String(before));
    try {
      const r = await api<{ items: Tx[]; nextBefore: number | null }>(`/transactions?${qs}`);
      if (my !== seq.current) return; // purana jawab — naya filter aa chuka
      setItems(i => (before ? [...(i ?? []), ...r.items] : r.items));
      setNext(r.nextBefore);
      setError('');
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    setItems(null);
    setNext(null);
    load();
  }, [kind, du]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <div className="top">
        <div>
          <h2>Transactions</h2>
          <div className="sub">Every gem movement · newest first</div>
        </div>
        <div className="right">
          <input className="search" placeholder="🔍 Meto ID of a user" value={user} onChange={e => setUser(e.target.value)} />
        </div>
      </div>
      <Tabs
        value={kind}
        onChange={setKind}
        items={[
          ['all', 'All'],
          ['recharge', 'Recharges'],
          ['call', 'Calls'],
          ['gift', 'Gifts'],
          ['message', 'Messages'],
          ['unlock', 'Unlocks'],
          ['refund', 'Refunds'],
          ['admin', 'Admin changes'],
        ]}
      />
      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>WHEN</th>
              <th>TYPE</th>
              <th>USER</th>
              <th>DETAIL</th>
              <th className="r">GEMS</th>
            </tr>
          </thead>
          <tbody>
            {!badId && items?.map(t => (
              <tr key={t.id} className="click" onClick={() => t.user && go(t.user.role === 'host' ? 'hosts' : 'users', String(t.user.publicId))}>
                <td className="nowrap">{when(t.at)}</td>
                <td>
                  <Pill tone={TONE[t.kind] ?? 'gray'}>{t.kind}</Pill>
                </td>
                <td>
                  <Who u={t.user} />
                </td>
                <td>
                  {t.title}
                  <span className="dimtxt">
                    {t.subtitle}
                    {t.meta?.priceInr ? ` · ₹${t.meta.priceInr}` : ''}
                    {t.meta?.orderId ? ` · ${t.meta.orderId}` : ''}
                    {t.meta?.by ? ` · by ${t.meta.by}` : ''}
                  </span>
                </td>
                <td className={`r${t.amount > 0 ? ' green' : ''}`}>
                  <b>
                    {t.amount > 0 ? '+' : ''}
                    {num(t.amount)}
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {badId && <Empty>Enter the full Meto ID (6–12 digits)</Empty>}
        {!badId && error && <div className="alert a-red">{error}</div>}
        {!badId && !error && items && !items.length && <Empty>{du ? 'No transactions for this Meto ID' : 'No transactions'}</Empty>}
        {next && !badId && (
          <div className="acts end mt">
            <button className="btn b-ghost" onClick={() => load(next)}>
              Load more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

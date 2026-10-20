import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar, date, Empty, inr, num, Pill, Tabs, useApi, useAuth, useUi, Who, type UserCard } from '../ui';

type Agency = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  commissionPct: number;
  status: 'active' | 'disabled';
  hosts: number;
  earningsInr: number;
  earnedInr: number;
  paidInr: number;
  owedInr: number;
  lastLoginAt: string | null;
};
type Data = { items: Agency[]; totals: { agencies: number; active: number; hosts: number; earnedInr: number; paidInr: number; payouts: number; owedInr: number } };
type Payout = { id: number; amountInr: number; method: string; reference: string | null; note: string | null; at: string; by: string | null };
const METHOD: Record<string, string> = { upi: 'UPI', bank: 'Bank', cash: 'Cash' };

// Naya / edit agency — modal (owner password se confirm)
function AgencyEditor({ agency, onClose, onSaved }: { agency: Agency | null; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [name, setName] = useState(agency?.name ?? '');
  const [code, setCode] = useState(agency?.code ?? '');
  const [email, setEmail] = useState(agency?.email ?? '');
  const [pct, setPct] = useState(String(agency?.commissionPct ?? 10));
  const [status, setStatus] = useState<'active' | 'disabled'>(agency?.status ?? 'active');
  const [password, setPassword] = useState('');
  const [myPassword, setMyPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = !!agency;
  // Purani agency jiska login abhi nahi bana (jaise seed wali) — email ke saath password bhi chahiye
  const firstLogin = !editing || !agency!.email;
  const emailChanged = editing && email.trim().toLowerCase() !== (agency!.email ?? '');

  // Naye agency ka invite code apne aap (badal bhi sakte ho)
  useEffect(() => {
    if (editing) return;
    api<{ code: string }>('/agencies/next-code')
      .then(r => setCode(c => c || r.code))
      .catch(() => {});
  }, [editing]);

  // Kya bharna baaki hai
  const miss: string[] = [];
  if (name.trim().length < 2) miss.push('name');
  if (!editing && !/^[A-Za-z0-9]{2,20}$/.test(code.trim())) miss.push('code');
  if ((firstLogin || emailChanged) && !/^\S+@\S+\.\S+$/.test(email.trim())) miss.push('email');
  if (!(Number(pct) >= 0 && Number(pct) <= 50)) miss.push('commission 0–50%');
  if (firstLogin && password.length < 10) miss.push('password (10+)');
  if (!myPassword) miss.push('your password');

  const save = async () => {
    setBusy(true);
    const body = editing
      ? { name: name.trim(), commissionPct: Number(pct), ...(status !== agency!.status ? { status } : {}), ...(emailChanged ? { email: email.trim() } : {}), ...(password ? { password } : {}), myPassword }
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
            Login email *
            <input className="input" type="email" value={email} placeholder="agency@email.com" onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="lbl">
            Commission % *
            <input className="input" type="number" min={0} max={50} value={pct} onChange={e => setPct(e.target.value)} />
          </label>
          <label className="lbl" style={{ gridColumn: '1 / 3' }}>
            {firstLogin ? 'First password (10+ chars) *' : 'New password (leave blank to keep)'}
            <input className="input" type="password" value={password} placeholder={firstLogin ? '10+ letters and numbers' : '••••••••••'} onChange={e => setPassword(e.target.value)} />
          </label>
        </div>
        {editing && (
          <div className="lbl mt">
            Status
            <div className="pill-chips">
              <button type="button" className={status === 'active' ? 'on' : ''} onClick={() => setStatus('active')}>
                Active
              </button>
              <button type="button" className={status === 'disabled' ? 'on' : ''} onClick={() => setStatus('disabled')}>
                Paused
              </button>
            </div>
            {status === 'disabled' && agency!.status === 'active' && <span className="dimtxt">Their invite link stops working and they can’t log in.</span>}
          </div>
        )}
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

// Commission payout record karo (paise owner apne bank / UPI se bhejta hai)
function PayDialog({ agency, onClose, onSaved }: { agency: Agency; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [amount, setAmount] = useState(String(agency.owedInr));
  const [method, setMethod] = useState<'upi' | 'bank' | 'cash'>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [myPassword, setMyPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const amt = Math.round(Number(amount));
  const miss: string[] = [];
  if (!(amt >= 1)) miss.push('amount');
  else if (amt > agency.owedInr) miss.push(`amount up to ${inr(agency.owedInr)}`);
  if (method !== 'cash' && !/^[A-Za-z0-9]{6,40}$/.test(reference.trim())) miss.push('UTR / reference');
  if (method === 'cash' && note.trim().length < 3) miss.push('a note');
  if (!myPassword) miss.push('your password');
  const save = async () => {
    setBusy(true);
    const ok = await run(
      () => api(`/agencies/${agency.id}/payouts`, { body: { amountInr: amt, method, reference: method === 'cash' ? undefined : reference.trim(), note: note.trim() || undefined, myPassword } }),
      'Payout recorded',
    );
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 460 }}>
        <h3>Pay {agency.name}</h3>
        <p>First send the money from your bank app, then record it here.</p>
        <div className="g2" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 10 }}>
          <div className="kpi">
            <small>Earned</small>
            <b className="gold" style={{ fontSize: 16 }}>
              {inr(agency.earnedInr)}
            </b>
          </div>
          <div className="kpi">
            <small>Paid</small>
            <b className="green" style={{ fontSize: 16 }}>
              {inr(agency.paidInr)}
            </b>
          </div>
          <div className="kpi">
            <small>Owed</small>
            <b className="amber" style={{ fontSize: 16 }}>
              {inr(agency.owedInr)}
            </b>
          </div>
        </div>
        <label className="lbl mt">
          Amount (₹) *
          <input className="input" type="number" min={1} max={agency.owedInr} value={amount} onChange={e => setAmount(e.target.value)} />
        </label>
        <div className="lbl mt">
          Paid by *
          <div className="pill-chips">
            {(
              [
                ['upi', 'UPI'],
                ['bank', 'Bank transfer'],
                ['cash', 'Cash'],
              ] as const
            ).map(([k, label]) => (
              <button type="button" key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {method !== 'cash' && (
          <label className="lbl">
            UTR / reference *
            <input className="input" value={reference} placeholder="e.g. 412398765432" onChange={e => setReference(e.target.value)} maxLength={40} />
          </label>
        )}
        <label className="lbl">
          Note {method === 'cash' ? '*' : '(optional)'}
          <input className="input" value={note} placeholder="e.g. October commission" onChange={e => setNote(e.target.value)} maxLength={200} />
        </label>
        <label className="lbl">
          Your password (to confirm) *
          <input className="input" type="password" value={myPassword} onChange={e => setMyPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <div className="acts end mt">
          {miss.length > 0 && (
            <span className="red ml-auto" style={{ fontSize: 12 }}>
              Enter {miss.slice(0, 2).join(' and ')}
            </span>
          )}
          <button className="btn b-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn b-gold" disabled={busy || miss.length > 0} onClick={save}>
            {busy ? 'Saving…' : `Record payout ${amt >= 1 ? inr(amt) : ''}`}
          </button>
        </div>
        <div className="dimtxt mt">Can’t be more than owed. Every payout is saved in the audit log and can’t be deleted.</div>
      </div>
    </div>
  );
}

function PayoutsTable({ agencyId }: { agencyId: number }) {
  const h = useApi<{ items: Payout[] }>(`/agencies/${agencyId}/payouts`);
  return (
    <div className="card mt">
      <table>
        <thead>
          <tr>
            <th>DATE</th>
            <th className="r">AMOUNT</th>
            <th>METHOD</th>
            <th>UTR / REF</th>
            <th>NOTE</th>
            <th>BY</th>
          </tr>
        </thead>
        <tbody>
          {h.data?.items.map(x => (
            <tr key={x.id}>
              <td className="nowrap">{date(x.at)}</td>
              <td className="r green">{inr(x.amountInr)}</td>
              <td>{METHOD[x.method] ?? x.method}</td>
              <td className="dimtxt">{x.reference ?? '—'}</td>
              <td>{x.note ?? '—'}</td>
              <td>{x.by ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {h.data && !h.data.items.length && <Empty>No payouts yet</Empty>}
    </div>
  );
}

type Detail = {
  agency: { id: number; code: string; name: string; email: string | null; commissionPct: number; status: 'active' | 'disabled'; createdAt: string };
  counts: { signedUp: number; approved: number; pending: number; rejected: number };
  earningsInr: number;
  earnedInr: number;
  paidInr: number;
  owedInr: number;
  hosts: { user: UserCard | null; status: string; joinedAt: string; calls: number | null; earningsInr: number | null; commissionInr: number | null }[];
  signedUp: { user: UserCard; signedUpAt: string; form: string }[];
};
type DTab = 'hosts' | 'signed' | 'payouts';

const HostStatus = ({ s }: { s: string }) =>
  s === 'approved' ? <Pill tone="ok">Approved</Pill> : s === 'suspended' ? <Pill tone="no">Suspended</Pill> : s === 'pending' ? <Pill tone="pend">Pending</Pill> : <Pill tone="no">Rejected</Pill>;
const FORM: Record<string, [string, 'ok' | 'pend' | 'no' | 'gray']> = {
  approved: ['Approved host', 'ok'],
  pending: ['Pending', 'pend'],
  rejected: ['Rejected', 'no'],
  not_applied: ['Not applied yet', 'gray'],
  not_allowed: ['Not allowed (men can’t host)', 'gray'],
};

// Agency ka poora hisaab — kaun aaya, kaun host bana, har host se kitna commission
function AgencyDetail({ aid, initialTab }: { aid: number; initialTab: DTab }) {
  const { go } = useAuth();
  const d = useApi<Detail>(`/agencies/${aid}/detail`);
  const [tab, setTab] = useState<DTab>(initialTab);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const x = d.data;
  // Edit / Pay dialog ko list wala shape chahiye
  const asRow: Agency | null = x
    ? { ...x.agency, hosts: x.counts.approved, earningsInr: x.earningsInr, earnedInr: x.earnedInr, paidInr: x.paidInr, owedInr: x.owedInr, lastLoginAt: null }
    : null;
  const approvedHosts = x?.hosts.filter(h => h.earningsInr !== null) ?? [];
  const open = (u: UserCard | null) => u && go(u.role === 'host' ? 'hosts' : 'users', String(u.publicId));

  return (
    <section className="agencies-page">
      <button className="link" onClick={() => go('agencies')}>
        ← Agencies
      </button>
      {d.error && <div className="alert a-red">{d.error}</div>}
      {x && (
        <>
          <div className="top" style={{ marginTop: 10 }}>
            <div className="who" style={{ gap: 14 }}>
              <Avatar u={{ name: x.agency.name, avatarUrl: null }} size={44} />
              <span>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {x.agency.name} {x.agency.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="no">Paused</Pill>}
                </h2>
                <small>
                  {x.agency.code} · {x.agency.email ?? 'no login'} · {x.agency.commissionPct}% commission · since {date(x.agency.createdAt)}
                </small>
              </span>
            </div>
            <div className="right acts">
              <button className="btn b-ghost" onClick={() => setEdit(true)}>
                Edit
              </button>
              <button className="btn b-gold" disabled={x.owedInr < 1} onClick={() => setPay(true)}>
                Pay {inr(x.owedInr)}
              </button>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <small>Signed up via link</small>
              <b>{num(x.counts.signedUp)}</b>
              <em>opened the app with their link</em>
            </div>
            <div className="kpi">
              <small>Hosts</small>
              <b className="green">{num(x.counts.approved)}</b>
              <em>
                approved · {x.counts.pending} pending · {x.counts.rejected} rejected
              </em>
            </div>
            <div className="kpi gold">
              <small>Host earnings · since joining</small>
              <b>{inr(x.earningsInr)}</b>
              <em>what their hosts earned</em>
            </div>
            <div className="kpi">
              <small>Commission</small>
              <b className="amber">{inr(x.owedInr)} owed</b>
              <em>
                earned {inr(x.earnedInr)} · paid {inr(x.paidInr)}
              </em>
            </div>
          </div>

          <div className="mt">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                ['hosts', `Hosts · ${x.hosts.length}`],
                ['signed', `Signed up via link · ${x.counts.signedUp}`],
                ['payouts', 'Payouts'],
              ]}
            />
          </div>

          {tab === 'hosts' && (
            <div className="card mt">
              <table>
                <thead>
                  <tr>
                    <th>HOST</th>
                    <th>STATUS</th>
                    <th>JOINED</th>
                    <th className="r">CALLS</th>
                    <th className="r">EARNED</th>
                    <th className="r">COMMISSION ({x.agency.commissionPct}%)</th>
                  </tr>
                </thead>
                <tbody>
                  {x.hosts.map((h, i) => (
                    <tr key={i} className="click" onClick={() => open(h.user)}>
                      <td>
                        <Who u={h.user} />
                      </td>
                      <td>
                        <HostStatus s={h.status} />
                      </td>
                      <td className="nowrap">{date(h.joinedAt)}</td>
                      <td className="r">{h.calls === null ? '—' : num(h.calls)}</td>
                      <td className="r gold">{h.earningsInr === null ? '—' : inr(h.earningsInr)}</td>
                      <td className="r amber">{h.commissionInr === null ? '—' : inr(h.commissionInr)}</td>
                    </tr>
                  ))}
                  {approvedHosts.length > 0 && (
                    <tr>
                      <td colSpan={3}>
                        <b>
                          Total ({approvedHosts.length} approved host{approvedHosts.length === 1 ? '' : 's'})
                        </b>
                      </td>
                      <td className="r">
                        <b>{num(approvedHosts.reduce((n, h) => n + (h.calls ?? 0), 0))}</b>
                      </td>
                      <td className="r gold">
                        <b>{inr(x.earningsInr)}</b>
                      </td>
                      <td className="r amber">
                        <b>{inr(approvedHosts.reduce((n, h) => n + (h.commissionInr ?? 0), 0))}</b>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {!x.hosts.length && <Empty>No hosts from this agency yet</Empty>}
            </div>
          )}
          {tab === 'hosts' && x.hosts.length > 0 && (
            <div className="alert a-blue">Earned = what the host made since this agency was added. Commission = Earned × agency %. The total matches “Earned” in the Agencies list.</div>
          )}

          {tab === 'signed' && (
            <div className="card mt">
              <table>
                <thead>
                  <tr>
                    <th>PERSON</th>
                    <th>SIGNED UP</th>
                    <th>GENDER</th>
                    <th>HOST FORM</th>
                  </tr>
                </thead>
                <tbody>
                  {x.signedUp.map((p, i) => {
                    const [label, tone] = FORM[p.form] ?? [p.form, 'gray'];
                    return (
                      <tr key={i} className="click" onClick={() => open(p.user)}>
                        <td>
                          <Who u={p.user} />
                        </td>
                        <td className="nowrap">{date(p.signedUpAt)}</td>
                        <td>{p.user.gender === 'female' ? 'Female' : p.user.gender === 'male' ? 'Male' : '—'}</td>
                        <td>
                          <Pill tone={tone}>{label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!x.signedUp.length && <Empty>Nobody has signed up with this agency’s link yet</Empty>}
            </div>
          )}

          {tab === 'payouts' && <PayoutsTable agencyId={x.agency.id} />}
        </>
      )}

      {edit && asRow && <AgencyEditor agency={asRow} onClose={() => setEdit(false)} onSaved={() => (setEdit(false), d.reload())} />}
      {pay && asRow && <PayDialog agency={asRow} onClose={() => setPay(false)} onSaved={() => (setPay(false), d.reload())} />}
    </section>
  );
}

export default function Agencies({ id }: { id?: string }) {
  const { go } = useAuth();
  const list = useApi<Data>(id ? null : '/agencies');
  const [edit, setEdit] = useState<'new' | null>(null);
  const [pay, setPay] = useState<Agency | null>(null);
  const t = list.data?.totals;

  // #/agencies/4 = detail · #/agencies/4-payouts = seedha payouts tab
  if (id) {
    const [n, tab] = id.split('-');
    return <AgencyDetail key={id} aid={Number(n)} initialTab={tab === 'payouts' ? 'payouts' : tab === 'signed' ? 'signed' : 'hosts'} />;
  }

  return (
    <section className="agencies-page">
      <div className="top">
        <div>
          <h2>Agencies</h2>
          <div className="sub">Partners who bring hosts · commission is paid by you, outside the app</div>
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
          <em>{t ? `${t.active} active · ${num(t.hosts)} host${t.hosts === 1 ? '' : 's'}` : ''}</em>
        </div>
        <div className="kpi gold">
          <small>Commission earned · all time</small>
          <b>{t ? inr(t.earnedInr) : '—'}</b>
          <em>at each agency’s %</em>
        </div>
        <div className="kpi">
          <small>Paid to agencies</small>
          <b className="green">{t ? inr(t.paidInr) : '—'}</b>
          <em>{t ? `${num(t.payouts)} payout${t.payouts === 1 ? '' : 's'}` : ''}</em>
        </div>
        <div className="kpi">
          <small>Owed now</small>
          <b className="amber">{t ? inr(t.owedInr) : '—'}</b>
          <em>still to pay</em>
        </div>
      </div>

      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>AGENCY</th>
              <th>HOSTS</th>
              <th>%</th>
              <th className="r">EARNED</th>
              <th className="r">PAID</th>
              <th className="r">OWED</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="who ag-name" title="Open agency" onClick={() => go('agencies', String(a.id))}>
                    <Avatar u={{ name: a.name, avatarUrl: null }} />
                    <span>
                      <span className="nm">{a.name}</span>
                      <small>
                        {a.email ?? 'no login'} · {a.code}
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  <button className="link" onClick={() => go('agencies', String(a.id))}>
                    {num(a.hosts)}
                  </button>
                </td>
                <td>{a.commissionPct}%</td>
                <td className="r gold">{inr(a.earnedInr)}</td>
                <td className="r green">{inr(a.paidInr)}</td>
                <td className="r amber">
                  <b>{inr(a.owedInr)}</b>
                </td>
                <td>{a.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="no">Paused</Pill>}</td>
                <td className="r nowrap">
                  <button className="btn b-gold sm" disabled={a.owedInr < 1} onClick={() => setPay(a)}>
                    Pay
                  </button>
                  <button className="btn b-ghost sm" onClick={() => go('agencies', `${a.id}-payouts`)} style={{ marginLeft: 6 }}>
                    History
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && !list.data.items.length && <Empty>No agencies yet — add one to start recruiting hosts</Empty>}
      </div>

      {edit && <AgencyEditor agency={null} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), list.reload())} />}
      {pay && <PayDialog agency={pay} onClose={() => setPay(null)} onSaved={() => (setPay(null), list.reload())} />}
    </section>
  );
}

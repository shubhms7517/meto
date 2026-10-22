import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar, date, Empty, num, Pill, Tabs, useApi, useAuth, useUi, Who, type UserCard } from '../ui';

type Agency = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  commissionPct: number;
  gemsPerBean: number;
  status: 'active' | 'disabled';
  hosts: number;
  hostGems: number; // agency banne ke baad se hosts ke gems
  commissionBeans: number;
  gemBalance: number; // users ko bhejne ke liye stock
  gemsAdded: number;
  gemsSent: number;
  usersSent: number;
  lastLoginAt: string | null;
};
type Data = { items: Agency[]; totals: { agencies: number; active: number; hosts: number; gemsAdded: number; gemsSent: number; commissionBeans: number } };
type GemRow = { id: number; kind: 'admin_add' | 'send'; gems: number; balanceAfter: number; user: UserCard | null; by: string | null; at: string };

const Gems = ({ n, sign }: { n: number; sign?: boolean }) => (
  <span className="gem">
    {sign && n > 0 ? '+' : ''}
    {num(n)}
  </span>
);
const Beans = ({ n }: { n: number }) => <span className="bean">{num(n)}</span>;

// Naya / edit agency — modal (owner password se confirm)
function AgencyEditor({ agency, onClose, onSaved }: { agency: Agency | null; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [name, setName] = useState(agency?.name ?? '');
  const [code, setCode] = useState(agency?.code ?? '');
  const [email, setEmail] = useState(agency?.email ?? '');
  const [pct, setPct] = useState(String(agency?.commissionPct ?? 10));
  const [gpb, setGpb] = useState(String(agency?.gemsPerBean ?? 10));
  const [status, setStatus] = useState<'active' | 'disabled'>(agency?.status ?? 'active');
  const [password, setPassword] = useState('');
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
  if (!(Number.isInteger(Number(gpb)) && Number(gpb) >= 1)) miss.push('bean rate (1 or more)');
  if (firstLogin && password.length < 10) miss.push('password (10+)');

  const save = async () => {
    setBusy(true);
    const common = { name: name.trim(), commissionPct: Number(pct), gemsPerBean: Number(gpb) };
    const body = editing
      ? { ...common, ...(status !== agency!.status ? { status } : {}), ...(emailChanged ? { email: email.trim() } : {}), ...(password ? { password } : {}) }
      : { ...common, code: code.trim().toUpperCase(), email: email.trim(), password };
    const ok = await run(() => api(editing ? `/agencies/${agency!.id}` : '/agencies', { method: editing ? 'PATCH' : 'POST', body }), editing ? 'Agency saved' : 'Agency created');
    setBusy(false);
    if (ok) onSaved();
  };

  const exGems = 100_000;
  const exBeans = Math.floor(Math.floor((exGems * Number(pct)) / 100) / Math.max(1, Number(gpb) || 1));

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500 }}>
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
          <label className="lbl" style={{ gridColumn: '1 / 3' }}>
            Login email *
            <input className="input" type="email" value={email} placeholder="agency@email.com" onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="lbl">
            Commission % *
            <input className="input" type="number" min={0} max={50} value={pct} onChange={e => setPct(e.target.value)} />
          </label>
          <label className="lbl">
            1 bean = how many gems *
            <input className="input" type="number" min={1} value={gpb} onChange={e => setGpb(e.target.value)} />
          </label>
        </div>
        {miss.every(m => !m.startsWith('commission') && !m.startsWith('bean')) && (
          <div className="note-blue mt">
            Example: their hosts earn {num(exGems)} gems → commission {pct}% → <b>{num(exBeans)} beans</b>. The agency sees only beans — not the % or this rate.
          </div>
        )}
        <label className="lbl mt">
          {firstLogin ? 'Agency’s first password (10+ chars) *' : 'Agency’s new password (leave blank to keep)'}
          <input className="input" type="password" autoComplete="new-password" value={password} placeholder={firstLogin ? '10+ letters and numbers' : '••••••••••'} onChange={e => setPassword(e.target.value)} />
        </label>
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

// Agency ke stock me gems (paisa owner app ke bahar leta hai)
function AddGemsDialog({ agency, onClose, onSaved }: { agency: { id: number; name: string; gemBalance: number }; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [gems, setGems] = useState('');
  const [busy, setBusy] = useState(false);
  const g = Math.round(Number(gems));
  const miss: string[] = [];
  if (!(g >= 1 && g <= 100_000_000)) miss.push('gems');
  const save = async () => {
    setBusy(true);
    const ok = await run(() => api(`/agencies/${agency.id}/gems`, { body: { gems: g } }), 'Gems added');
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <h3>Add gems · {agency.name}</h3>
        <p>Take the money from the agency first (outside the app), then add the gems here.</p>
        <div className="kpi mt">
          <small>Gems stock now</small>
          <b style={{ fontSize: 18 }}>
            <Gems n={agency.gemBalance} />
          </b>
        </div>
        <label className="lbl mt">
          Gems to add *
          <input className="input" type="number" min={1} value={gems} placeholder="e.g. 500000" onChange={e => setGems(e.target.value)} autoFocus />
        </label>
        <div className="pill-chips">
          {[100_000, 500_000, 1_000_000].map(v => (
            <button type="button" key={v} className={g === v ? 'on' : ''} onClick={() => setGems(String(v))}>
              {num(v)}
            </button>
          ))}
        </div>
        <div className="acts end mt">
          {miss.length > 0 && <span className="red ml-auto" style={{ fontSize: 12 }}>Enter {miss.join(' and ')}</span>}
          <button className="btn b-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn b-gold" disabled={busy || miss.length > 0} onClick={save}>
            {busy ? 'Adding…' : `Add ${g >= 1 ? num(g) : ''} gems`}
          </button>
        </div>
        <div className="dimtxt mt">Stock after: {num(agency.gemBalance + (g >= 1 ? g : 0))} gems · saved in the audit log.</div>
      </div>
    </div>
  );
}

// Gems ka hisaab: admin ne diye / agency ne users ko bheje
function GemsTable({ agencyId }: { agencyId: number }) {
  const { go } = useAuth();
  const h = useApi<{ items: GemRow[] }>(`/agencies/${agencyId}/gems`);
  return (
    <div className="card mt">
      <table>
        <thead>
          <tr>
            <th>DATE</th>
            <th>WHAT</th>
            <th className="r">GEMS</th>
            <th className="r">STOCK AFTER</th>
          </tr>
        </thead>
        <tbody>
          {h.data?.items.map(x => (
            <tr key={x.id} className={x.user ? 'click' : ''} onClick={() => x.user && go('users', String(x.user.publicId))}>
              <td className="nowrap">{date(x.at)}</td>
              <td>{x.kind === 'admin_add' ? <span>Added by {x.by ?? 'admin'}</span> : <Who u={x.user} sub={x.user ? `sent to ID ${x.user.publicId}` : undefined} />}</td>
              <td className={`r ${x.gems > 0 ? 'green' : ''}`}>
                <Gems n={x.gems} sign />
              </td>
              <td className="r dimtxt">{num(x.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {h.data && !h.data.items.length && <Empty>No gems added or sent yet</Empty>}
    </div>
  );
}

type Detail = {
  agency: { id: number; code: string; name: string; email: string | null; commissionPct: number; gemsPerBean: number; status: 'active' | 'disabled'; createdAt: string };
  counts: { signedUp: number; approved: number; pending: number; rejected: number };
  hostGems: number;
  commissionBeans: number;
  gemBalance: number;
  gemsAdded: number;
  gemsSent: number;
  usersSent: number;
  hosts: { user: UserCard | null; status: string; joinedAt: string; calls: number | null; gems: number | null; commissionBeans: number | null }[];
  signedUp: { user: UserCard; signedUpAt: string; form: string }[];
};
type DTab = 'hosts' | 'signed' | 'gems';

const HostStatus = ({ s }: { s: string }) =>
  s === 'approved' ? <Pill tone="ok">Approved</Pill> : s === 'suspended' ? <Pill tone="no">Suspended</Pill> : s === 'pending' ? <Pill tone="pend">Pending</Pill> : <Pill tone="no">Rejected</Pill>;
const FORM: Record<string, [string, 'ok' | 'pend' | 'no' | 'gray']> = {
  approved: ['Approved host', 'ok'],
  pending: ['Pending', 'pend'],
  rejected: ['Rejected', 'no'],
  not_applied: ['Not applied yet', 'gray'],
  not_allowed: ['Not allowed (men can’t host)', 'gray'],
};

// Agency ka poora hisaab — kaun aaya, kaun host bana, har host se kitna commission, gems stock
function AgencyDetail({ aid, initialTab }: { aid: number; initialTab: DTab }) {
  const { go } = useAuth();
  const d = useApi<Detail>(`/agencies/${aid}/detail`);
  const [tab, setTab] = useState<DTab>(initialTab);
  const [edit, setEdit] = useState(false);
  const [addGems, setAddGems] = useState(false);
  const [gemsKey, setGemsKey] = useState(0);
  const x = d.data;
  // Edit dialog ko list wala shape chahiye
  const asRow: Agency | null = x
    ? { ...x.agency, hosts: x.counts.approved, hostGems: x.hostGems, commissionBeans: x.commissionBeans, gemBalance: x.gemBalance, gemsAdded: x.gemsAdded, gemsSent: x.gemsSent, usersSent: x.usersSent, lastLoginAt: null }
    : null;
  const approvedHosts = x?.hosts.filter(h => h.gems !== null) ?? [];
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
                  {x.agency.code} · {x.agency.email ?? 'no login'} · {x.agency.commissionPct}% commission · 1 bean = {num(x.agency.gemsPerBean)} gems · since {date(x.agency.createdAt)}
                </small>
              </span>
            </div>
            <div className="right acts">
              <button className="btn b-ghost" onClick={() => setEdit(true)}>
                Edit
              </button>
              <button className="btn b-gold" onClick={() => setAddGems(true)}>
                + Gems
              </button>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <small>Signed up via link</small>
              <b>{num(x.counts.signedUp)}</b>
              <em>
                hosts: {x.counts.approved} approved · {x.counts.pending} pending · {x.counts.rejected} rejected
              </em>
            </div>
            <div className="kpi">
              <small>Hosts earned · since joining</small>
              <b>
                <Gems n={x.hostGems} />
              </b>
              <em>gems their hosts earned</em>
            </div>
            <div className="kpi">
              <small>Commission</small>
              <b>
                <Beans n={x.commissionBeans} />
              </b>
              <em>
                {x.agency.commissionPct}% · 1 bean = {num(x.agency.gemsPerBean)} gems
              </em>
            </div>
            <div className="kpi">
              <small>Gems stock</small>
              <b>
                <Gems n={x.gemBalance} />
              </b>
              <em>
                sent {num(x.gemsSent)} to {num(x.usersSent)} user{x.usersSent === 1 ? '' : 's'}
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
                ['gems', 'Gems added / sent'],
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
                    <th className="r">GEMS EARNED</th>
                    <th className="r">COMMISSION BEANS</th>
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
                      <td className="r">{h.gems === null ? '—' : <Gems n={h.gems} />}</td>
                      <td className="r">{h.commissionBeans === null ? '—' : <Beans n={h.commissionBeans} />}</td>
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
                      <td className="r">
                        <b>
                          <Gems n={x.hostGems} />
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          <Beans n={x.commissionBeans} />
                        </b>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {!x.hosts.length && <Empty>No hosts from this agency yet</Empty>}
            </div>
          )}
          {tab === 'hosts' && x.hosts.length > 0 && (
            <div className="alert a-blue">
              Gems earned = since this agency was added. Commission = all hosts’ gems × {x.agency.commissionPct}% ÷ {num(x.agency.gemsPerBean)} = beans. The agency sees only the beans. Agency withdraw is off for now.
            </div>
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

          {tab === 'gems' && <GemsTable key={gemsKey} agencyId={x.agency.id} />}
        </>
      )}

      {edit && asRow && <AgencyEditor agency={asRow} onClose={() => setEdit(false)} onSaved={() => (setEdit(false), d.reload())} />}
      {addGems && x && (
        <AddGemsDialog
          agency={{ id: x.agency.id, name: x.agency.name, gemBalance: x.gemBalance }}
          onClose={() => setAddGems(false)}
          onSaved={() => (setAddGems(false), d.reload(), setGemsKey(k => k + 1))}
        />
      )}
    </section>
  );
}

export default function Agencies({ id }: { id?: string }) {
  const { go } = useAuth();
  const list = useApi<Data>(id ? null : '/agencies');
  const [edit, setEdit] = useState<'new' | null>(null);
  const [addGems, setAddGems] = useState<Agency | null>(null);
  const t = list.data?.totals;

  // #/agencies/4 = detail · #/agencies/4-gems = seedha gems tab
  if (id) {
    const [n, tab] = id.split('-');
    return <AgencyDetail key={id} aid={Number(n)} initialTab={tab === 'gems' ? 'gems' : tab === 'signed' ? 'signed' : 'hosts'} />;
  }

  return (
    <section className="agencies-page">
      <div className="top">
        <div>
          <h2>Agencies</h2>
          <div className="sub">Partners who bring hosts and sell gems to users · money for gems is taken outside the app</div>
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
        <div className="kpi">
          <small>Gems given to agencies</small>
          <b>{t ? <Gems n={t.gemsAdded} /> : '—'}</b>
          <em>all time</em>
        </div>
        <div className="kpi">
          <small>Gems sent to users</small>
          <b>{t ? <Gems n={t.gemsSent} /> : '—'}</b>
          <em>by agencies</em>
        </div>
        <div className="kpi">
          <small>Commission</small>
          <b>{t ? <Beans n={t.commissionBeans} /> : '—'}</b>
          <em>beans · all agencies</em>
        </div>
      </div>

      <div className="card mt">
        <table>
          <thead>
            <tr>
              <th>AGENCY</th>
              <th>HOSTS</th>
              <th>COMMISSION</th>
              <th className="r">HOSTS EARNED</th>
              <th className="r">COMMISSION BEANS</th>
              <th className="r">GEMS STOCK</th>
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
                <td className="stack nowrap">
                  <b>{a.commissionPct}%</b>
                  <small>1 bean = {num(a.gemsPerBean)} gems</small>
                </td>
                <td className="r">
                  <Gems n={a.hostGems} />
                </td>
                <td className="r">
                  <Beans n={a.commissionBeans} />
                </td>
                <td className="r stack">
                  <b>
                    <Gems n={a.gemBalance} />
                  </b>
                  <small>
                    sent {num(a.gemsSent)} · {num(a.usersSent)} user{a.usersSent === 1 ? '' : 's'}
                  </small>
                </td>
                <td>{a.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="no">Paused</Pill>}</td>
                <td className="r nowrap">
                  <button className="btn b-gold sm" onClick={() => setAddGems(a)}>
                    + Gems
                  </button>
                  <button className="btn b-ghost sm" onClick={() => go('agencies', `${a.id}-gems`)} style={{ marginLeft: 6 }}>
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
      {addGems && <AddGemsDialog agency={addGems} onClose={() => setAddGems(null)} onSaved={() => (setAddGems(null), list.reload())} />}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { Toggle, useApi, useAuth, useUi } from '../ui';

type S = Record<string, number | boolean | number[]>;
type F = { key: string; label: string; hint?: string; kind?: 'list' | 'bool' };

const GROUPS: { title: string; fields: F[] }[] = [
  {
    title: '📞 Calls & rate',
    fields: [
      { key: 'hostRateMin', label: 'Host rate · minimum' },
      { key: 'hostRateOpenMax', label: 'Host rate · maximum' },
      { key: 'hostRateStep', label: 'Custom rate step' },
      { key: 'hostRates', label: 'Rate chips', hint: 'comma separated', kind: 'list' },
      { key: 'hostRateDefault', label: 'Default rate (new host)' },
      { key: 'matchRate', label: 'Match call rate' },
      { key: 'vipCallDiscountPct', label: 'VIP call discount %' },
    ],
  },
  {
    title: '💬 Chat & media',
    fields: [
      { key: 'freeMessagesPerHost', label: 'Free messages per host' },
      { key: 'messagePrice', label: 'Message price (gems)' },
      { key: 'vipFreeMessages', label: 'Free chat for VIP', kind: 'bool' },
      { key: 'freePhotos', label: 'Free photos' },
      { key: 'photoUnlockPrice', label: 'Photo unlock price' },
      { key: 'freeVideos', label: 'Free videos' },
      { key: 'videoUnlockPrice', label: 'Video unlock price' },
      { key: 'maxHostVideos', label: 'Max videos per host' },
    ],
  },
  {
    title: '💸 Host withdraw (gems → beans → ₹)',
    fields: [
      { key: 'gemsPerBean', label: 'Host: 1 bean = how many gems', hint: 'same for all hosts' },
      { key: 'beansPerInr', label: 'Beans for ₹1', hint: 'only admin sees ₹' },
      { key: 'minWithdrawBeans', label: 'Minimum withdraw (beans)' },
      { key: 'tdsPct', label: 'TDS %', hint: 'cut while paying' },
    ],
  },
];

// Example: host ke 50,000 gems kitne beans aur kitne ₹ (sirf admin ko dikhta hai)
function BeanExample({ gpb, bpi }: { gpb: number; bpi: number }) {
  if (!(gpb >= 1) || !(bpi > 0)) return null;
  const gems = 50_000;
  const beans = Math.floor(gems / gpb);
  return (
    <div className="hint">
      Example: {gems.toLocaleString('en-IN')} gems = {beans.toLocaleString('en-IN')} beans = ₹{(beans / bpi).toLocaleString('en-IN', { maximumFractionDigits: 2 })}. Hosts see only beans.
    </div>
  );
}

const show = (v: S[string] | undefined) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));

export default function Settings() {
  const { can } = useAuth();
  const { ask, run } = useUi();
  const { data, reload } = useApi<{ settings: S; moneyKeys: string[] }>('/settings');
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  useEffect(() => setDraft({}), [data]);

  const value = (f: F) => (f.key in draft ? draft[f.key] : f.kind === 'bool' ? (data?.settings[f.key] as boolean) : show(data?.settings[f.key]));
  const parse = (f: F, v: string | boolean): number | boolean | number[] =>
    f.kind === 'bool' ? (v as boolean) : f.kind === 'list' ? String(v).split(',').map(x => Math.round(Number(x.trim()))).filter(n => n > 0) : Number(v);
  const changed = Object.keys(draft).filter(k => {
    const f = GROUPS.flatMap(g => g.fields).find(x => x.key === k)!;
    return JSON.stringify(parse(f, draft[k]!)) !== JSON.stringify(data?.settings[k]);
  });
  const money = changed.filter(k => data?.moneyKeys.includes(k));

  const save = async () => {
    const all = GROUPS.flatMap(g => g.fields);
    const patch = Object.fromEntries(changed.map(k => [k, parse(all.find(f => f.key === k)!, draft[k]!)]));
    const lines = changed.map(k => `${all.find(f => f.key === k)!.label}: ${show(data?.settings[k])} → ${show(patch[k] as S[string])}`);
    const r = await ask({
      title: money.length ? 'Change money settings?' : 'Save settings?',
      text: (
        <>
          {lines.map(l => (
            <span key={l} style={{ display: 'block' }}>
              {l}
            </span>
          ))}
          <span style={{ display: 'block', marginTop: 8 }}>Changes reach the app within 30 seconds.</span>
        </>
      ),
      password: false, // owner ne dobara password hata diya
      confirm: 'Save',
      tone: money.length ? 'red' : 'rose',
    });
    if (r && (await run(() => api('/settings', { method: 'PUT', body: { patch, password: r.password || undefined } }), 'Settings saved'))) reload();
  };

  if (!can()) return null;
  return (
    <section>
      <div className="top">
        <div>
          <h2>Settings</h2>
          <div className="sub">Every number the app uses · changes reach the app within 30 sec · each change is in the audit log</div>
        </div>
        <div className="right">
          {changed.length > 0 && (
            <button className="btn b-ghost" onClick={() => setDraft({})}>
              Undo
            </button>
          )}
          <button className="btn b-rose" disabled={!changed.length} onClick={save}>
            Save {changed.length ? `(${changed.length})` : ''}
          </button>
        </div>
      </div>
      {data && (
        <div className="g3">
          {GROUPS.map(g => (
            <div className="card" key={g.title}>
              <h3>{g.title}</h3>
              {g.fields.map(f => (
                <div className="field" key={f.key}>
                  <span>
                    {f.label}
                    {f.hint && <small>{f.hint}</small>}
                  </span>
                  {f.kind === 'bool' ? (
                    <Toggle on={value(f) as boolean} onChange={v => setDraft(d => ({ ...d, [f.key]: v }))} />
                  ) : (
                    <input
                      className={changed.includes(f.key) ? 'changed' : ''}
                      style={f.kind === 'list' ? { width: 170 } : undefined}
                      value={value(f) as string}
                      onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              {g.fields.some(f => f.key === 'gemsPerBean') && <BeanExample gpb={Number(value(g.fields[0]))} bpi={Number(value(g.fields[1]))} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

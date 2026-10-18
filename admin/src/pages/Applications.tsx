import { useState } from 'react';
import { api } from '../api';
import { ago, date, Empty, Img, Pill, Tabs, useApi, useAuth, useUi, Vid, Who, type UserCard } from '../ui';

type Row = { user: UserCard; agency: { name: string; code: string } | null; status: string; appliedAt: string; reviewedAt: string | null; rejectReason: string | null };
type Detail = {
  user: UserCard & { phone: string | null; birthday: string | null; languages: string[]; city: string | null };
  agency: { name: string; code: string } | null;
  status: string;
  rejectReason: string | null;
  submittedAt: string;
  photos: string[];
  selfies: string[];
  video: string | null;
  checks: { sameDevice: number; adult: boolean };
};

const REASONS = ['Face doesn’t match the photos', 'Video is not clear', 'Under 18', 'Not her own photos', 'Photos are not decent'];

export default function Applications({ id }: { id?: string }) {
  const { go, refreshPending } = useAuth();
  const { ask, run, zoom } = useUi();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const list = useApi<{ items: Row[] }>(`/applications?status=${status}`);
  const sel = id ?? (list.data?.items[0] ? String(list.data.items[0].user.publicId) : undefined);
  const detail = useApi<Detail>(sel ? `/applications/${sel}` : null);
  const d = detail.data;

  const done = () => {
    list.reload();
    detail.reload();
    refreshPending();
  };
  const approve = async () => {
    const ok = await ask({ title: `Approve ${d!.user.name} as host?`, text: 'She will get the host interface and a notification.', confirm: '✓ Approve', tone: 'green' });
    if (ok && (await run(() => api(`/applications/${sel}/approve`, { method: 'POST' }), 'Approved as host'))) done();
  };
  const reject = async (block: boolean) => {
    const r = await ask({
      title: block ? 'Reject and block?' : 'Reject application?',
      text: block ? 'She can’t apply again without a new agency invite link.' : 'She can fix it and apply again.',
      input: { label: 'Reason (shown to the applicant)', chips: REASONS, multiline: true },
      confirm: 'Reject',
      tone: 'red',
    });
    if (r && (await run(() => api(`/applications/${sel}/reject`, { body: { reason: r.value, block } }), 'Rejected'))) done();
  };

  return (
    <section>
      <div className="top">
        <div>
          <h2>Host applications</h2>
          <div className="sub">Match photos, selfies and the 30 sec live video · approve only real women 18+</div>
        </div>
      </div>
      <Tabs
        value={status}
        onChange={s => (setStatus(s), go('applications'))}
        items={[
          ['pending', 'Pending'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
        ]}
      />
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>APPLICANT</th>
                <th>AGENCY</th>
                <th>AGE</th>
                <th>{status === 'pending' ? 'APPLIED' : 'REVIEWED'}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map(r => (
                <tr key={r.user.publicId} className={`click${String(r.user.publicId) === sel ? ' sel' : ''}`} onClick={() => go('applications', String(r.user.publicId))}>
                  <td>
                    <Who u={r.user} />
                  </td>
                  <td>{r.agency?.name ?? '—'}</td>
                  <td>{r.user.age ?? '—'}</td>
                  <td className="nowrap">{ago(status === 'pending' ? r.appliedAt : r.reviewedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.items.length && <Empty>No {status} applications</Empty>}
        </div>
        <div className="card sticky">
          {!d ? (
            <Empty>{sel ? 'Loading…' : 'Select an application'}</Empty>
          ) : (
            <>
              <h3>
                {d.user.name} · {d.user.age} · {d.agency?.name ?? 'No agency'}
                <Pill tone={d.status === 'pending' ? 'pend' : d.status === 'approved' ? 'ok' : 'no'}>{d.status}</Pill>
              </h3>
              <h4>Profile photos</h4>
              <div className="media">
                {d.photos.map((p, i) => (
                  <div className="m" key={i}>
                    <Img src={p} onClick={() => zoom(p)} />
                  </div>
                ))}
              </div>
              <h4>Live selfies (front · left · right)</h4>
              <div className="media">
                {d.selfies.map((p, i) => (
                  <div className="m" key={i}>
                    <Img src={p} onClick={() => zoom(p)} />
                  </div>
                ))}
              </div>
              <h4>30 sec live video</h4>
              {d.video ? <Vid className="vid" src={d.video} /> : <Empty>No video</Empty>}
              <div className="kv">
                <span>Meto ID</span>
                <b>{d.user.publicId}</b>
                <span>Phone</span>
                <b>{d.user.phone ?? '—'}</b>
                <span>Date of birth</span>
                <b className={d.checks.adult ? '' : 'red'}>
                  {date(d.user.birthday)} · {d.user.age} yrs {d.checks.adult ? '✓' : '✗ under 18'}
                </b>
                <span>Languages</span>
                <b>{d.user.languages.join(', ') || '—'}</b>
                <span>Agency</span>
                <b>{d.agency ? `${d.agency.name} · ${d.agency.code}` : '—'}</b>
                <span>Same device</span>
                <b className={d.checks.sameDevice ? 'red' : 'green'}>{d.checks.sameDevice ? `⚠ used by ${d.checks.sameDevice} other account(s)` : 'No other account'}</b>
                <span>Submitted</span>
                <b>{date(d.submittedAt)}</b>
                {d.rejectReason && (
                  <>
                    <span>Reject reason</span>
                    <b className="red">{d.rejectReason}</b>
                  </>
                )}
              </div>
              {d.status === 'pending' && (
                <div className="acts mt">
                  <button className="btn b-red" onClick={() => reject(false)}>
                    Reject
                  </button>
                  <button className="btn b-ghost" onClick={() => reject(true)}>
                    Reject &amp; block
                  </button>
                  <button className="btn b-green ml-auto" onClick={approve} disabled={!d.checks.adult}>
                    ✓ Approve as host
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

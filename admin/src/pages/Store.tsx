import { useEffect, useRef, useState } from 'react';
import * as SVGA from 'svgaplayerweb';
import { api } from '../api';
import { Empty, num, Toggle, useApi, useUi } from '../ui';

type Gift = { id: number; name: string; icon: string; iconUrl: string | null; svgaUrl: string | null; price: number; isRare: boolean; isActive: boolean; sent: number };

// SVGA animation chalao (URL ya abhi chuni hui file)
function SvgaPreview({ src }: { src: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!src || !box.current) return;
    setErr('');
    box.current.innerHTML = '';
    const player = new SVGA.Player(box.current);
    const parser = new SVGA.Parser();
    player.loops = 0;
    parser.load(
      src,
      v => {
        player.setVideoItem(v);
        player.startAnimation();
      },
      () => setErr('This file could not be played — is it a real SVGA?'),
    );
    return () => {
      player.stopAnimation(true);
      player.clear();
    };
  }, [src]);
  if (!src) return <div className="svga-box dimtxt">No SVGA animation yet — the emoji / icon is shown instead</div>;
  return (
    <>
      <div className="svga-box" ref={box} />
      {err && <div className="alert a-red">{err}</div>}
    </>
  );
}

function GiftEditor({ gift, onClose, onSaved }: { gift: Gift | null; onClose: () => void; onSaved: () => void }) {
  const { run } = useUi();
  const [name, setName] = useState(gift?.name ?? '');
  const [icon, setIcon] = useState(gift?.icon ?? '🎁');
  const [price, setPrice] = useState(String(gift?.price ?? ''));
  const [rare, setRare] = useState(gift?.isRare ?? false);
  const [active, setActive] = useState(gift?.isActive ?? true);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [svgaFile, setSvgaFile] = useState<File | null>(null);
  const [removeSvga, setRemoveSvga] = useState(false);
  const [busy, setBusy] = useState(false);
  const [svgaLocal, setSvgaLocal] = useState<string | null>(null);
  const [iconLocal, setIconLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!svgaFile) return setSvgaLocal(null);
    const u = URL.createObjectURL(svgaFile);
    setSvgaLocal(u);
    return () => URL.revokeObjectURL(u);
  }, [svgaFile]);
  useEffect(() => {
    if (!iconFile) return setIconLocal(null);
    const u = URL.createObjectURL(iconFile);
    setIconLocal(u);
    return () => URL.revokeObjectURL(u);
  }, [iconFile]);

  const save = async () => {
    const f = new FormData();
    f.append('name', name.trim());
    f.append('icon', icon.trim() || '🎁');
    f.append('price', String(Math.round(Number(price))));
    f.append('isRare', String(rare));
    f.append('isActive', String(active));
    if (iconFile) f.append('iconFile', iconFile);
    if (svgaFile) f.append('svga', svgaFile);
    if (removeSvga && !svgaFile) f.append('removeSvga', 'true');
    setBusy(true);
    const ok = await run(() => api(gift ? `/gifts/${gift.id}` : '/gifts', { method: gift ? 'PATCH' : 'POST', form: f }), gift ? 'Gift saved' : 'Gift added');
    setBusy(false);
    if (ok) onSaved();
  };

  // Kya bharna baaki hai — button ke paas dikhao
  const missing = [name.trim().length < 2 && 'name', !(Number(price) > 0) && 'price (gems)'].filter(Boolean) as string[];

  const shownSvga = svgaLocal ?? (removeSvga ? null : gift?.svgaUrl ?? null);
  const shownIcon = iconLocal ?? gift?.iconUrl ?? null;

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <h3>{gift ? `Edit · ${gift.name}` : 'Add gift'}</h3>
        <SvgaPreview src={shownSvga} />
        <label className="lbl">
          SVGA animation (.svga · max 5 MB) — plays full screen when the gift is sent
          <input
            className="input"
            type="file"
            accept=".svga"
            onChange={e => {
              const f = e.target.files?.[0] ?? null;
              setSvgaFile(f);
              setRemoveSvga(false);
              // Naam khaali ho to file ke naam se (Dolphin_Jumping_3D_1080x1080.svga → "Dolphin Jumping")
              if (f && !name.trim())
                setName(
                  f.name
                    .replace(/\.svga$/i, '')
                    .replace(/\(\d+\)|\b\d+x\d+\b|\b3D\b/gi, '')
                    .replace(/[_-]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .split(' ')
                    .slice(0, 3)
                    .join(' ')
                    .slice(0, 40),
                );
            }}
            style={{ paddingTop: 7 }}
          />
        </label>
        {gift?.svgaUrl && !svgaFile && (
          <label className="check mt">
            <input type="checkbox" checked={removeSvga} onChange={e => setRemoveSvga(e.target.checked)} /> Remove current animation
          </label>
        )}
        <label className="lbl">
          Icon (PNG with transparent background · shown in the gift list)
          <div className="acts" style={{ marginTop: 5 }}>
            <div className="gift" style={{ width: 80, cursor: 'default', padding: 6 }}>
              <div className="e">{shownIcon ? <img src={shownIcon} alt="" /> : icon}</div>
            </div>
            <input className="input" type="file" accept="image/png,image/webp,image/jpeg" onChange={e => setIconFile(e.target.files?.[0] ?? null)} style={{ flex: 1, marginTop: 0, paddingTop: 7 }} />
          </div>
        </label>
        <div className="g2" style={{ gridTemplateColumns: '1fr 1fr 90px', marginTop: 0 }}>
          <label className="lbl">
            Name *
            <input className="input" value={name} placeholder="e.g. Dolphin" onChange={e => setName(e.target.value)} maxLength={40} />
          </label>
          <label className="lbl">
            Price (gems) *
            <input className="input" type="number" min={1} value={price} placeholder="e.g. 9999" onChange={e => setPrice(e.target.value)} />
          </label>
          <label className="lbl">
            Emoji
            <input className="input" value={icon} onChange={e => setIcon(e.target.value)} maxLength={8} />
          </label>
        </div>
        <div className="field mt">
          <span>
            Rare gift<small>bigger animation spot, gold frame</small>
          </span>
          <Toggle on={rare} onChange={setRare} />
        </div>
        <div className="field">
          <span>
            Visible in app<small>off = hidden from the gift list</small>
          </span>
          <Toggle on={active} onChange={setActive} />
        </div>
        <div className="acts end mt">
          {missing.length > 0 && <span className="red ml-auto" style={{ fontSize: 12 }}>Enter {missing.join(' and ')}</span>}
          <button className="btn b-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn b-rose" disabled={busy || missing.length > 0} onClick={save}>
            {busy ? 'Uploading…' : gift ? 'Save' : 'Add gift'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Store() {
  const list = useApi<{ items: Gift[] }>('/gifts');
  const [edit, setEdit] = useState<Gift | 'new' | null>(null);

  return (
    <section>
      <div className="top">
        <div>
          <h2>Store · gifts</h2>
          <div className="sub">Each gift: icon for the list + SVGA animation that plays full screen when sent (chat &amp; call)</div>
        </div>
        <div className="right">
          <button className="btn b-rose" onClick={() => setEdit('new')}>
            + Add gift
          </button>
        </div>
      </div>
      <div className="card mt">
        <h3>
          Gifts · {list.data?.items.length ?? 0}
          <span className="dimtxt" style={{ display: 'inline' }}>
            {list.data?.items.filter(g => g.svgaUrl).length ?? 0} with SVGA animation
          </span>
        </h3>
        <div className="giftgrid">
          {list.data?.items.map(g => (
            <div key={g.id} className={`gift${g.isActive ? '' : ' off'}`} onClick={() => setEdit(g)}>
              {g.svgaUrl && <span className="badge">SVGA</span>}
              <div className="e">{g.iconUrl ? <img src={g.iconUrl} alt="" /> : g.icon}</div>
              <b>
                {g.name}
                {g.isActive ? '' : ' · off'}
              </b>
              <small>{num(g.price)}</small>
              <span className="dimtxt">sent {num(g.sent)}×</span>
            </div>
          ))}
        </div>
        {list.data && !list.data.items.length && <Empty>No gifts</Empty>}
      </div>
      <div className="alert a-gold">Gem packs and VIP plans are linked to Google Play products — they will be editable here after Play Billing goes live.</div>
      {edit && (
        <GiftEditor
          gift={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            list.reload();
          }}
        />
      )}
    </section>
  );
}

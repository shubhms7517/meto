import { Router } from 'express';
import { Agency } from '../models/index.js';

// Agency invite link ka web page: /join?agency=AG1045
// Phone ke browser me khulta hai → "Open Meto app" button → app ki Host invite screen.
// meto.app domain live hone par https://meto.app/join?... bhi isi page pe aayega.
export const joinRouter = Router();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const page = (body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Join Meto as a host</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;font-family:Poppins,system-ui,sans-serif;color:#f6e9ee;background:radial-gradient(80% 60% at 50% 0%,#4a1230,#12070d 72%);display:grid;place-items:center;padding:22px}
  .box{width:380px;max-width:100%;background:#1d1418;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:28px 24px;text-align:center}
  .logo{font-size:34px;font-weight:800;font-style:italic;color:#f6dc9b}
  .ag{margin-top:18px;display:flex;align-items:center;gap:12px;text-align:left;background:#241c20;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px 14px}
  .ag i{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#ff5f8f,#d81b5c);display:grid;place-items:center;font-style:normal;font-weight:800}
  .ag b{display:block;font-size:15px}.ag span{font-size:12px;color:#b9a3ad}.ag em{margin-left:auto;font-style:normal;color:#3ee08f;font-size:12px;font-weight:600}
  h1{font-size:21px;margin-top:20px}p{color:#b9a3ad;font-size:13px;margin-top:8px;line-height:1.55}
  .btn{display:block;margin-top:22px;padding:14px;border-radius:14px;font-weight:600;font-size:15px;text-decoration:none;color:#fff;background:linear-gradient(100deg,#ff5f8f,#d81b5c)}
  .alt{display:block;margin-top:12px;font-size:12px;color:#7d6872}.alt a{color:#ff5f8f}
  .rules{margin-top:18px;font-size:11.5px;color:#7d6872;line-height:1.6}
  .warn{margin-top:16px;padding:11px 13px;border-radius:12px;font-size:12.5px;color:#ffb3c0;background:rgba(255,95,122,.09);border:1px solid rgba(255,95,122,.3)}
</style></head><body><div class="box"><div class="logo">Meto</div>${body}</div></body></html>`;

joinRouter.get('/join', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const code = String(req.query.agency ?? '').trim().toUpperCase();
  const agency = /^[A-Z0-9]{2,20}$/.test(code) ? await Agency.findOne({ where: { code } }) : null;
  if (!agency || agency.status !== 'active') {
    res.status(404).send(page(`<h1>This invite link isn’t active</h1><p>Ask the agency for a new Meto invite link.</p>`));
    return;
  }
  const appLink = `meto://join?agency=${encodeURIComponent(agency.code)}`;
  // Android Chrome: intent link se app khulti hai; app na ho to isi page pe "install" sandesh
  const back = `${req.protocol}://${req.get('host')}/join?agency=${encodeURIComponent(agency.code)}&noapp=1`;
  const intent = `intent://join?agency=${encodeURIComponent(agency.code)}#Intent;scheme=meto;package=com.meto;S.browser_fallback_url=${encodeURIComponent(back)};end`;
  const noApp = req.query.noapp === '1';
  res.send(
    page(`
    <div class="ag"><i>${esc(agency.name.slice(0, 1).toUpperCase())}</i><div><b>${esc(agency.name)}</b><span>Code ${esc(agency.code)}</span></div><em>✓ Verified</em></div>
    <h1>You’re invited to be a Meto host</h1>
    <p>Earn from video calls, gifts and messages. Go online whenever you want and withdraw to UPI.</p>
    ${noApp ? `<div class="warn">Meto app isn’t installed on this phone. Install Meto first, then open this link again.</div>` : ''}
    <a class="btn" href="${esc(intent)}">Open Meto app</a>
    <span class="alt">Not opening? <a href="${esc(appLink)}">Try this link</a></span>
    <div class="rules">Women 18+ only · your own real photos · 30 sec live video · Meto team checks every application.</div>`),
  );
});

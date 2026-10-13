import { Linking } from 'react-native';

// Agency link: meto://join?agency=AG1045 ya https://meto.app/join?agency=AG1045
// Login/signup se pehle aaye to yaad rakho — Main tabs khulte hi Invite screen
let pending: string | null = null;
let handler: ((code: string) => void) | null = null;

export function parseInvite(url: string | null | undefined): string | null {
  if (!url || !/^(meto:\/\/join|https:\/\/(www\.)?meto\.app\/join)\b/i.test(url)) return null;
  const m = /[?&]agency=([A-Za-z0-9]{2,20})/.exec(url);
  return m ? m[1].toUpperCase() : null;
}

function got(url: string | null | undefined) {
  const code = parseInvite(url);
  if (!code) return;
  if (handler) handler(code);
  else pending = code;
}

let started = false;
export function startInviteLinks() {
  if (started) return;
  started = true;
  Linking.getInitialURL().then(got).catch(() => {});
  Linking.addEventListener('url', e => got(e.url));
}

// Main tabs (logged in) ye sunta hai
export function onInvite(h: (code: string) => void) {
  handler = h;
  if (pending) {
    const c = pending;
    pending = null;
    h(c);
  }
  return () => {
    if (handler === h) handler = null;
  };
}

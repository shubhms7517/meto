// Server mil raha hai ya nahi — poori app ke liye ek jagah.
// api() har jawab pe "online" aur network fail pe "offline" batata hai.
// Offline ho to har kuch second /health check — server aate hi sabko khabar (screens khud reload).

type Listener = (online: boolean) => void;

let online = true;
let base = '';
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const CHECK_EVERY_MS = 8_000;

export const isOnline = () => online;

export function onNetChange(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach(fn => fn(next));
  if (!next) schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    checkNow();
  }, CHECK_EVERY_MS);
}

// /health — bina login ke, jaldi (5 sec me jawab nahi to abhi bhi offline)
export async function checkNow() {
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const r = await fetch(`${base}/health`, { signal: ctrl.signal });
    if (r.ok) {
      set(true);
      return;
    }
  } catch {
    // abhi bhi nahi mila
  } finally {
    clearTimeout(t);
  }
  online = false;
  schedule();
}

export const setNetBase = (url: string) => {
  base = url;
};
export const markOnline = () => set(true);
export const markOffline = () => set(false);

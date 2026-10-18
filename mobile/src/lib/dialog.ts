// App ka apna popup (Android ke safed Alert ki jagah). Istemal bilkul Alert.alert jaisa:
//   appAlert('Block Zoya?', 'They won’t be notified.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress }])
export type DialogButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type DialogTone = 'danger' | 'gold' | 'rose';
export type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[]; icon: string; tone: DialogTone };

type Listener = (queue: Dialog[]) => void;
let queue: Dialog[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l(queue));

export function subscribeDialogs(l: Listener) {
  listeners.add(l);
  l(queue);
  return () => {
    listeners.delete(l);
  };
}

export function closeDialog(id: number) {
  queue = queue.filter(d => d.id !== id);
  emit();
}

// Title / button se icon aur rang (har popup me alag se likhna na pade)
function look(title: string, message: string | undefined, buttons: DialogButton[]): { icon: string; tone: DialogTone } {
  const t = `${title} ${message ?? ''} ${buttons.map(b => b.text ?? '').join(' ')}`.toLowerCase();
  const danger = buttons.some(b => b.style === 'destructive');
  const icon = /block/.test(t)
    ? '🚫'
    : /report/.test(t)
    ? '🚩'
    : /delete|remove/.test(t)
    ? '🗑️'
    : /sign out|log ?out/.test(t)
    ? '👋'
    : /unlock|locked|private/.test(t)
    ? '🔒'
    : /withdraw|upi|payout/.test(t)
    ? '💸'
    : /vip/.test(t)
    ? '👑'
    : /recharge|gems|balance|payment/.test(t)
    ? '💎'
    : /video/.test(t)
    ? '🎥'
    : /photo|picture|image/.test(t)
    ? '📷'
    : /call/.test(t)
    ? '📞'
    : /permission|camera|microphone/.test(t)
    ? '🔐'
    : /internet|connection|reach server|network|failed|could not|can’t|can't|error|wrong/.test(t)
    ? '📡'
    : /rate/.test(t)
    ? '💰'
    : '💬';
  const tone: DialogTone = danger ? 'danger' : /unlock|gems ·|· \d|\d+ gems/.test(t) && buttons.length > 1 ? 'gold' : 'rose';
  return { icon, tone };
}

export function appAlert(title: string, message?: string, buttons?: DialogButton[]) {
  const b = buttons?.length ? buttons : [{ text: 'OK' }];
  queue = [...queue, { id: ++seq, title, message, buttons: b, ...look(title, message, b) }];
  emit();
}

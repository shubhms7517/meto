// "YYYY-MM-DD" → aaj ki age
export function ageOn(birthday: string, today = new Date()): number {
  const [y, m, d] = birthday.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

// Itne time ke andar activity = "Online"
export const ONLINE_WINDOW_MS = 2 * 60_000;

export const isOnline = (lastSeenAt: Date | null) =>
  !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;

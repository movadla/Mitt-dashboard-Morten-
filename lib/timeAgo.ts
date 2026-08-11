export function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "nå nettopp";
  if (min < 60) return `${min} min siden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}t siden`;
  const days = Math.floor(hr / 24);
  return `${days}d siden`;
}

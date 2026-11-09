export function addUtcDays(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`invalid timestamp ${iso}`);
  return new Date(ms + days * 86_400_000).toISOString();
}

export function dateToIso(date: string): string {
  if (date.includes('T')) return new Date(Date.parse(date)).toISOString();
  return `${date}T00:00:00.000Z`;
}

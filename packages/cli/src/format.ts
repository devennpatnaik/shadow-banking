export function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

export function kvTable(rows: readonly [string, string][]): string {
  const width = rows.reduce((w, [k]) => Math.max(w, k.length), 0);
  return rows.map(([k, v]) => `${pad(k, width)}  ${v}`).join('\n');
}

export function banner(title: string, extra?: string): string {
  const line = extra ? `${title}  ·  ${extra}` : title;
  return `${line}\n${'-'.repeat(Math.min(line.length, 80))}`;
}

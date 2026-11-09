/** Snapshot JSON uses finite JSON numbers (same contract as docs/data/market-snapshot-*.json). */

export function parseFinite(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function roundNumber(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function requireFinite(raw: unknown, label: string): number {
  const n = parseFinite(raw);
  if (n === undefined) throw new Error(`${label}: not a finite number (${String(raw)})`);
  return n;
}

/** Lido/Rocket Pool publish percent points (2.22); snapshot uses decimals (0.0222). */
export function percentPointsToDecimal(points: number): number {
  return roundNumber(points / 100, 8);
}

export function hourlyFundingToApr(hourly: number): number {
  return roundNumber(hourly * 24 * 365, 8);
}

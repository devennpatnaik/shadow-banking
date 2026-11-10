import { d, type Decimal } from '@shadow-banking/core';

function strip0x(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

export function pad32(hex: string): string {
  const h = strip0x(hex).toLowerCase();
  if (h.length > 64) throw new Error(`hex value too long: ${hex}`);
  return h.padStart(64, '0');
}

export function encodeAddress(addr: string): string {
  return pad32(addr);
}

export function encodeUint(value: bigint): string {
  if (value < 0n) throw new Error('uint cannot be negative');
  return pad32(value.toString(16));
}

export function encodeCall(selector: string, words: readonly string[]): string {
  return `0x${strip0x(selector).toLowerCase()}${words.join('')}`;
}

/** USD notional → integer base units (paper descriptor; not a live quote). */
export function toBaseUnits(notionalUsd: Decimal, decimals = 18): bigint {
  const scaled = notionalUsd.mul(d(10).pow(decimals));
  const whole = scaled.toFixed(0);
  return BigInt(whole);
}

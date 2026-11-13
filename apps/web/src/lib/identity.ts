import 'server-only';
import { headers } from 'next/headers';
import { getIdentity, requireIdentity } from '#cursor/identity';
import type { VerifiedIdentity } from '#cursor/identity';

export { getIdentity, requireIdentity };
export type { VerifiedIdentity };

export async function requireViewer(): Promise<VerifiedIdentity> {
  const h = await headers();
  const req = new Request('https://shadow-banking.local/', { headers: h });
  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    throw new Error('unauthorized');
  }
  return identity;
}

export const PRIVATE_CACHE = { 'cache-control': 'private, no-store' } as const;

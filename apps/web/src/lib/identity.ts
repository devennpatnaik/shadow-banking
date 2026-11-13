import 'server-only';
import { headers } from 'next/headers';

/**
 * Viewer identity for per-row scoping (`identity.sub`).
 *
 * TODO(coordinator): after `cursor-cloud-add-app-identity` writes `apps/web/cursor/identity.ts`,
 * replace this shim with a real import and re-export:
 *
 *   import { requireIdentity, getIdentity } from "../../cursor/identity";
 *   export { requireIdentity, getIdentity };
 *
 * Do not hand-write `cursor/identity.ts`. Until that file exists, local and CI
 * runs (`env -u DATABASE_URL`) use a simulated viewer so pages render.
 */

export type VerifiedIdentity = {
  verified: true;
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  kind: 'person' | 'key';
  simulated: boolean;
  token: string;
};

const DEV_VIEWER: VerifiedIdentity = {
  verified: true,
  sub: 'user:dev',
  email: 'dev@example.com',
  emailVerified: true,
  name: 'Dev Viewer',
  kind: 'person',
  simulated: true,
  token: '',
};

function unauthorized(reason: string): Response {
  return Response.json(
    { ok: false, error: 'unauthorized', reason },
    { status: 401, headers: { 'cache-control': 'private, no-store' } },
  );
}

export async function requireIdentity(request: Request): Promise<VerifiedIdentity | Response> {
  // TODO(coordinator): delete this shim body once `cursor/identity` is imported above.
  const header =
    request.headers.get('x-cursor-identity-v2') ?? request.headers.get('x-cursor-identity');
  if (header && process.env.CURSOR_APP_ID) {
    return unauthorized('identity_helper_missing');
  }
  if (process.env.CURSOR_APP_ID || process.env.VERCEL) {
    return unauthorized('missing_header');
  }
  return DEV_VIEWER;
}

export async function getIdentity(
  request: Request,
): Promise<VerifiedIdentity | { verified: false; reason: string }> {
  const result = await requireIdentity(request);
  if (result instanceof Response) {
    return { verified: false, reason: 'unauthorized' };
  }
  return result;
}

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

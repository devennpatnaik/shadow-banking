import type { VerifiedIdentity } from './identity';
import { PRIVATE_CACHE, requireIdentity } from './identity';

export async function withIdentity(
  request: Request,
  fn: (identity: VerifiedIdentity) => Promise<unknown>,
): Promise<Response> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  try {
    const body = await fn(identity);
    return Response.json(body, { headers: PRIVATE_CACHE });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'error';
    return Response.json({ ok: false, error: message }, { status: 400, headers: PRIVATE_CACHE });
  }
}

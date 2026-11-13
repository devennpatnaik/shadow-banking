/**
 * Public types for the generated Cursor identity helper.
 * Runtime resolves to cursor/identity.ts via package.json "imports".
 * tsc uses this .d.ts so the generated helper is not checked as app source.
 */
export type VerifiedIdentity = {
  verified: true;
  simulated: boolean;
  token: string;
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  kind: 'person' | 'key';
};

export type UnverifiedIdentity = { verified: false; reason: string };

export type Identity = VerifiedIdentity | UnverifiedIdentity;

export function getIdentity(request: Request): Promise<Identity>;

export function requireIdentity(
  request: Request,
  options: { onFailure: 'throw' },
): Promise<VerifiedIdentity>;
export function requireIdentity(
  request: Request,
  options?: { onFailure?: 'response' },
): Promise<VerifiedIdentity | Response>;

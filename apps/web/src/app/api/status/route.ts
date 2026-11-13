import { homePayload } from '@/lib/engine';
import { withIdentity } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withIdentity(request, (identity) => homePayload(identity.sub));
}

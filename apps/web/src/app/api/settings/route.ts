import { getSettings, updateViewerSettings } from '@/lib/engine';
import { withIdentity } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withIdentity(request, async (identity) => ({
    ok: true,
    settings: await getSettings(identity.sub),
  }));
}

export async function POST(request: Request) {
  return withIdentity(request, async (identity) => {
    const body = (await request.json().catch(() => ({}))) as {
      seedUsd?: string;
      hurdlePct?: string;
      reservePct?: string;
    };
    const settings = await updateViewerSettings(identity.sub, {
      seedUsd: String(body.seedUsd ?? ''),
      hurdlePct: String(body.hurdlePct ?? ''),
      reservePct: String(body.reservePct ?? ''),
    });
    return { ok: true, settings };
  });
}

import { paperList, runViewerPaper } from '@/lib/engine';
import { withIdentity } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withIdentity(request, async (identity) => ({
    ok: true,
    runs: await paperList(identity.sub),
  }));
}

export async function POST(request: Request) {
  return withIdentity(request, async (identity) => {
    const body = (await request.json().catch(() => ({}))) as { steps?: number };
    const steps = Number(body.steps ?? 7);
    const result = await runViewerPaper(identity.sub, steps);
    return { ok: true, id: result.row.id, run: result.json };
  });
}

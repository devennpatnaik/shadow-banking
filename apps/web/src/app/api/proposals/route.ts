import { createViewerProposal, proposalList } from '@/lib/engine';
import { withIdentity } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withIdentity(request, async (identity) => ({
    ok: true,
    proposals: await proposalList(identity.sub),
  }));
}

export async function POST(request: Request) {
  return withIdentity(request, async (identity) => {
    const body = (await request.json().catch(() => ({}))) as { preset?: string };
    const created = await createViewerProposal(identity.sub, body.preset ?? 'hold-liquid');
    return { ok: true, id: created.row.id, proposal: created.body };
  });
}

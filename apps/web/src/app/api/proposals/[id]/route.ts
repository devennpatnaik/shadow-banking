import { decideProposal } from '@/lib/engine';
import { withIdentity } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withIdentity(request, async (identity) => {
    const body = (await request.json().catch(() => ({}))) as { decision?: string };
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new Error('decision must be approve or reject');
    }
    const updated = await decideProposal(identity.sub, id, body.decision);
    return { ok: true, proposal: updated.body };
  });
}

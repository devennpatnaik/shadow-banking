import { decideAction, proposeAction } from '@/app/actions';
import { Shell } from '@/components/shell';
import { proposalList } from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export const dynamic = 'force-dynamic';

function rec(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export default async function ProposalsPage() {
  const identity = await requireViewer();
  const rows = await proposalList(identity.sub);

  return (
    <Shell
      title="Assisted execution"
      viewerName={identity.name}
      simulated={identity.simulated}
      sampleMarket
      path="/proposals"
    >
      <p className="lede">
        Phase 5: propose and mark approve/reject on disk. Broadcast is refused in this product.
        Governor or policy rejection stays a veto.
      </p>
      <form action={proposeAction} className="panel">
        <h2>New proposal</h2>
        <div className="form-grid">
          <label>
            Preset
            <select name="preset" defaultValue="hold-liquid">
              <option value="hold-liquid">hold-liquid</option>
              <option value="loop-step">loop-step</option>
              <option value="stack-step">stack-step</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button type="submit">Propose (paper only)</button>
        </div>
      </form>
      <section className="panel">
        <h2>Proposals</h2>
        {rows.length === 0 ? (
          <p className="empty">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Status</th>
                <th>Veto</th>
                <th>Decide</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const body = rec(r.body);
                const status = String(body['status'] ?? r.status);
                const veto = Boolean(body['veto']);
                const locked =
                  status === 'approved' || status === 'rejected' || status === 'vetoed' || veto;
                return (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td className={status === 'vetoed' ? 'status-stop' : undefined}>{status}</td>
                    <td>{String(veto)}</td>
                    <td>
                      {locked ? (
                        <span className="note">locked</span>
                      ) : (
                        <div className="actions">
                          <form action={decideAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <button type="submit">Approve</button>
                          </form>
                          <form action={decideAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <button type="submit">Reject</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  );
}

import { runPaperAction } from '@/app/actions';
import { Shell } from '@/components/shell';
import { paperList } from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export const dynamic = 'force-dynamic';

function headlineOf(state: unknown): string {
  if (state !== null && typeof state === 'object' && 'headline' in state) {
    return String((state as { headline: unknown }).headline);
  }
  return 'Paper run';
}

export default async function PaperPage() {
  const identity = await requireViewer();
  const runs = await paperList(identity.sub);

  return (
    <Shell
      title="Paper runs"
      viewerName={identity.name}
      simulated={identity.simulated}
      sampleMarket
      path="/paper"
    >
      <p className="lede">
        Phase 4 loop: fixture snapshot → stack composer → risk governor → hypothetical ledger.
        Nothing is signed or broadcast. Runs are stored per viewer in Postgres (PGlite locally).
      </p>
      <form action={runPaperAction} className="panel">
        <h2>Start a run</h2>
        <div className="form-grid">
          <label>
            Steps
            <input name="steps" type="number" min={1} max={31} defaultValue={7} required />
          </label>
        </div>
        <div className="actions">
          <button type="submit">Run paper loop</button>
        </div>
      </form>
      <section className="panel">
        <h2>Persisted runs</h2>
        {runs.length === 0 ? (
          <p className="empty">No runs yet. Start one with the sample fixture.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Headline</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at}</td>
                  <td>{headlineOf(r.state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  );
}

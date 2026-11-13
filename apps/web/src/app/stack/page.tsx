import { Shell } from '@/components/shell';
import { stackPayload } from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export const dynamic = 'force-dynamic';

function str(v: unknown): string {
  return v == null ? '—' : String(v);
}

export default async function StackPage() {
  const identity = await requireViewer();
  const data = await stackPayload(identity.sub);
  const stack = data.stack;
  const legs = (stack['legs'] as Array<Record<string, unknown>> | undefined) ?? [];
  const next = stack['nextProposedLeg'] as Record<string, unknown> | null;
  const consolidated = (stack['consolidated'] as Record<string, unknown> | undefined) ?? {};

  return (
    <Shell
      title="Stack composer"
      viewerName={identity.name}
      simulated={identity.simulated}
      sampleMarket={data.market.sample}
      path="/stack"
    >
      <p className="lede">
        Concurrent legs on the same seed. A leg is added only while incremental net clears the
        hurdle and the governor would allow it. Empty productive stack = hold liquid.
      </p>
      <section className="metrics">
        <div className="metric">
          <div className="k">Seed</div>
          <div className="v">{data.settings.seed_usd}</div>
        </div>
        <div className="metric">
          <div className="k">Consolidated net APY</div>
          <div className="v">{str(stack['consolidatedNetApy'])}</div>
        </div>
        <div className="metric">
          <div className="k">Clears hurdle</div>
          <div className="v">{String(stack['clearsHurdle'])}</div>
        </div>
        <div className="metric">
          <div className="k">noDeployment</div>
          <div className="v">{String(stack['noDeployment'])}</div>
        </div>
        <div className="metric">
          <div className="k">HF (model)</div>
          <div className="v">{str(stack['healthFactor'])}</div>
        </div>
        <div className="metric">
          <div className="k">Action</div>
          <div className="v">{str(stack['recommendedAction'])}</div>
        </div>
      </section>
      <p className="note">{data.market.note}</p>
      <section className="panel">
        <h2>Per-leg income and cost</h2>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Leg</th>
              <th>Owner equity</th>
              <th>Borrowed</th>
              <th>Income</th>
              <th>Financing</th>
              <th>Fees</th>
              <th>EL</th>
              <th>Net</th>
              <th>Marginal APY</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={str(leg['id'])}>
                <td>{str(leg['order'])}</td>
                <td>
                  {str(leg['label'])}
                  <div className="note">{str(leg['kind'])}</div>
                </td>
                <td>{str(leg['ownerEquityUsd'])}</td>
                <td>{str(leg['borrowedCapitalUsd'])}</td>
                <td>{str(leg['incomeUsd'])}</td>
                <td>{str(leg['financingUsd'])}</td>
                <td>{str(leg['executionUsd'])}</td>
                <td>{str(leg['expectedLossUsd'])}</td>
                <td>{str(leg['estimatedNetUsd'])}</td>
                <td>{str(leg['marginalNetApy'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Consolidated net</h2>
        <table>
          <tbody>
            <tr>
              <th>Gross income</th>
              <td>{str(consolidated['grossIncomeUsd'])}</td>
            </tr>
            <tr>
              <th>Financing</th>
              <td>{str(consolidated['financingUsd'])}</td>
            </tr>
            <tr>
              <th>Execution</th>
              <td>{str(consolidated['executionUsd'])}</td>
            </tr>
            <tr>
              <th>Expected loss</th>
              <td>{str(consolidated['expectedLossUsd'])}</td>
            </tr>
            <tr>
              <th>Estimated net</th>
              <td>{str(consolidated['estimatedNetUsd'])}</td>
            </tr>
            <tr>
              <th>Estimated net APY</th>
              <td>{str(consolidated['estimatedNetApy'])}</td>
            </tr>
          </tbody>
        </table>
        <p className="note">{str(stack['stopReason'])}</p>
        {next ? (
          <p className="note">
            Next proposed leg: {str(next['kind'])} — {str(next['reason'])}
          </p>
        ) : null}
      </section>
    </Shell>
  );
}

import { Shell } from '@/components/shell';
import { homePayload } from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export const dynamic = 'force-dynamic';

function str(v: unknown): string {
  return v == null ? '—' : String(v);
}

export default async function HomePage() {
  const identity = await requireViewer();
  const data = await homePayload(identity.sub);
  const stack = data.stack as Record<string, unknown>;
  const legs = (stack['legs'] as Array<Record<string, unknown>> | undefined) ?? [];
  const usesClass = data.noDeployment ? 'status-warn' : 'status-ok';

  return (
    <Shell
      title="Consolidated book"
      viewerName={identity.name}
      simulated={identity.simulated}
      sampleMarket={data.market.sample}
      path="/"
    >
      <p className="lede">
        One equity, several simultaneous uses — not a menu of exclusive strategies. Hold-liquid is
        the empty productive stack (reserve only). Figures are paper estimates from sample fixture
        data.
      </p>
      <section className="metrics">
        <div className="metric">
          <div className="k">NAV</div>
          <div className="v">{data.formatted.nav}</div>
        </div>
        <div className="metric">
          <div className="k">Equity</div>
          <div className="v">{data.formatted.equity}</div>
        </div>
        <div className="metric">
          <div className="k">Debt</div>
          <div className="v">{data.formatted.debt}</div>
        </div>
        <div className="metric">
          <div className="k">Reserves</div>
          <div className="v">{data.formatted.reserves}</div>
        </div>
        <div className="metric">
          <div className="k">Health factor</div>
          <div className="v">{data.healthFactor ?? 'n/a'}</div>
        </div>
        <div className="metric">
          <div className="k">Hurdle</div>
          <div className="v">{data.formatted.hurdle}</div>
        </div>
        <div className="metric">
          <div className="k">Risk state</div>
          <div className={`v ${data.veto ? 'status-stop' : 'status-ok'}`}>{data.riskState}</div>
        </div>
        <div className="metric">
          <div className="k">Action</div>
          <div className={`v ${usesClass}`}>{data.recommendedAction}</div>
        </div>
      </section>
      <p className="note">{data.actionCopy}</p>
      <section className="panel">
        <h2>Uses of the same holdings</h2>
        <p className="note">{data.uses.note}</p>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Fair value</th>
              <th>Owner equity</th>
              <th>Borrowed</th>
              <th>Simultaneous uses</th>
            </tr>
          </thead>
          <tbody>
            {data.uses.assets.map((a) => (
              <tr key={a.holdingId}>
                <td>{a.symbol}</td>
                <td>{a.formattedValue}</td>
                <td>{a.ownerEquityUsd}</td>
                <td>{a.borrowedUsd}</td>
                <td>{a.uses.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Modelled stack legs (composer)</h2>
        <p className="note">
          {data.market.note} Consolidated net {str(stack['consolidatedNetApy'])}.{' '}
          {str(stack['stopReason'])}
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Leg</th>
              <th>Kind</th>
              <th>Income</th>
              <th>Cost</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={str(leg['id'])}>
                <td>{str(leg['order'])}</td>
                <td>{str(leg['label'])}</td>
                <td>{str(leg['kind'])}</td>
                <td>{str(leg['incomeUsd'])}</td>
                <td>{str(leg['financingUsd'])}</td>
                <td>{str(leg['estimatedNetUsd'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

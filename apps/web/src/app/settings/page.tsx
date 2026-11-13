import { d } from '@shadow-banking/core';
import { saveSettingsAction } from '@/app/actions';
import { Shell } from '@/components/shell';
import { getSettings } from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const identity = await requireViewer();
  const settings = await getSettings(identity.sub);
  const hurdlePct = d(settings.hurdle).mul(100).toString();
  const reservePct = d(settings.reserve_pct).mul(100).toString();

  return (
    <Shell
      title="Book settings"
      viewerName={identity.name}
      simulated={identity.simulated}
      sampleMarket
      path="/settings"
    >
      <p className="lede">
        Seed, hurdle, and reserve rate are stored per signed-in viewer. The hurdle is an annualized
        net bar for adding the next stack leg — not a promised return.
      </p>
      <form action={saveSettingsAction} className="panel">
        <h2>Parameters</h2>
        <div className="form-grid">
          <label>
            Seed (USD)
            <input name="seedUsd" defaultValue={settings.seed_usd} required />
          </label>
          <label>
            Hurdle (% annualized net)
            <input name="hurdlePct" defaultValue={hurdlePct} required />
          </label>
          <label>
            Reserve (% of seed)
            <input name="reservePct" defaultValue={reservePct} required />
          </label>
        </div>
        <div className="actions">
          <button type="submit">Save</button>
        </div>
      </form>
    </Shell>
  );
}

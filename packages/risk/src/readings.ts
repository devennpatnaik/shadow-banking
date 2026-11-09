import { d, formatPct, formatRatio, type Decimal } from '@shadow-banking/core';
import { hfBands, ldBands, maxLeverage } from './bands.js';
import {
  ASSET_CONC,
  DAILY_PNL,
  DRAWDOWN,
  LD_HEDGE,
  LST_DISCOUNT,
  MARGIN_RATIO,
  NET_CARRY,
  NET_DELTA,
  NETWORK_CONC,
  PROTOCOL_CONC,
  RC,
  type GovernorConfig,
} from './config.js';
import { rank, worse } from './state.js';
import type { RiskObservation, RiskState, RiskTrigger } from './types.js';

export interface Reading {
  metric: string;
  entryState: RiskState;
  latched: boolean;
  detail: string;
  /** True if this metric no longer holds `from` after hysteresis. */
  cleared: (from: RiskState) => boolean;
}

function belowEntry(value: Decimal, caution: Decimal, delev: Decimal, emerg: Decimal): RiskState {
  if (value.lt(emerg)) return 'Emergency';
  if (value.lt(delev)) return 'Deleveraging';
  if (value.lt(caution)) return 'Caution';
  return 'Normal';
}

function aboveEntry(value: Decimal, caution: Decimal, delev: Decimal, emerg: Decimal): RiskState {
  if (value.gte(emerg)) return 'Emergency';
  if (value.gte(delev)) return 'Deleveraging';
  if (value.gte(caution)) return 'Caution';
  return 'Normal';
}

function clearedBelow(value: Decimal, threshold: Decimal, hyst: Decimal): boolean {
  return value.gte(threshold.plus(hyst));
}

function clearedAbove(value: Decimal, threshold: Decimal, hyst: Decimal): boolean {
  return value.lte(threshold.minus(hyst));
}

function bandCleared(
  from: RiskState,
  value: Decimal,
  caution: Decimal,
  delev: Decimal,
  emerg: Decimal,
  hyst: Decimal,
  direction: 'below' | 'above',
): boolean {
  const check = direction === 'below' ? clearedBelow : clearedAbove;
  if (from === 'Emergency') return check(value, emerg, hyst);
  if (from === 'Deleveraging') return check(value, delev, hyst) && check(value, emerg, hyst);
  if (from === 'Caution') {
    return check(value, caution, hyst) && check(value, delev, hyst) && check(value, emerg, hyst);
  }
  return true;
}

function alwaysCleared(_from: RiskState): boolean {
  return true;
}

export function collectReadings(obs: RiskObservation, config: GovernorConfig): Reading[] {
  const readings: Reading[] = [];
  const bands = hfBands(obs.correlated, obs.smallPosition);
  const ld = ldBands(obs.smallPosition);
  const levCap = maxLeverage(obs.correlated);

  const pushHf = (
    metric: string,
    hf: Decimal | null,
    correlated: boolean,
    small: boolean,
    label: string,
  ): void => {
    if (hf === null) return;
    const b = hfBands(correlated, small);
    const entry = belowEntry(hf, b.caution, b.delev, b.emerg);
    const extra = small ? ', Aave v3.3 small-position +0.10 HF' : '';
    readings.push({
      metric,
      entryState: entry,
      latched: false,
      detail: `${label} HF ${hf.toFixed(4)} vs Caution ${b.caution.toFixed(2)} / Delev ${b.delev.toFixed(2)} / Emerg ${b.emerg.toFixed(2)} (${correlated ? 'correlated' : 'uncorrelated'}${extra})`,
      cleared: (from) => bandCleared(from, hf, b.caution, b.delev, b.emerg, b.hysteresis, 'below'),
    });
  };

  if (obs.positions.length > 0) {
    for (const p of obs.positions) {
      pushHf(
        `healthFactor:${p.positionId}`,
        p.healthFactor,
        p.correlated,
        p.smallPosition,
        p.venue,
      );
      if (p.liquidationDistance !== null && !p.correlated) {
        const entry = belowEntry(p.liquidationDistance, ld.caution, ld.delev, ld.emerg);
        readings.push({
          metric: `ldLend:${p.positionId}`,
          entryState: entry,
          latched: false,
          detail: `LD_lend ${formatPct(p.liquidationDistance)} vs Caution 37% / Delev 26% / Emerg 13%`,
          cleared: (from) =>
            bandCleared(
              from,
              p.liquidationDistance!,
              ld.caution,
              ld.delev,
              ld.emerg,
              ld.hysteresis,
              'below',
            ),
        });
      }
    }
  } else {
    pushHf('healthFactor', obs.healthFactor, obs.correlated, obs.smallPosition, 'consolidated');
    if (obs.liquidationDistance !== null && !obs.correlated) {
      const entry = belowEntry(obs.liquidationDistance, ld.caution, ld.delev, ld.emerg);
      readings.push({
        metric: 'ldLend',
        entryState: entry,
        latched: false,
        detail: `LD_lend ${formatPct(obs.liquidationDistance)}`,
        cleared: (from) =>
          bandCleared(
            from,
            obs.liquidationDistance!,
            ld.caution,
            ld.delev,
            ld.emerg,
            ld.hysteresis,
            'below',
          ),
      });
    }
  }

  if (obs.leverage !== null && obs.leverage.gt(levCap)) {
    readings.push({
      metric: 'leverage',
      entryState: 'Deleveraging',
      latched: false,
      detail: `gross leverage ${obs.leverage.toFixed(4)}x exceeds cap ${levCap.toFixed(1)}x`,
      cleared: (from) => (from === 'Emergency' ? true : obs.leverage!.lte(levCap)),
    });
  } else if (obs.leverage !== null) {
    readings.push({
      metric: 'leverage',
      entryState: 'Normal',
      latched: false,
      detail: `gross leverage ${formatRatio(obs.leverage)} (cap ${formatRatio(levCap)})`,
      cleared: alwaysCleared,
    });
  }

  const rc = obs.reserveRequiredUsd.gt(0) ? obs.reserveHeldUsd.div(obs.reserveRequiredUsd) : null;
  if (rc !== null) {
    const entry = belowEntry(rc, RC.caution, RC.delev, RC.emerg);
    readings.push({
      metric: 'reserveCoverage',
      entryState: entry,
      latched: false,
      detail: `RC ${rc.toFixed(4)} (held ${obs.reserveHeldUsd.toFixed(2)} / req ${obs.reserveRequiredUsd.toFixed(2)})`,
      cleared: (from) => {
        if (from === 'Normal') return true;
        if (rank(entry) < rank(from) && rc.gte(RC.caution)) return true;
        return rc.gte(RC.exit);
      },
    });
  }

  const daily = obs.dailyPnl;
  const dailyState = daily.lte(DAILY_PNL.emerg)
    ? 'Emergency'
    : daily.lte(DAILY_PNL.delev)
      ? 'Deleveraging'
      : daily.lte(DAILY_PNL.caution)
        ? 'Caution'
        : 'Normal';
  readings.push({
    metric: 'dailyPnl',
    entryState: dailyState,
    latched: dailyState === 'Emergency',
    detail: `daily P&L ${formatPct(daily)}${dailyState === 'Emergency' ? ' (hard limit, latched)' : ''}`,
    cleared: (from) => {
      if (from === 'Normal') return true;
      // Cleared only on a new UTC day (handled in the machine via memory); value-based fallback:
      return daily.gt(DAILY_PNL.caution);
    },
  });

  const dd = obs.drawdown;
  const ddState = dd.lte(DRAWDOWN.emerg)
    ? 'Emergency'
    : dd.lte(DRAWDOWN.delev)
      ? 'Deleveraging'
      : dd.lte(DRAWDOWN.caution)
        ? 'Caution'
        : 'Normal';
  readings.push({
    metric: 'drawdown',
    entryState: ddState,
    latched: ddState === 'Emergency',
    detail: `drawdown ${formatPct(dd)} from HWM${ddState === 'Emergency' ? ' (hard limit, latched)' : ''}`,
    cleared: (from) => {
      if (from === 'Emergency') return dd.gt(DRAWDOWN.emerg.plus(DRAWDOWN.hysteresisPts));
      if (from === 'Deleveraging') return dd.gt(DRAWDOWN.delev.plus(DRAWDOWN.hysteresisPts));
      if (from === 'Caution') return dd.gt(DRAWDOWN.caution.plus(DRAWDOWN.hysteresisPts));
      return true;
    },
  });

  if (obs.lstDiscount !== null) {
    const v = obs.lstDiscount;
    const entry = aboveEntry(v, LST_DISCOUNT.caution, LST_DISCOUNT.delev, LST_DISCOUNT.emerg);
    readings.push({
      metric: 'lstDiscount',
      entryState: entry,
      latched: false,
      detail: `LST exchange-rate discount ${formatPct(v)}`,
      cleared: (from) =>
        bandCleared(
          from,
          v,
          LST_DISCOUNT.caution,
          LST_DISCOUNT.delev,
          LST_DISCOUNT.emerg,
          LST_DISCOUNT.hysteresis,
          'above',
        ),
    });
  }

  if (obs.ldHedge !== null) {
    const v = obs.ldHedge;
    const entry = belowEntry(v, LD_HEDGE.caution, LD_HEDGE.delev, LD_HEDGE.emerg);
    readings.push({
      metric: 'ldHedge',
      entryState: entry,
      latched: false,
      detail: `LD_hedge ${formatPct(v)}`,
      cleared: (from) =>
        bandCleared(
          from,
          v,
          LD_HEDGE.caution,
          LD_HEDGE.delev,
          LD_HEDGE.emerg,
          LD_HEDGE.hysteresis,
          'below',
        ),
    });
  }

  if (obs.marginRatio !== null) {
    const v = obs.marginRatio;
    const entry = aboveEntry(v, MARGIN_RATIO.caution, MARGIN_RATIO.delev, MARGIN_RATIO.emerg);
    readings.push({
      metric: 'marginRatio',
      entryState: entry,
      latched: false,
      detail: `margin ratio ${formatPct(v)}`,
      cleared: (from) =>
        bandCleared(
          from,
          v,
          MARGIN_RATIO.caution,
          MARGIN_RATIO.delev,
          MARGIN_RATIO.emerg,
          MARGIN_RATIO.hysteresis,
          'above',
        ),
    });
  }

  if (obs.netDelta !== null) {
    const abs = obs.netDelta.abs();
    const hours = obs.netDeltaHours ?? d(0);
    let entry: RiskState = 'Normal';
    if (abs.gt(NET_DELTA.emerg)) entry = 'Emergency';
    else if (abs.gt(NET_DELTA.delev) && hours.gt(NET_DELTA.hours)) entry = 'Deleveraging';
    else if (abs.gt(NET_DELTA.caution) && hours.gt(NET_DELTA.hours)) entry = 'Caution';
    readings.push({
      metric: 'netDelta',
      entryState: entry,
      latched: false,
      detail: `net delta ${formatPct(obs.netDelta)} for ${hours.toFixed(1)}h`,
      cleared: (from) => (from === 'Normal' ? true : abs.lte(NET_DELTA.caution)),
    });
  }

  if (obs.netDirectional !== null) {
    const v = obs.netDirectional;
    const budget = config.exposureBudget;
    let entry: RiskState = 'Normal';
    if (v.gt(budget.plus('0.25'))) entry = 'Emergency';
    else if (v.gt(budget.plus('0.10'))) entry = 'Deleveraging';
    else if (v.gt(budget)) entry = 'Caution';
    readings.push({
      metric: 'netDirectional',
      entryState: entry,
      latched: false,
      detail: `net directional ${formatPct(v)} vs budget ${formatPct(budget)}`,
      cleared: (from) => (from === 'Normal' ? true : v.lte(budget.minus('0.05'))),
    });
  }

  if (obs.netCarry !== null) {
    const v = obs.netCarry;
    const hours = obs.netCarryHours ?? d(0);
    let entry: RiskState = 'Normal';
    if (v.lt(NET_CARRY.severeAnnual) || (v.lte(0) && hours.gte(NET_CARRY.negativeHoursDelev))) {
      entry = 'Deleveraging';
    } else if (v.lte(0) && (hours.gte(NET_CARRY.negativeHoursCaution) || hours.eq(0))) {
      // hours==0: paper snapshots without duration still Caution (CLI compatibility)
      entry = 'Caution';
    }
    readings.push({
      metric: 'netCarry',
      entryState: entry,
      latched: false,
      detail: `net carry ${formatPct(v)}`,
      cleared: (from) => (from === 'Normal' ? true : v.gt(obs.hurdle.div(2))),
    });
  }

  if (obs.borrowUtilization !== null) {
    const u = obs.borrowUtilization;
    let entry: RiskState = 'Normal';
    if (u.gte('0.97')) entry = 'Deleveraging';
    else if (u.gte('0.90')) entry = 'Caution';
    readings.push({
      metric: 'borrowUtilization',
      entryState: entry,
      latched: false,
      detail: `borrow utilization ${formatPct(u)}`,
      cleared: (from) => (from === 'Normal' ? true : u.lt('0.85')),
    });
  }

  if (obs.funding7d !== null) {
    const v = obs.funding7d;
    let entry: RiskState = 'Normal';
    if (v.lt(d('-0.10'))) entry = 'Deleveraging';
    else if (v.lt(0)) entry = 'Caution';
    readings.push({
      metric: 'funding7d',
      entryState: entry,
      latched: false,
      detail: `funding 7d avg ${formatPct(v)}`,
      cleared: (from) => (from === 'Normal' ? true : v.gt(0)),
    });
  }

  if (obs.stablecoinPegDeviation !== null) {
    const v = obs.stablecoinPegDeviation.abs();
    const entry = aboveEntry(v, d('0.005'), d('0.02'), d('0.05'));
    readings.push({
      metric: 'stablecoinPeg',
      entryState: entry,
      latched: false,
      detail: `stablecoin peg deviation ${formatPct(v)}`,
      cleared: (from) => (from === 'Normal' ? true : v.lte(d('0.003'))),
    });
  }

  if (obs.oracleDivergence !== null) {
    const v = obs.oracleDivergence.abs();
    const entry = aboveEntry(v, d('0.01'), d('0.03'), d('0.05'));
    readings.push({
      metric: 'oracle',
      entryState: entry,
      latched: false,
      detail: `oracle divergence ${formatPct(v)}`,
      cleared: (from) => (from === 'Normal' ? true : v.lt(d('0.01'))),
    });
  }

  if (obs.sequencerDownHours !== null && obs.sequencerDownHours.gt(0)) {
    const h = obs.sequencerDownHours;
    const hfCaution = obs.healthFactor !== null && obs.healthFactor.lt(bands.caution);
    let entry: RiskState = 'Caution';
    if (h.gte(1) && hfCaution) entry = 'Emergency';
    readings.push({
      metric: 'sequencer',
      entryState: entry,
      latched: false,
      detail: `L2 sequencer down ${h.toFixed(2)}h`,
      cleared: (from) => (from === 'Normal' ? true : h.eq(0)),
    });
  }

  if (obs.reserveFrozen) {
    readings.push({
      metric: 'protocolStatus',
      entryState: 'Deleveraging',
      latched: false,
      detail: 'lending reserve frozen/paused',
      cleared: alwaysCleared,
    });
  }

  if (obs.withdrawalLiquidityMultiple !== null) {
    const m = obs.withdrawalLiquidityMultiple;
    let entry: RiskState = 'Normal';
    if (m.lt(3)) entry = 'Deleveraging';
    else if (m.lt(10)) entry = 'Caution';
    readings.push({
      metric: 'withdrawalLiquidity',
      entryState: entry,
      latched: false,
      detail: `withdrawal liquidity ${m.toFixed(2)}× our supply`,
      cleared: (from) => (from === 'Normal' ? true : m.gte(15)),
    });
  }

  const concApplies = obs.envelopeUsd.gt(config.concentrationEnvelopeUsd);
  if (concApplies) {
    const proto = obs.concentration.protocolMaxShare;
    if (proto !== null) {
      let entry: RiskState = 'Normal';
      if (proto.gt(PROTOCOL_CONC.plus('0.10'))) entry = 'Deleveraging';
      else if (proto.gt(PROTOCOL_CONC)) entry = 'Caution';
      readings.push({
        metric: 'concentration.protocol',
        entryState: entry,
        latched: false,
        detail: `protocol ${obs.concentration.protocolId ?? '?'} ${formatPct(proto)} (limit 60% above $25k envelope)`,
        cleared: (from) => (from === 'Normal' ? true : proto.lte(PROTOCOL_CONC)),
      });
    }
    const net = obs.concentration.networkMaxShare;
    if (net !== null && net.gt(NETWORK_CONC)) {
      readings.push({
        metric: 'concentration.network',
        entryState: 'Caution',
        latched: false,
        detail: `network ${obs.concentration.networkId ?? '?'} ${formatPct(net)} (limit 80% above $25k)`,
        cleared: (from) => (from === 'Normal' ? true : net.lte(NETWORK_CONC)),
      });
    }
    const ast = obs.concentration.nonStableAssetMaxShare;
    if (ast !== null && ast.gt(ASSET_CONC)) {
      readings.push({
        metric: 'concentration.asset',
        entryState: 'Caution',
        latched: false,
        detail: `non-stable ${obs.concentration.nonStableAssetId ?? '?'} ${formatPct(ast)} (limit 70% above $25k)`,
        cleared: (from) => (from === 'Normal' ? true : ast.lte(ASSET_CONC)),
      });
    }
  }

  if (obs.dataQuality !== 'fresh') {
    readings.push({
      metric: 'dataQuality',
      entryState: 'Caution',
      latched: false,
      detail: `data quality ${obs.dataQuality}: fail closed on risk-increasing actions`,
      cleared: (from) => (from === 'Normal' ? true : obs.dataQuality === 'fresh'),
    });
  }

  if (config.killSwitch === 'unwind') {
    readings.push({
      metric: 'killSwitch',
      entryState: 'Emergency',
      latched: true,
      detail: 'kill switch: unwind (latched Emergency until human acknowledgement)',
      cleared: () => false,
    });
  } else if (config.killSwitch === 'halt' || config.killSwitch === 'pause') {
    readings.push({
      metric: 'killSwitch',
      entryState: 'Caution',
      latched: false,
      detail: `kill switch: ${config.killSwitch} (no new risk)`,
      cleared: (from) => from === 'Normal' || config.killSwitch === 'off',
    });
  }

  return readings;
}

export function entryStateFromReadings(readings: readonly Reading[]): RiskState {
  return readings.reduce<RiskState>((s, r) => worse(s, r.entryState), 'Normal');
}

export function triggersFromReadings(readings: readonly Reading[]): RiskTrigger[] {
  return readings
    .filter((r) => r.entryState !== 'Normal')
    .map((r) => {
      const t: RiskTrigger = { metric: r.metric, detail: r.detail, state: r.entryState };
      if (r.latched) t.latched = true;
      return t;
    });
}

export function allCleared(readings: readonly Reading[], from: RiskState): boolean {
  return readings.every((r) => r.cleared(from));
}

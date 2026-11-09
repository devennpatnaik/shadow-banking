import {
  balanceSheetReport,
  d,
  deployableCapital,
  formatMoney,
  formatPct,
  formatRatio,
  householdLiquidityRequirement,
  requiredLiquidityReserve,
  strategyReserve,
  toJsonNumber,
} from '@shadow-banking/core';
import { EXIT_ERROR, EXIT_OK, EXIT_VETO, type Io } from './io.js';
import { PAPER_ENVELOPE, jsonSafe, printJson, writeOut } from './json.js';
import { banner, kvTable } from './format.js';
import { DEFAULT_HURDLE } from './defaults.js';
import { loadBook, loadProfile, loadRiskInput } from './load.js';
import { cmdAccounting, cmdStrategy } from './engines.js';
import { cmdPaper } from './paper.js';
import { cmdExecution } from './execution.js';
import { USAGE, flagOn, flagValue, type ParsedArgs } from './parse.js';
import { actionCopy, evaluateGovernorSnapshot } from '@shadow-banking/risk';
import {
  PRESET_IDS,
  buildPreset,
  formatCompare,
  formatStress,
  formatTable,
  listPresets,
  loadSimInput,
  resultToJson,
  runDefaultStresses,
  simEnvelope,
  simulateLoop,
} from './sim.js';

export function cmdHelp(io: Io, json: boolean): number {
  if (json) {
    io.stdout.write(
      printJson({
        ...PAPER_ENVELOPE,
        ok: true,
        command: 'help',
        usage: USAGE.trim(),
        commands: [
          'status',
          'balance-sheet',
          'disclosures',
          'sim',
          'strategy',
          'accounting',
          'risk',
          'paper',
          'execution',
        ],
        exitCodes: { 0: 'ok', 1: 'error', 2: 'risk veto' },
      }),
    );
    return EXIT_OK;
  }
  io.stdout.write(`${USAGE}\n`);
  return EXIT_OK;
}

export function cmdBalanceSheet(io: Io, args: ParsedArgs): number {
  const path = flagValue(args.flags, '--book') ?? flagValue(args.flags, '--snapshot');
  const discPath = flagValue(args.flags, '--disclosure') ?? flagValue(args.flags, '--file');
  const { book, source } = loadBook(path);
  const { profile } = loadProfile(discPath);
  const reportBare = balanceSheetReport(book);
  const deployable = deployableCapital(profile, reportBare.reserveHeld);
  const req = requiredLiquidityReserve(profile, deployable.deployable);
  const report = balanceSheetReport(book, { reserveRequired: req.total });
  const payload = {
    ok: true,
    command: 'balance-sheet',
    source,
    engine: '@shadow-banking/core',
    asOf: report.asOf,
    currency: report.currency,
    nav: toJsonNumber(report.equity),
    equity: toJsonNumber(report.equity),
    debt: toJsonNumber(report.totalLiabilities),
    assets: toJsonNumber(report.totalAssets),
    leverage: toJsonNumber(report.capital.leverage),
    healthFactor: toJsonNumber(report.worstHealthFactor),
    reserves: {
      held: toJsonNumber(report.reserveHeld),
      required: toJsonNumber(report.reserveRequired),
      shortfall: toJsonNumber(report.reserveShortfall),
      byTier: {
        T0: toJsonNumber(report.liquidity.byTier.T0),
        T1: toJsonNumber(report.liquidity.byTier.T1),
        T2: toJsonNumber(report.liquidity.byTier.T2),
        T3: toJsonNumber(report.liquidity.byTier.T3),
      },
    },
    borrowingCapacity: toJsonNumber(report.borrowingCapacity),
    positions: report.positions.map((p) => ({
      id: p.positionId,
      venue: p.venue,
      eMode: p.eMode,
      healthFactor: toJsonNumber(p.healthFactor),
      liquidationDistance: toJsonNumber(p.liquidationDistance),
      collateral: toJsonNumber(p.collateralValue),
      debt: toJsonNumber(p.debt),
    })),
  };
  const text = [
    banner('Balance sheet (paper)', `source ${source}`),
    kvTable([
      ['NAV / equity', formatMoney(report.equity)],
      ['Assets', formatMoney(report.totalAssets)],
      ['Debt', formatMoney(report.totalLiabilities)],
      ['Leverage', formatRatio(report.capital.leverage)],
      ['Health factor', report.worstHealthFactor ? report.worstHealthFactor.toFixed(4) : 'n/a'],
      ['Reserves held', formatMoney(report.reserveHeld)],
      ['Reserves required', formatMoney(report.reserveRequired)],
      [
        'T0 / T1 / T2 / T3',
        `${formatMoney(report.liquidity.byTier.T0)} / ${formatMoney(report.liquidity.byTier.T1)} / ${formatMoney(report.liquidity.byTier.T2)} / ${formatMoney(report.liquidity.byTier.T3)}`,
      ],
    ]),
    '',
    'Read-only. Borrowed principal is not income.',
  ].join('\n');
  writeOut(io, args.json, payload, text);
  return EXIT_OK;
}

export function cmdDisclosures(io: Io, args: ParsedArgs): number {
  const path = flagValue(args.flags, '--file') ?? flagValue(args.flags, '--disclosure');
  const { profile, source } = loadProfile(path);
  const liquidRaw = flagValue(args.flags, '--liquid');
  const { book } = loadBook(flagValue(args.flags, '--book'));
  const report = balanceSheetReport(book);
  const liquidAmount = liquidRaw ? d(liquidRaw) : report.reserveHeld;
  const dep = deployableCapital(profile, liquidAmount, undefined, { hurdleApy: DEFAULT_HURDLE });
  const reserve = strategyReserve(dep.deployable, profile);
  const household = householdLiquidityRequirement(profile);
  const req = requiredLiquidityReserve(profile, dep.deployable);
  const payload = {
    ok: true,
    command: 'disclosures',
    source,
    engine: '@shadow-banking/core',
    currency: profile.currency,
    riskTolerance: profile.riskTolerance,
    horizonMonths: profile.horizonMonths,
    restrictions: {
      allowLeverage: profile.restrictions.allowLeverage,
      allowDerivatives: profile.restrictions.allowDerivatives,
      excludedAssetClasses: profile.restrictions.excludedAssetClasses,
      excludedNetworks: profile.restrictions.excludedNetworks,
      excludedProtocols: profile.restrictions.excludedProtocols,
    },
    household: {
      monthlyOutflow: toJsonNumber(household.monthlyOutflow),
      coverMonths: household.coverMonths,
      total: toJsonNumber(household.total),
    },
    deployable: toJsonNumber(dep.deployable),
    strategyReserve: {
      rate: toJsonNumber(reserve.rate),
      amount: toJsonNumber(reserve.amount),
      investable: toJsonNumber(reserve.investable),
    },
    requiredReserve: toJsonNumber(req.total),
    notes: [...dep.notes, ...reserve.notes],
    entireBankBalanceIsNotInvestable: true,
  };
  const text = [
    banner('Disclosures (paper)', `source ${source}`),
    kvTable([
      ['Risk tolerance', profile.riskTolerance],
      ['Horizon (months)', String(profile.horizonMonths)],
      ['Household reserve', formatMoney(household.total)],
      ['Liquid capital in', formatMoney(liquidAmount)],
      ['Deployable', formatMoney(dep.deployable)],
      ['Strategy reserve', `${formatPct(reserve.rate)} → ${formatMoney(reserve.amount)}`],
      ['Investable after reserve', formatMoney(reserve.investable)],
    ]),
    '',
    'The entire bank balance is never treated as investable.',
    ...dep.notes,
  ].join('\n');
  writeOut(io, args.json, payload, text);
  return EXIT_OK;
}

export function cmdSim(io: Io, args: ParsedArgs): number {
  const sub = args.rest[0];
  if (sub === 'presets') {
    const rows = listPresets();
    const payload = { ok: true, command: 'sim', subcommand: 'presets', presets: rows };
    const text = [
      banner('Simulator presets'),
      ...rows.map((p) => `${p.id}\t${p.snapshotDate}\t${p.label}`),
      '',
      `Known: ${PRESET_IDS.join(', ')}`,
    ].join('\n');
    writeOut(io, args.json, payload, text);
    return EXIT_OK;
  }
  if (sub === 'compare') {
    const seed = d(flagValue(args.flags, '--seed') ?? '1000');
    const ids = [
      'aave-v3-ethereum-wsteth-eth-emode',
      'aave-v3-arbitrum-wsteth-eth-emode',
      'aave-v3-base-wsteth-eth-emode',
    ] as const;
    const results = ids.map((id) => ({
      name: id,
      result: simulateLoop(buildPreset(id, { seedUsd: seed, loops: { kind: 'optimal' } })),
      looped: simulateLoop(buildPreset(id, { seedUsd: seed, loops: { kind: 'fixed', loops: 1 } })),
    }));
    const payload = {
      ok: true,
      command: 'sim',
      subcommand: 'compare',
      noDeployment: results.every((r) => !r.result.recommendation.clearsHurdle),
      recommendedAction: 'hold_liquid',
      comparisons: results.map((r) => ({
        name: r.name,
        recommendation: resultToJson(r.result)['recommendation'],
      })),
    };
    writeOut(io, args.json, payload, formatCompare(results).trimEnd());
    return EXIT_OK;
  }
  if (sub === 'stress') {
    const input = loadSimInput(args.flags);
    const result = simulateLoop(input);
    const stresses = runDefaultStresses(input);
    const payload = {
      ...simEnvelope(result, { subcommand: 'stress' }),
      stresses: jsonSafe(stresses),
    };
    const text = `${formatTable(result)}\n\n${formatStress(stresses)}`;
    writeOut(io, args.json, payload, text.trimEnd());
    return EXIT_OK;
  }
  // default / "run"
  const input = loadSimInput(args.flags);
  const result = simulateLoop(input);
  const payload = simEnvelope(result, {
    subcommand: sub === 'run' || sub === undefined ? 'run' : sub,
  });
  const text = formatTable(result);
  writeOut(io, args.json, payload, text.trimEnd());
  return EXIT_OK;
}

export function cmdRisk(io: Io, args: ParsedArgs): number {
  const { snapshot, source } = loadRiskInput(
    flagValue(args.flags, '--book'),
    flagValue(args.flags, '--snapshot'),
    flagValue(args.flags, '--disclosure') ?? flagValue(args.flags, '--file'),
  );
  const hurdle = flagValue(args.flags, '--hurdle');
  if (hurdle) snapshot.hurdle = d(hurdle);
  const noSim = flagOn(args.flags, '--no-sim');
  let noDeployment = true;
  if (!noSim) {
    try {
      const rec = simulateLoop(loadSimInput(args.flags)).recommendation;
      noDeployment = rec.action === 'hold-liquid' || !rec.clearsHurdle;
    } catch {
      noDeployment = true;
    }
  }
  const evaln = evaluateGovernorSnapshot(snapshot, { noDeployment });
  const payload = {
    ok: !evaln.veto,
    command: 'risk',
    source,
    engine: '@shadow-banking/risk',
    spec: 'docs/risk-governor.md',
    state: evaln.state,
    veto: evaln.veto,
    recommendedAction: evaln.recommendedAction,
    noDeployment: evaln.noDeployment,
    hurdle: toJsonNumber(evaln.hurdle),
    metrics: {
      nav: toJsonNumber(evaln.metrics.navUsd),
      equity: toJsonNumber(evaln.metrics.equityUsd),
      debt: toJsonNumber(evaln.metrics.debtUsd),
      reserves: toJsonNumber(evaln.metrics.reserveHeldUsd),
      reserveRequired: toJsonNumber(evaln.metrics.reserveRequiredUsd),
      reserveCoverage: toJsonNumber(evaln.metrics.reserveCoverage),
      healthFactor: toJsonNumber(evaln.metrics.healthFactor),
      leverage: toJsonNumber(evaln.metrics.leverage),
      correlated: evaln.metrics.correlated,
      smallPosition: evaln.metrics.smallPosition,
      drawdown: toJsonNumber(evaln.metrics.drawdown),
      dailyPnl: toJsonNumber(evaln.metrics.dailyPnl),
    },
    triggers: evaln.triggers,
    limits: {
      maxLeverage: toJsonNumber(evaln.limits.maxLeverage),
      hfCaution: toJsonNumber(evaln.limits.hfCaution),
      hfDeleveraging: toJsonNumber(evaln.limits.hfDeleveraging),
      hfEmergency: toJsonNumber(evaln.limits.hfEmergency),
    },
    notes: evaln.notes,
    action: actionCopy(evaln.recommendedAction),
  };
  const text = [
    banner(`Risk governor  ·  ${evaln.state}${evaln.veto ? '  ·  VETO' : ''}`, source),
    kvTable([
      ['State', evaln.state],
      ['Veto', evaln.veto ? 'YES (exit 2)' : 'no'],
      ['NAV', formatMoney(evaln.metrics.navUsd)],
      ['Equity', formatMoney(evaln.metrics.equityUsd)],
      ['Debt', formatMoney(evaln.metrics.debtUsd)],
      ['HF', evaln.metrics.healthFactor ? evaln.metrics.healthFactor.toFixed(4) : 'n/a'],
      [
        'Reserves',
        `${formatMoney(evaln.metrics.reserveHeldUsd)} / req ${formatMoney(evaln.metrics.reserveRequiredUsd)}`,
      ],
      ['Hurdle', formatPct(evaln.hurdle)],
      ['Action', evaln.recommendedAction],
      ['noDeployment', String(evaln.noDeployment)],
    ]),
    '',
    actionCopy(evaln.recommendedAction),
    ...evaln.triggers.map((t) => `  - [${t.state}] ${t.metric}: ${t.detail}`),
  ].join('\n');
  writeOut(io, args.json, payload, text);
  return evaln.veto ? EXIT_VETO : EXIT_OK;
}

export function cmdStatus(io: Io, args: ParsedArgs): number {
  const { snapshot, source, book } = loadRiskInput(
    flagValue(args.flags, '--book'),
    flagValue(args.flags, '--snapshot'),
    flagValue(args.flags, '--disclosure') ?? flagValue(args.flags, '--file'),
  );
  let simAction: string | null = null;
  let clearsHurdle = false;
  let noDeployment = true;
  if (!flagOn(args.flags, '--no-sim')) {
    try {
      const rec = simulateLoop(loadSimInput(args.flags)).recommendation;
      simAction = rec.action;
      clearsHurdle = rec.clearsHurdle;
      noDeployment = rec.action === 'hold-liquid' || !rec.clearsHurdle;
    } catch {
      noDeployment = true;
    }
  }
  const evaln = evaluateGovernorSnapshot(snapshot, { noDeployment });
  const payload = {
    ok: !evaln.veto,
    command: 'status',
    engine: '@shadow-banking/risk',
    source,
    asOf: snapshot.asOf,
    nav: toJsonNumber(evaln.metrics.navUsd),
    equity: toJsonNumber(evaln.metrics.equityUsd),
    debt: toJsonNumber(evaln.metrics.debtUsd),
    reserves: toJsonNumber(evaln.metrics.reserveHeldUsd),
    reserveRequired: toJsonNumber(evaln.metrics.reserveRequiredUsd),
    healthFactor: toJsonNumber(evaln.metrics.healthFactor),
    hurdle: toJsonNumber(evaln.hurdle),
    riskState: evaln.state,
    veto: evaln.veto,
    recommendedAction: evaln.recommendedAction,
    noDeployment: evaln.noDeployment,
    clearsHurdle,
    simulatorAction: simAction,
    bookPresent: Boolean(book),
    action: actionCopy(evaln.recommendedAction),
    assistedExecution: {
      status: 'propose_approve_only',
      phase: 5,
      hooks: ['propose', 'show', 'approve', 'reject'],
      broadcast: false,
      note: 'Phase 5: propose+approve only. No live txs. pnpm execution / pnpm sb execution. Broadcast refused.',
    },
  };
  const text = [
    banner('Shadow bank status (paper / read-only)'),
    kvTable([
      ['NAV', formatMoney(evaln.metrics.navUsd)],
      ['Equity', formatMoney(evaln.metrics.equityUsd)],
      ['Debt', formatMoney(evaln.metrics.debtUsd)],
      ['Reserves', formatMoney(evaln.metrics.reserveHeldUsd)],
      ['HF', evaln.metrics.healthFactor ? evaln.metrics.healthFactor.toFixed(4) : 'n/a'],
      ['Hurdle', formatPct(evaln.hurdle)],
      ['Risk state', evaln.veto ? `${evaln.state} (VETO)` : evaln.state],
      ['Action', evaln.recommendedAction],
      ['noDeployment', String(evaln.noDeployment)],
    ]),
    '',
    actionCopy(evaln.recommendedAction),
    'Phase 5: propose + approve only. Never execute live transactions. No signing keys in this interface.',
  ].join('\n');
  writeOut(io, args.json, payload, text);
  return evaln.veto ? EXIT_VETO : EXIT_OK;
}

export function dispatch(io: Io, args: ParsedArgs): number {
  if (args.errors.length > 0) {
    const msg = args.errors.join('\n');
    if (args.json) {
      io.stderr.write(
        printJson({ ...PAPER_ENVELOPE, ok: false, command: args.command, error: msg }),
      );
    } else {
      io.stderr.write(`${msg}\n\n${USAGE}\n`);
    }
    return EXIT_ERROR;
  }
  if (args.help || args.command === 'help' || args.command === null) {
    return cmdHelp(io, args.json);
  }
  switch (args.command) {
    case 'balance-sheet':
      return cmdBalanceSheet(io, args);
    case 'disclosures':
      return cmdDisclosures(io, args);
    case 'sim':
      return cmdSim(io, args);
    case 'strategy':
      return cmdStrategy(io, args);
    case 'accounting':
      return cmdAccounting(io, args);
    case 'risk':
      return cmdRisk(io, args);
    case 'status':
      return cmdStatus(io, args);
    case 'paper':
      return cmdPaper(io, args);
    case 'execution':
      return cmdExecution(io, args);
    default: {
      const _never: never = args.command;
      io.stderr.write(`unhandled command ${String(_never)}\n`);
      return EXIT_ERROR;
    }
  }
}

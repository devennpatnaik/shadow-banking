import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { d, type Account, type Decimal } from '@shadow-banking/core';
import { ACCOUNT_IDS, type AccountId } from './chart.js';
import { Ledger, type LedgerState } from './ledger.js';
import type {
  BorrowLot,
  HoldingLot,
  InstrumentDef,
  JournalEntry,
  JournalLine,
  LedgerMeta,
  NavSnapshot,
} from './types.js';
import { ledgerToJson } from './serialize.js';

export const LEDGER_SCHEMA_VERSION = 1;
export const LEDGER_KIND = 'shadow-banking-ledger';

function asString(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new Error(`${path} must be a string`);
  return v;
}

function asDec(v: unknown, path: string): Decimal {
  if (typeof v === 'number' && Number.isFinite(v)) return d(v);
  if (typeof v === 'string') return d(v);
  throw new Error(`${path} must be a decimal string`);
}

function optDec(v: unknown): Decimal | undefined {
  if (v === null || v === undefined) return undefined;
  return asDec(v, 'decimal');
}

function asBool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${path} must be boolean`);
  return v;
}

function parseLine(raw: unknown): JournalLine {
  if (typeof raw !== 'object' || raw === null) throw new Error('line must be an object');
  const o = raw as Record<string, unknown>;
  const line: JournalLine = {
    account: asString(o['account'], 'line.account') as AccountId,
    side: asString(o['side'], 'line.side') as JournalLine['side'],
    amount: asDec(o['amount'], 'line.amount'),
  };
  const quantity = optDec(o['quantity']);
  if (quantity) line.quantity = quantity;
  if (typeof o['instrumentId'] === 'string') line.instrumentId = o['instrumentId'];
  if (typeof o['venueAccountId'] === 'string') line.venueAccountId = o['venueAccountId'];
  if (typeof o['holdingId'] === 'string') line.holdingId = o['holdingId'];
  if (typeof o['memo'] === 'string') line.memo = o['memo'];
  return line;
}

function parseEntry(raw: unknown): JournalEntry {
  if (typeof raw !== 'object' || raw === null) throw new Error('entry must be an object');
  const o = raw as Record<string, unknown>;
  const linesRaw = o['lines'];
  if (!Array.isArray(linesRaw)) throw new Error('entry.lines must be an array');
  const entry: JournalEntry = {
    id: asString(o['id'], 'entry.id'),
    at: asString(o['at'], 'entry.at'),
    category: asString(o['category'], 'entry.category') as JournalEntry['category'],
    kind: asString(o['kind'], 'entry.kind') as JournalEntry['kind'],
    source: asString(o['source'], 'entry.source'),
    memo: asString(o['memo'], 'entry.memo'),
    lines: linesRaw.map(parseLine),
  };
  const pm = optDec(o['priceMark']);
  if (pm) entry.priceMark = pm;
  if (typeof o['instrumentId'] === 'string') entry.instrumentId = o['instrumentId'];
  if (typeof o['intentHash'] === 'string') entry.intentHash = o['intentHash'];
  return entry;
}

function parseInstrument(raw: unknown): InstrumentDef {
  if (typeof raw !== 'object' || raw === null) throw new Error('instrument must be an object');
  const o = raw as Record<string, unknown>;
  const inst: InstrumentDef = {
    id: asString(o['id'], 'instrument.id'),
    symbol: asString(o['symbol'], 'instrument.symbol'),
    assetClass: asString(o['assetClass'], 'instrument.assetClass') as InstrumentDef['assetClass'],
    liquidityTier: asString(
      o['liquidityTier'],
      'instrument.liquidityTier',
    ) as InstrumentDef['liquidityTier'],
    isStable: asBool(o['isStable'], 'instrument.isStable'),
    isYieldBearing: asBool(o['isYieldBearing'], 'instrument.isYieldBearing'),
  };
  if (typeof o['network'] === 'string') inst.network = o['network'];
  const cp = o['collateralParams'];
  if (cp && typeof cp === 'object') {
    const c = cp as Record<string, unknown>;
    inst.collateralParams = {
      ltv: asDec(c['ltv'], 'ltv'),
      liquidationThreshold: asDec(c['liquidationThreshold'], 'liquidationThreshold'),
      liquidationBonus: asDec(c['liquidationBonus'], 'liquidationBonus'),
      eMode: asBool(c['eMode'], 'eMode'),
      ...(typeof c['eModeCategory'] === 'string' ? { eModeCategory: c['eModeCategory'] } : {}),
    };
  }
  return inst;
}

function parseMeta(raw: unknown): LedgerMeta {
  if (typeof raw !== 'object' || raw === null) throw new Error('meta must be an object');
  const o = raw as Record<string, unknown>;
  const instrumentsRaw = o['instruments'];
  if (typeof instrumentsRaw !== 'object' || instrumentsRaw === null) {
    throw new Error('meta.instruments must be an object');
  }
  const instruments: Record<string, InstrumentDef> = {};
  for (const [id, inst] of Object.entries(instrumentsRaw as Record<string, unknown>)) {
    instruments[id] = parseInstrument(inst);
  }
  const accounts = o['accounts'];
  if (!Array.isArray(accounts)) throw new Error('meta.accounts must be an array');
  return {
    currency: asString(o['currency'], 'meta.currency'),
    createdAt: asString(o['createdAt'], 'meta.createdAt'),
    label: asString(o['label'], 'meta.label'),
    defaultHurdleApy: asDec(o['defaultHurdleApy'], 'meta.defaultHurdleApy'),
    accounts: accounts as Account[],
    instruments,
  };
}

function parseHolding(raw: unknown): HoldingLot {
  const o = raw as Record<string, unknown>;
  const h: HoldingLot = {
    id: asString(o['id'], 'holding.id'),
    venueAccountId: asString(o['venueAccountId'], 'holding.venueAccountId'),
    instrumentId: asString(o['instrumentId'], 'holding.instrumentId'),
    quantity: asDec(o['quantity'], 'holding.quantity'),
    costBasisUsd: asDec(o['costBasisUsd'], 'holding.costBasisUsd'),
    role: asString(o['role'], 'holding.role') as HoldingLot['role'],
  };
  if (typeof o['collateralPositionId'] === 'string')
    h.collateralPositionId = o['collateralPositionId'];
  return h;
}

function parseBorrow(raw: unknown): BorrowLot {
  const o = raw as Record<string, unknown>;
  const b: BorrowLot = {
    id: asString(o['id'], 'borrow.id'),
    venueAccountId: asString(o['venueAccountId'], 'borrow.venueAccountId'),
    instrumentId: asString(o['instrumentId'], 'borrow.instrumentId'),
    principal: asDec(o['principal'], 'borrow.principal'),
    accruedInterest: asDec(o['accruedInterest'], 'borrow.accruedInterest'),
    apr: asDec(o['apr'], 'borrow.apr'),
    priceMark: asDec(o['priceMark'], 'borrow.priceMark'),
  };
  if (typeof o['venue'] === 'string') b.venue = o['venue'];
  return b;
}

function parseSnapshot(raw: unknown): NavSnapshot {
  const o = raw as Record<string, unknown>;
  return {
    at: asString(o['at'], 'snap.at'),
    entryId: asString(o['entryId'], 'snap.entryId'),
    nav: asDec(o['nav'], 'snap.nav'),
    shares: asDec(o['shares'], 'snap.shares'),
    unitNav: asDec(o['unitNav'], 'snap.unitNav'),
    grossAssets: asDec(o['grossAssets'], 'snap.grossAssets'),
    totalDebt: asDec(o['totalDebt'], 'snap.totalDebt'),
    deployed: asDec(o['deployed'], 'snap.deployed'),
    liquidReserves: asDec(o['liquidReserves'], 'snap.liquidReserves'),
    netPnl: asDec(o['netPnl'], 'snap.netPnl'),
    realizedPnl: asDec(o['realizedPnl'], 'snap.realizedPnl'),
    unrealizedPnl: asDec(o['unrealizedPnl'], 'snap.unrealizedPnl'),
  };
}

export function documentToState(doc: unknown): LedgerState {
  if (typeof doc !== 'object' || doc === null) throw new Error('ledger document must be an object');
  const o = doc as Record<string, unknown>;
  if (o['kind'] !== LEDGER_KIND) throw new Error(`expected kind ${LEDGER_KIND}`);
  if (o['schemaVersion'] !== LEDGER_SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion ${String(o['schemaVersion'])}`);
  }
  const stateRaw = o['state'];
  if (typeof stateRaw !== 'object' || stateRaw === null)
    throw new Error('document.state is required');
  const s = stateRaw as Record<string, unknown>;
  const rawIn = s['raw'];
  if (typeof rawIn !== 'object' || rawIn === null) throw new Error('state.raw is required');
  const raw = {} as Record<AccountId, Decimal>;
  for (const id of ACCOUNT_IDS) {
    raw[id] = asDec((rawIn as Record<string, unknown>)[id] ?? '0', `raw.${id}`);
  }
  const priceIn = s['priceMarks'];
  if (typeof priceIn !== 'object' || priceIn === null)
    throw new Error('state.priceMarks is required');
  const priceMarks: Record<string, Decimal> = {};
  for (const [k, v] of Object.entries(priceIn as Record<string, unknown>)) {
    priceMarks[k] = asDec(v, `priceMarks.${k}`);
  }
  const entries = s['entries'];
  const holdings = s['holdings'];
  const borrows = s['borrows'];
  const snapshots = s['snapshots'];
  if (
    !Array.isArray(entries) ||
    !Array.isArray(holdings) ||
    !Array.isArray(borrows) ||
    !Array.isArray(snapshots)
  ) {
    throw new Error('state.entries/holdings/borrows/snapshots must be arrays');
  }
  return {
    meta: parseMeta(s['meta']),
    entries: entries.map(parseEntry),
    holdings: holdings.map(parseHolding),
    borrows: borrows.map(parseBorrow),
    priceMarks,
    raw,
    shares: asDec(s['shares'], 'shares'),
    snapshots: snapshots.map(parseSnapshot),
  };
}

function decStr(v: Decimal): string {
  return v.toString();
}

export function stateToDocument(ledger: Ledger): Record<string, unknown> {
  const state = ledger.toState();
  const raw: Record<string, string> = {};
  for (const id of ACCOUNT_IDS) raw[id] = decStr(state.raw[id] ?? d(0));
  const priceMarks: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.priceMarks)) priceMarks[k] = decStr(v);
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    kind: LEDGER_KIND,
    format:
      'Single JSON document (or a directory of ledger.json + journal.jsonl + meta.json). Amounts are decimal strings. Journal is the audit trail; state is the reconstructed book.',
    display: ledgerToJson(ledger),
    state: {
      meta: {
        currency: state.meta.currency,
        createdAt: state.meta.createdAt,
        label: state.meta.label,
        defaultHurdleApy: decStr(state.meta.defaultHurdleApy),
        accounts: state.meta.accounts,
        instruments: Object.fromEntries(
          Object.entries(state.meta.instruments).map(([id, inst]) => [
            id,
            {
              id: inst.id,
              symbol: inst.symbol,
              assetClass: inst.assetClass,
              ...(inst.network ? { network: inst.network } : {}),
              liquidityTier: inst.liquidityTier,
              isStable: inst.isStable,
              isYieldBearing: inst.isYieldBearing,
              ...(inst.collateralParams
                ? {
                    collateralParams: {
                      ltv: decStr(inst.collateralParams.ltv),
                      liquidationThreshold: decStr(inst.collateralParams.liquidationThreshold),
                      liquidationBonus: decStr(inst.collateralParams.liquidationBonus),
                      eMode: inst.collateralParams.eMode,
                      ...(inst.collateralParams.eModeCategory
                        ? { eModeCategory: inst.collateralParams.eModeCategory }
                        : {}),
                    },
                  }
                : {}),
            },
          ]),
        ),
      },
      entries: state.entries.map((e) => ({
        id: e.id,
        at: e.at,
        category: e.category,
        kind: e.kind,
        source: e.source,
        memo: e.memo,
        lines: e.lines.map((l) => ({
          account: l.account,
          side: l.side,
          amount: decStr(l.amount),
          ...(l.quantity ? { quantity: decStr(l.quantity) } : {}),
          ...(l.instrumentId ? { instrumentId: l.instrumentId } : {}),
          ...(l.venueAccountId ? { venueAccountId: l.venueAccountId } : {}),
          ...(l.holdingId ? { holdingId: l.holdingId } : {}),
          ...(l.memo ? { memo: l.memo } : {}),
        })),
        ...(e.priceMark ? { priceMark: decStr(e.priceMark) } : {}),
        ...(e.instrumentId ? { instrumentId: e.instrumentId } : {}),
        ...(e.intentHash ? { intentHash: e.intentHash } : {}),
      })),
      holdings: state.holdings.map((h) => ({
        id: h.id,
        venueAccountId: h.venueAccountId,
        instrumentId: h.instrumentId,
        quantity: decStr(h.quantity),
        costBasisUsd: decStr(h.costBasisUsd),
        role: h.role,
        ...(h.collateralPositionId ? { collateralPositionId: h.collateralPositionId } : {}),
      })),
      borrows: state.borrows.map((b) => ({
        id: b.id,
        venueAccountId: b.venueAccountId,
        instrumentId: b.instrumentId,
        principal: decStr(b.principal),
        accruedInterest: decStr(b.accruedInterest),
        apr: decStr(b.apr),
        priceMark: decStr(b.priceMark),
        ...(b.venue ? { venue: b.venue } : {}),
      })),
      priceMarks,
      raw,
      shares: decStr(state.shares),
      snapshots: state.snapshots.map((s) => ({
        at: s.at,
        entryId: s.entryId,
        nav: decStr(s.nav),
        shares: decStr(s.shares),
        unitNav: decStr(s.unitNav),
        grossAssets: decStr(s.grossAssets),
        totalDebt: decStr(s.totalDebt),
        deployed: decStr(s.deployed),
        liquidReserves: decStr(s.liquidReserves),
        netPnl: decStr(s.netPnl),
        realizedPnl: decStr(s.realizedPnl),
        unrealizedPnl: decStr(s.unrealizedPnl),
      })),
    },
  };
}

export function saveLedger(ledger: Ledger, path: string): string {
  const target = resolve(path);
  const doc = stateToDocument(ledger);
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  const isDir = !target.endsWith('.json');
  if (isDir) {
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'ledger.json'), json);
    writeFileSync(
      join(target, 'meta.json'),
      `${JSON.stringify(doc['state'] && (doc['state'] as { meta: unknown }).meta, null, 2)}\n`,
    );
    const entries = (doc['state'] as { entries: unknown[] }).entries;
    writeFileSync(
      join(target, 'journal.jsonl'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
    return join(target, 'ledger.json');
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  return target;
}

export function loadLedger(path: string): Ledger {
  const target = resolve(path);
  let file = target;
  if (existsSync(target) && statSync(target).isDirectory()) {
    file = join(target, 'ledger.json');
  }
  const doc = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  return Ledger.fromState(documentToState(doc));
}

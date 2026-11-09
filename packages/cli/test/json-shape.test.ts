import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXIT_OK } from '../src/io.js';
import { capture, parseStdoutJson } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const stressed = join(here, 'fixtures/stressed-snapshot.json');

const ENVELOPE = {
  paper: true,
  execution: 'forbidden',
  phase: '1-4',
  signingKeys: false,
  liveTransactions: false,
};

function expectEnvelope(json: Record<string, unknown>, command: string): void {
  expect(json).toMatchObject({ ...ENVELOPE, command });
  expect(typeof json['ok']).toBe('boolean');
}

describe('JSON shapes', () => {
  it('status --json has the consolidated one-screen fields', () => {
    const r = capture(['status', '--json']);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expectEnvelope(json, 'status');
    for (const key of [
      'nav',
      'equity',
      'debt',
      'reserves',
      'healthFactor',
      'hurdle',
      'riskState',
      'recommendedAction',
      'noDeployment',
      'veto',
      'action',
    ]) {
      expect(json).toHaveProperty(key);
    }
    expect(json['hurdle']).toBe('0.1');
    expect(json['nav']).toBe('1000');
    expect(json['equity']).toBe('1000');
    expect(json['debt']).toBe('0');
    expect(json['healthFactor']).toBeNull();
    expect(json['noDeployment']).toBe(true);
    expect(json['recommendedAction']).toBe('hold_liquid');
    expect(json['riskState']).toBe('Normal');
    expect(json['assistedExecution']).toMatchObject({
      status: 'not_implemented',
      earliestPhase: 5,
    });
  });

  it('balance-sheet --json wraps core report fields', () => {
    const r = capture(['balance-sheet', '--json']);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expectEnvelope(json, 'balance-sheet');
    expect(json['engine']).toBe('@shadow-banking/core');
    expect(json['nav']).toBe('1000');
    const reserves = json['reserves'] as Record<string, unknown>;
    expect(reserves['held']).toBe('1000');
    expect(Array.isArray(json['positions'])).toBe(true);
  });

  it('disclosures --json never treats the whole balance as investable', () => {
    const r = capture(['disclosures', '--json']);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expectEnvelope(json, 'disclosures');
    expect(json['entireBankBalanceIsNotInvestable']).toBe(true);
    expect(json['riskTolerance']).toBe('conservative');
  });

  it('sim --json includes recommendation and noDeployment', () => {
    const r = capture([
      'sim',
      '--json',
      '--preset',
      'aave-v3-ethereum-wsteth-eth-emode',
      '--seed',
      '1000',
    ]);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expectEnvelope(json, 'sim');
    expect(json['source']).toBe('@shadow-banking/simulator');
    expect(json['figures']).toBe('estimates');
    expect(typeof json['noDeployment']).toBe('boolean');
    const result = json['result'] as Record<string, unknown>;
    const rec = result['recommendation'] as Record<string, unknown>;
    expect(rec).toHaveProperty('clearsHurdle');
    expect(rec).toHaveProperty('action');
    expect(rec).toHaveProperty('hurdleApy');
  });

  it('strategy and accounting wrap the real packages', () => {
    const strategy = parseStdoutJson((capture(['strategy', '--json'])).stdout);
    const accounting = parseStdoutJson((capture(['accounting', '--json'])).stdout);
    expectEnvelope(strategy, 'strategy');
    expectEnvelope(accounting, 'accounting');
    expect(strategy['stub']).toBe(false);
    expect(accounting['stub']).toBe(false);
    expect(strategy['source']).toBe('@shadow-banking/strategy');
    expect(accounting['source']).toBe('@shadow-banking/accounting');
    expect(strategy['noDeployment']).toBe(true);
    expect(strategy['recommendedAction']).toBe('hold_liquid');
    expect(accounting['nav']).toBeTruthy();
  });

  it('risk --json on the default paper book is Normal / no veto', () => {
    const r = capture(['risk', '--json', '--no-sim']);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expectEnvelope(json, 'risk');
    expect(json['state']).toBe('Normal');
    expect(json['veto']).toBe(false);
    expect(json['metrics']).toEqual(
      expect.objectContaining({
        nav: '1000',
        debt: '0',
        healthFactor: null,
      }),
    );
  });

  it('risk --json stressed snapshot has veto fields', () => {
    const r = capture(['risk', '--json', '--snapshot', stressed, '--no-sim']);
    const json = parseStdoutJson(r.stdout);
    expect(json['command']).toBe('risk');
    expect(json['veto']).toBe(true);
    expect(json['recommendedAction']).toBe('unwind');
    expect(Array.isArray(json['triggers'])).toBe(true);
    expect((json['triggers'] as unknown[]).length).toBeGreaterThan(0);
  });
});

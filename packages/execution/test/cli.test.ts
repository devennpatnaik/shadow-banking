import { describe, expect, it } from 'vitest';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_VETO,
  PHASE5_ENVELOPE,
  PHASE6_BROADCAST_ENV,
} from '../src/envelope.js';
import { applyApprove, applyReject } from '../src/approve.js';
import { BroadcastRefused, refuseBroadcast } from '../src/broadcast.js';
import { capture, parseStdoutJson, tmpDir } from './helpers.js';

describe('pnpm execution CLI', () => {
  it('propose hold-liquid writes a draft JSON proposal', async () => {
    const dir = tmpDir();
    const r = await capture(['propose', '--json', '--preset', 'hold-liquid', '--dir', dir]);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expect(json).toMatchObject({
      ...PHASE5_ENVELOPE,
      command: 'propose',
      status: 'draft',
      veto: false,
      recommendedAction: 'hold_liquid',
      noDeployment: true,
    });
    expect(json['signingKeys']).toBe(false);
    expect(json['liveTransactions']).toBe(false);
    const actions = json['actions'] as Record<string, unknown>[];
    expect(actions[0]?.['functionName']).toBe('hold');
    expect(actions[0]?.['calldata']).toBeNull();
    const accounting = json['accounting'] as { pre: { nav: string }; post: { nav: string } };
    expect(accounting.pre.nav).toBe(accounting.post.nav);
    const unwind = json['unwind'] as { steps: unknown[] };
    expect(unwind.steps).toEqual([]);
  });

  it('propose loop-step with --net 0.12 constructs supply/borrow', async () => {
    const dir = tmpDir();
    const r = await capture([
      'propose',
      '--json',
      '--preset',
      'loop-step',
      '--net',
      '0.12',
      '--dir',
      dir,
    ]);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expect(json['status']).toBe('draft');
    expect(json['veto']).toBe(false);
    const actions = json['actions'] as { functionName: string; calldata: unknown }[];
    expect(actions.map((a) => a.functionName)).toEqual(['approve', 'supply', 'borrow']);
    expect(actions.some((a) => a.calldata !== null)).toBe(true);
    const unwind = json['unwind'] as { steps: { functionName: string }[] };
    expect(unwind.steps.map((s) => s.functionName)).toEqual(['repay', 'withdraw']);
  });

  it('governor vetoes loop-step on the emergency fixture (exit 2)', async () => {
    const dir = tmpDir();
    const r = await capture([
      'propose',
      '--json',
      '--preset',
      'loop-step',
      '--net',
      '0.12',
      '--fixture',
      'emergency',
      '--dir',
      dir,
    ]);
    expect(r.code).toBe(EXIT_VETO);
    const json = parseStdoutJson(r.stdout);
    expect(json['ok']).toBe(false);
    expect(json['veto']).toBe(true);
    expect(json['status']).toBe('vetoed');
    expect(json['riskState']).toBe('Emergency');
  });

  it('approve marks the file and does not broadcast', async () => {
    const dir = tmpDir();
    const proposed = await capture(['propose', '--json', '--preset', 'hold-liquid', '--dir', dir]);
    const id = parseStdoutJson(proposed.stdout)['id'] as string;
    const r = await capture(['approve', '--json', '--id', id, '--dir', dir]);
    expect(r.code).toBe(EXIT_OK);
    const json = parseStdoutJson(r.stdout);
    expect(json['status']).toBe('approved');
    expect(json['broadcast']).toBe(false);
    expect(json['liveTransactions']).toBe(false);
    expect(typeof json['approvedAt']).toBe('string');
    expect(json['approvedAt']).not.toBe('');
  });

  it('reject marks the file', async () => {
    const dir = tmpDir();
    const proposed = await capture(['propose', '--json', '--preset', 'hold-liquid', '--dir', dir]);
    const id = parseStdoutJson(proposed.stdout)['id'] as string;
    const r = await capture(['reject', '--json', '--id', id, '--dir', dir]);
    expect(r.code).toBe(EXIT_OK);
    expect(parseStdoutJson(r.stdout)['status']).toBe('rejected');
  });

  it('broadcast is refused with and without the Phase 6 flag', async () => {
    const dir = tmpDir();
    const proposed = await capture(['propose', '--json', '--preset', 'hold-liquid', '--dir', dir]);
    const id = parseStdoutJson(proposed.stdout)['id'] as string;
    const off = await capture(['broadcast', '--json', '--id', id, '--dir', dir], {
      [PHASE6_BROADCAST_ENV]: '',
    });
    expect(off.code).toBe(EXIT_ERROR);
    const offJson = parseStdoutJson(off.stdout);
    expect(offJson['ok']).toBe(false);
    expect(String(offJson['error'])).toMatch(/forbidden/i);
    expect(offJson['broadcast']).toBe(false);

    const on = await capture(['broadcast', '--json', '--id', id, '--dir', dir], {
      [PHASE6_BROADCAST_ENV]: '1',
    });
    expect(on.code).toBe(EXIT_ERROR);
    expect(String(parseStdoutJson(on.stdout)['error'])).toMatch(/Phase 5/i);
  });
});

describe('approve/reject/broadcast units', () => {
  it('refuses to approve a vetoed file', () => {
    expect(() => applyApprove({ status: 'vetoed', veto: true })).toThrow(/vetoed/);
  });

  it('approve then reject is blocked', () => {
    const approved = applyApprove({ status: 'draft', veto: false });
    expect(() => applyReject(approved)).toThrow(/already-approved/);
  });

  it('refuseBroadcast always throws BroadcastRefused', () => {
    expect(() => refuseBroadcast({})).toThrow(BroadcastRefused);
    expect(() => refuseBroadcast({ [PHASE6_BROADCAST_ENV]: '1' })).toThrow(BroadcastRefused);
  });
});

import { describe, expect, it } from 'vitest';
import { EXIT_OK, EXIT_VETO, runRiskCli } from '../src/run.js';

function capture(argv: string[]): { code: number; stdout: string; stderr: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = runRiskCli(argv, {
    stdout: { write: (c) => out.push(c) },
    stderr: { write: (c) => err.push(c) },
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

describe('pnpm risk CLI', () => {
  it('state --json on the normal fixture is ok', () => {
    const r = capture(['state', '--json', '--fixture', 'normal']);
    expect(r.code).toBe(EXIT_OK);
    const json = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(json['engine']).toBe('@shadow-banking/risk');
    expect(json['state']).toBe('Normal');
    expect(json['veto']).toBe(false);
    expect(json['paper']).toBe(true);
    expect(json['execution']).toBe('forbidden');
    expect(json['hurdle']).toBe('0.1');
  });

  it('evaluate --json emergency fixture exits 2', () => {
    const r = capture(['evaluate', '--json', '--fixture', 'emergency']);
    expect(r.code).toBe(EXIT_VETO);
    const json = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(json['ok']).toBe(false);
    expect(json['state']).toBe('Emergency');
    expect(json['veto']).toBe(true);
  });

  it('state tables mention survival and the state name', () => {
    const r = capture(['state', '--fixture', 'caution']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.stdout).toMatch(/Caution/);
    expect(r.stdout).toMatch(/Veto/);
  });
});

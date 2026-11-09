import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/parse.js';
import { EXIT_ERROR, EXIT_OK, EXIT_VETO } from '../src/io.js';
import { capture, parseStdoutJson } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const stressed = join(here, 'fixtures/stressed-snapshot.json');

describe('parseArgs', () => {
  it('maps aliases and --json', () => {
    const p = parseArgs(['bs', '--json', '--book', 'x.json']);
    expect(p.command).toBe('balance-sheet');
    expect(p.json).toBe(true);
    expect(p.flags['--book']).toBe('x.json');
    expect(p.errors).toEqual([]);
  });

  it('treats --format json as json mode', () => {
    const p = parseArgs(['status', '--format', 'json']);
    expect(p.json).toBe(true);
  });

  it('maps paper / controller aliases', () => {
    expect(parseArgs(['paper', 'run', '--steps', '3']).command).toBe('paper');
    expect(parseArgs(['controller', '--json']).command).toBe('paper');
  });

  it('maps execution aliases', () => {
    expect(parseArgs(['execution', 'propose', '--json']).command).toBe('execution');
    expect(parseArgs(['exec', 'approve', '--id', 'x']).command).toBe('execution');
  });

  it('records unknown commands', () => {
    const p = parseArgs(['dashboard']);
    expect(p.command).toBeNull();
    expect(p.errors[0]).toMatch(/unknown command/);
  });

  it('keeps sim subcommands in rest', () => {
    const p = parseArgs([
      'sim',
      'run',
      '--preset',
      'aave-v3-ethereum-wsteth-eth-emode',
      '--seed',
      '1000',
    ]);
    expect(p.command).toBe('sim');
    expect(p.rest).toEqual(['run']);
    expect(p.flags['--preset']).toBe('aave-v3-ethereum-wsteth-eth-emode');
  });
});

describe('run() exit codes', () => {
  it('exits 0 for help', () => {
    const r = capture(['--help']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.stdout).toMatch(/pnpm sb/);
  });

  it('exits 1 for unknown commands', () => {
    const r = capture(['not-a-command']);
    expect(r.code).toBe(EXIT_ERROR);
  });

  it('exits 2 on a risk-governor veto', () => {
    const r = capture(['risk', '--json', '--snapshot', stressed, '--no-sim']);
    expect(r.code).toBe(EXIT_VETO);
    const json = parseStdoutJson(r.stdout);
    expect(json['veto']).toBe(true);
    expect(json['state']).toBe('Emergency');
    expect(json['ok']).toBe(false);
  });
});

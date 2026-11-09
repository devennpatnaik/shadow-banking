import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExecutionCli } from '../src/run.js';

export function tmpDir(prefix = 'sb-exec-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export async function capture(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runExecutionCli(
    argv,
    {
      stdout: { write: (c) => out.push(c) },
      stderr: { write: (c) => err.push(c) },
    },
    { ...process.env, ...env },
  );
  return { code, stdout: out.join(''), stderr: err.join('') };
}

export function parseStdoutJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

import { run } from '../src/run.js';

export function capture(argv: string[]): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, {
    stdout: {
      write(chunk: string) {
        out.push(chunk);
      },
    },
    stderr: {
      write(chunk: string) {
        err.push(chunk);
      },
    },
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

export function parseStdoutJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

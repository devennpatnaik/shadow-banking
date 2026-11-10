import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { proposalToJson } from './serialize.js';
import type { ExecutionProposal } from './types.js';

export function defaultStateDir(): string {
  return resolve(process.cwd(), '.cache/execution');
}

export function proposalPath(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

export function writeProposal(dir: string, proposal: ExecutionProposal): string {
  mkdirSync(dir, { recursive: true });
  const path = proposalPath(dir, proposal.id);
  writeFileSync(path, `${JSON.stringify(proposalToJson(proposal), null, 2)}\n`, 'utf8');
  return path;
}

export function readProposalFile(dir: string, id: string): Record<string, unknown> {
  const path = proposalPath(dir, id);
  if (!existsSync(path)) throw new Error(`proposal ${id} not found in ${dir}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function writeProposalJson(
  dir: string,
  id: string,
  payload: Record<string, unknown>,
): string {
  mkdirSync(dir, { recursive: true });
  const path = proposalPath(dir, id);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

export function listProposalIds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

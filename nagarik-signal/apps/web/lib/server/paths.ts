import 'server-only';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedRepoRoot: string | null = null;

export function repoRoot() {
  if (cachedRepoRoot) return cachedRepoRoot;

  const candidates = [
    process.cwd(),
    resolve(/* turbopackIgnore: true */ process.cwd(), '..'),
    resolve(/* turbopackIgnore: true */ process.cwd(), '..', '..'),
    resolve(/* turbopackIgnore: true */ process.cwd(), '..', '..', '..'),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(resolve(candidate, 'idl', 'nagarik_signal.json')) &&
      existsSync(resolve(candidate, 'apps', 'web'))
    ) {
      cachedRepoRoot = candidate;
      return candidate;
    }
  }

  cachedRepoRoot = process.cwd();
  return cachedRepoRoot;
}

export function readModelPath() {
  return resolve(repoRoot(), 'data', 'read-model', 'nagarik-signal.json');
}

export function sessionKeypairDir() {
  return resolve(repoRoot(), 'data', 'session-keypairs');
}

export function uploadDir() {
  return resolve(repoRoot(), 'apps', 'web', 'public', 'uploads');
}

export function idlPathCandidates() {
  const root = repoRoot();
  return [
    resolve(root, 'programs', 'nagarik_signal', 'target', 'idl', 'nagarik_signal.json'),
    resolve(root, 'idl', 'nagarik_signal.json'),
  ];
}

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['idl/nagarik_signal_v1.json', 'target/idl/nagarik_signal.json'],
  ['idl/nagarik_signal_v1.json', 'target/idl/nagarik_signal_v1.json'],
  ['idl/nagarik_signal_v2.json', 'target/idl/nagarik_signal_v2.json'],
];

const prepared = copies.map(([sourcePath, targetPath]) => {
  const source = resolve(repoRoot, sourcePath);
  const target = resolve(repoRoot, targetPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return { source, target };
});
console.log(JSON.stringify({ ok: true, prepared }, null, 2));

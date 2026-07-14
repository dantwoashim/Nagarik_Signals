import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repoRoot, 'idl', 'nagarik_signal.json');
const target = resolve(repoRoot, 'programs', 'nagarik_signal', 'target', 'idl', 'nagarik_signal.json');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(JSON.stringify({ ok: true, source, target }, null, 2));

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = resolve('target', 'idl-generated', 'nagarik_signal_v2.json');
mkdirSync(dirname(output), { recursive: true });
const result = spawnSync(
  process.platform === 'win32' ? 'anchor.exe' : 'anchor',
  ['idl', 'build', '-p', 'nagarik_signal_v2', '-o', output],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUSTUP_TOOLCHAIN: process.env.NAGARIK_ANCHOR_IDL_TOOLCHAIN ?? 'nightly-2024-10-01',
    },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

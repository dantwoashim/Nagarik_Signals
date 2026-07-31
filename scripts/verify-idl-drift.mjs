import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const expected = {
  v1: '776832A82DB6C76B8165614327D866C182E60FC2D121C9536410D016C032A61A',
  v2: '1971B3D2743CA3F51332CC92D988A2FE75792F333474E680C3F2D7F7AE15A962',
  v1Program: '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY',
  v2Program: 'A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

const paths = {
  v1: resolve('idl', 'nagarik_signal_v1.json'),
  compatibility: resolve('idl', 'nagarik_signal.json'),
  v2: resolve('idl', 'nagarik_signal_v2.json'),
  generatedV2: resolve('target', 'idl-generated', 'nagarik_signal_v2.json'),
};
const [v1, compatibility, v2, generatedV2] = await Promise.all(
  Object.values(paths).map((path) => readFile(path)),
);
if (!v1.equals(compatibility)) throw new Error('v1_compatibility_idl_drift');
if (sha256(v1) !== expected.v1) throw new Error('v1_idl_checksum_drift');
if (sha256(v2) !== expected.v2) throw new Error('v2_idl_checksum_drift');

const committed = JSON.parse(v2.toString('utf8'));
const generated = JSON.parse(generatedV2.toString('utf8'));
if (JSON.stringify(canonical(committed)) !== JSON.stringify(canonical(generated))) {
  throw new Error('v2_generated_idl_drift');
}
if (
  JSON.parse(v1.toString('utf8')).address !== expected.v1Program ||
  committed.address !== expected.v2Program ||
  committed.address === expected.v1Program
) {
  throw new Error('idl_program_identity_drift');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      v1: { programId: expected.v1Program, sha256: expected.v1 },
      v2: { programId: expected.v2Program, sha256: expected.v2 },
    },
    null,
    2,
  ),
);

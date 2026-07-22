import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createSeededDemoReadModel, seededDemoSummary } from '../apps/web/lib/db/demoSeed';
import type { ReadModel } from '../apps/web/lib/db/queries';

const readModelPath = resolve(process.cwd(), 'data', 'read-model', 'nagarik-signal.json');

function readExistingModel() {
  if (!existsSync(readModelPath)) return undefined;
  return JSON.parse(readFileSync(readModelPath, 'utf8')) as ReadModel;
}

function assertSeedSummary(summary: ReturnType<typeof seededDemoSummary>) {
  const failures: string[] = [];
  if (summary.issues < 30) failures.push(`expected at least 30 visible issues, got ${summary.issues}`);
  if (summary.wards < 5) failures.push(`expected at least 5 wards, got ${summary.wards}`);
  if (summary.verifications < 10) failures.push(`expected at least 10 verifications, got ${summary.verifications}`);
  if (summary.resolved < 2) failures.push(`expected at least 2 resolved issues, got ${summary.resolved}`);
  if (summary.inProgress < 5) failures.push(`expected at least 5 in-progress issues, got ${summary.inProgress}`);
  if (summary.unresolved < 10) failures.push(`expected at least 10 unresolved issues, got ${summary.unresolved}`);
  if (summary.maxVerifications < 3) failures.push(`expected at least one issue with 3+ verifications, got ${summary.maxVerifications}`);
  if (failures.length) throw new Error(failures.join('; '));
}

const existing = readExistingModel();
const model = createSeededDemoReadModel(existing);
const summary = seededDemoSummary(model);
assertSeedSummary(summary);

mkdirSync(dirname(readModelPath), { recursive: true });
writeFileSync(readModelPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  action: 'seed_demo_data',
  readModelPath,
  summary,
}, null, 2));

import assert from 'node:assert/strict';
import test from 'node:test';

import type { QueryExecutor } from '../db/query';
import { evaluateInternalHealth } from './healthCore';

const capabilities = [
  'publicReadEnabled',
  'publicMediaEnabled',
  'inviteIntakeEnabled',
  'inviteSignalsEnabled',
  'operatorMutationsEnabled',
  'publicationEnabled',
  'v2WritesEnabled',
];

test('readiness uses the fail-closed capability switch schema', async () => {
  const statements: string[] = [];
  const query: QueryExecutor = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('capability_kill_switches')) {
        return capabilities.map((capability) => ({ capability, enabled: true }));
      }
      if (statement.includes('outbox_jobs')) return [];
      throw new Error('unexpected_health_query');
    },
  };

  const snapshot = await evaluateInternalHealth({ query, validateEnvironment: () => undefined });

  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.checks.featureSwitches, true);
  assert.ok(statements.some((statement) => statement.includes('not disabled as enabled')));
  assert.ok(statements.every((statement) => !statement.includes('nagarik.feature_switches')));
});

test('readiness remains false when any capability is disabled', async () => {
  const query: QueryExecutor = {
    async query(statement) {
      if (statement.includes('capability_kill_switches')) {
        return capabilities.map((capability, index) => ({ capability, enabled: index !== 0 }));
      }
      return [];
    },
  };

  const snapshot = await evaluateInternalHealth({ query, validateEnvironment: () => undefined });

  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.checks.featureSwitches, false);
});

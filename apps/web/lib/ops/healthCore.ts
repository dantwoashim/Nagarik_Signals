import type { QueryExecutor } from '../db/query';

const requiredSwitches = [
  'publicReadEnabled',
  'publicMediaEnabled',
  'inviteIntakeEnabled',
  'inviteSignalsEnabled',
  'operatorMutationsEnabled',
  'publicationEnabled',
  'v2WritesEnabled',
] as const;

export type InternalHealthSnapshot = {
  ready: boolean;
  checks: {
    environment: boolean;
    database: boolean;
    featureSwitches: boolean;
    deadLetters: boolean;
  };
  featureSwitches: Record<string, boolean>;
  outbox: {
    pending: number;
    leased: number;
    submittedUnknown: number;
    confirming: number;
    blocked: number;
    deadLetter: number;
  };
};

type HealthDependencies = {
  query: QueryExecutor;
  validateEnvironment: () => unknown;
};

function emptySnapshot(): InternalHealthSnapshot {
  return {
    ready: false,
    checks: {
      environment: false,
      database: false,
      featureSwitches: false,
      deadLetters: false,
    },
    featureSwitches: Object.fromEntries(requiredSwitches.map((name) => [name, false])),
    outbox: {
      pending: 0,
      leased: 0,
      submittedUnknown: 0,
      confirming: 0,
      blocked: 0,
      deadLetter: 0,
    },
  };
}

export async function evaluateInternalHealth(
  dependencies: HealthDependencies,
): Promise<InternalHealthSnapshot> {
  const snapshot = emptySnapshot();
  try {
    dependencies.validateEnvironment();
    snapshot.checks.environment = true;
  } catch {
    return snapshot;
  }

  try {
    const [switchRows, outboxRows] = await Promise.all([
      dependencies.query.query(
        `select capability, not disabled as enabled
         from nagarik.capability_kill_switches
         where capability = any($1::text[])`,
        [[...requiredSwitches]],
      ),
      dependencies.query.query(
        `select state, count(*)::bigint as total
         from nagarik.outbox_jobs
         where state <> 'confirmed'
         group by state`,
      ),
    ]);
    snapshot.checks.database = true;
    for (const row of switchRows) {
      const name = String(row.capability);
      if (name in snapshot.featureSwitches) {
        snapshot.featureSwitches[name] = row.enabled === true;
      }
    }
    const stateKeys: Record<string, keyof InternalHealthSnapshot['outbox']> = {
      pending: 'pending',
      leased: 'leased',
      submitted_unknown: 'submittedUnknown',
      confirming: 'confirming',
      blocked: 'blocked',
      dead_letter: 'deadLetter',
    };
    for (const row of outboxRows) {
      const key = stateKeys[String(row.state)];
      if (key) snapshot.outbox[key] = Number(row.total);
    }
    snapshot.checks.featureSwitches = requiredSwitches.every(
      (name) => snapshot.featureSwitches[name],
    );
    snapshot.checks.deadLetters = snapshot.outbox.deadLetter === 0;
    snapshot.ready = Object.values(snapshot.checks).every(Boolean);
    return snapshot;
  } catch {
    return snapshot;
  }
}

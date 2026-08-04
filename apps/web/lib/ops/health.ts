import 'server-only';

import { databaseExecutor } from '../db/transaction';
import type { QueryExecutor } from '../db/query';
import { getServerEnvironment } from '../env/server';
import { evaluateInternalHealth } from './healthCore';

export type { InternalHealthSnapshot } from './healthCore';

export async function readInternalHealth() {
  let query: QueryExecutor;
  try {
    query = databaseExecutor();
  } catch {
    query = {
      async query() {
        throw new Error('database_unavailable');
      },
    };
  }
  return evaluateInternalHealth({
    query,
    validateEnvironment: getServerEnvironment,
  });
}

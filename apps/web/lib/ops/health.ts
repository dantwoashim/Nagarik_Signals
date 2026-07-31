import 'server-only';

import { databaseExecutor } from '../db/transaction';
import { getServerEnvironment } from '../env/server';
import { evaluateInternalHealth } from './healthCore';

export type { InternalHealthSnapshot } from './healthCore';

export async function readInternalHealth() {
  return evaluateInternalHealth({
    query: databaseExecutor(),
    validateEnvironment: getServerEnvironment,
  });
}

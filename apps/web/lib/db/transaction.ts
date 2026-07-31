import 'server-only';

import type postgres from 'postgres';

import { getDatabase } from '@/lib/db/postgres';
import type { QueryExecutor } from '@/lib/db/query';

function executor(transaction: postgres.TransactionSql): QueryExecutor {
  return {
    async query(statement, parameters = []) {
      const rows = await transaction.unsafe(statement, [...parameters] as never[]);
      return [...rows] as Array<Record<string, unknown>>;
    },
  };
}

export async function runDatabaseTransaction<T>(
  operation: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  const result = await getDatabase().begin((transaction) => operation(executor(transaction)));
  return result as T;
}

export function databaseExecutor(): QueryExecutor {
  const database = getDatabase();
  return {
    async query(statement, parameters = []) {
      const rows = await database.unsafe(statement, [...parameters] as never[]);
      return [...rows] as Array<Record<string, unknown>>;
    },
  };
}

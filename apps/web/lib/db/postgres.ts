import 'server-only';

import postgres from 'postgres';

import { getServerEnvironment } from '@/lib/env/server';

export type Database = postgres.Sql;
export type DatabaseTransaction = postgres.TransactionSql;

let database: Database | undefined;

export function getDatabase(): Database {
  if (database) return database;

  const env = getServerEnvironment();
  if (!env.DATABASE_URL) {
    throw new Error('nagarik_database_url_missing');
  }

  database = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
    onnotice: () => undefined,
  });
  return database;
}

export async function withDatabaseTransaction<T>(
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const result = await getDatabase().begin(async (transaction) => operation(transaction));
  return result as T;
}

export async function closeDatabase(): Promise<void> {
  if (!database) return;
  const active = database;
  database = undefined;
  await active.end({ timeout: 5 });
}

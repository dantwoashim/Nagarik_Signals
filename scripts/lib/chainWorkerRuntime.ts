import postgres from 'postgres';

import { createConfiguredChainSigner } from '../../apps/web/lib/chain/configuredSigner';
import type { QueryExecutor } from '../../apps/web/lib/db/query';

export type ScriptChainRuntime = {
  query: QueryExecutor;
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  signer: Awaited<ReturnType<typeof createConfiguredChainSigner>>;
};

function executor(connection: postgres.Sql | postgres.TransactionSql): QueryExecutor {
  return {
    async query(statement, parameters = []) {
      const rows = await connection.unsafe(statement, [...parameters] as never[]);
      return [...rows] as Array<Record<string, unknown>>;
    },
  };
}

export async function withChainWorkerRuntime<T>(
  operation: (runtime: ScriptChainRuntime) => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_is_required');
  const database = postgres(process.env.DATABASE_URL, {
    max: 2,
    prepare: false,
    ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  });
  try {
    const signer = await createConfiguredChainSigner(process.env);
    return await operation({
      query: executor(database),
      transaction: async <R>(inner: (query: QueryExecutor) => Promise<R>) =>
        database.begin((transaction) => inner(executor(transaction))) as Promise<R>,
      signer,
    });
  } finally {
    await database.end({ timeout: 5 });
  }
}

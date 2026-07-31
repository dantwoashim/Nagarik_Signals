import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import postgres from 'postgres';

import { applyLegacyImport, prepareLegacyImport, type LegacyImportQuery } from './db/legacyImport';

type Arguments = {
  commit: boolean;
  organizationId?: string;
  source: string;
  report?: string;
};

function parseArguments(values: string[]): Arguments {
  const result: Arguments = {
    commit: false,
    source: path.resolve('data', 'read-model', 'nagarik-signal.json'),
  };

  for (const value of values) {
    if (value === '--commit') result.commit = true;
    else if (value.startsWith('--organization=')) {
      result.organizationId = value.slice('--organization='.length);
    } else if (value.startsWith('--source=')) {
      result.source = path.resolve(value.slice('--source='.length));
    } else if (value.startsWith('--report=')) {
      result.report = path.resolve(value.slice('--report='.length));
    } else {
      throw new Error(`unknown_argument:${value}`);
    }
  }

  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const source = await readFile(args.source, 'utf8');
  const plan = prepareLegacyImport(source);
  let result: unknown = { mode: 'dry_run', committed: false };

  if (args.commit) {
    if (!args.organizationId) throw new Error('legacy_import_organization_required');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --commit');

    const sql = postgres(process.env.DATABASE_URL, {
      max: 1,
      prepare: false,
      ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
    });
    try {
      result = await sql.begin(async (transaction) => {
        const adapter: LegacyImportQuery = {
          async query(statement, parameters = []) {
            const rows = await transaction.unsafe(statement, [...parameters] as never[]);
            return [...rows] as Array<Record<string, unknown>>;
          },
        };
        return applyLegacyImport(adapter, plan, args.organizationId!);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: args.source,
    plan,
    result,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(output);
  if (args.report) await writeFile(args.report, output, { encoding: 'utf8', flag: 'wx' });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

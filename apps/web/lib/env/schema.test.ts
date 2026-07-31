import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseServerEnvironment } from './schema';

const validProduction = {
  NODE_ENV: 'production',
  NAGARIK_RELEASE_PROFILE: 'curated_pilot_v2_non_mainnet',
  NEXT_PUBLIC_APP_URL: 'https://nagarik.example',
  NEXT_PUBLIC_RELEASE_ID: 'a'.repeat(40),
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: `anon-${'a'.repeat(40)}`,
  SUPABASE_SERVICE_ROLE_KEY: `service-${'b'.repeat(40)}`,
  DATABASE_URL: 'postgresql://service:password@db.example:5432/postgres?sslmode=require',
  NAGARIK_WORKFLOW_STORE: 'postgres',
  NAGARIK_STORAGE_MODE: 'blob',
  BLOB_READ_WRITE_TOKEN: `blob-${'c'.repeat(40)}`,
  NAGARIK_BLOB_ACCESS: 'private',
  NAGARIK_BLOB_STAGING_PREFIX: 'staging/nagarik/',
  NAGARIK_BLOB_DURABLE_PREFIX: 'private/nagarik/',
  NAGARIK_AUTH_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  NAGARIK_AUTH_ISSUER: 'https://project.supabase.co/auth/v1',
  NAGARIK_AUTH_AUDIENCE: 'authenticated',
  NAGARIK_AUTH_AAL2_REQUIRED: 'true',
  NAGARIK_RPC_PRIMARY_URL: 'https://rpc-one.example',
  NAGARIK_RPC_SECONDARY_URL: 'https://rpc-two.example',
  NAGARIK_SOLANA_CLUSTER: 'custom',
  NAGARIK_SOLANA_GENESIS_HASH: 'genesis-approved-non-mainnet-0000000000000001',
  NAGARIK_V1_PROGRAM_ID: '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY',
  NAGARIK_V2_PROGRAM_ID: 'Fg6PaFpoGXkYsidMpWxTWqkZ7FEfcYkgMQhgQCbYtW6d',
  NAGARIK_V1_IDL_SHA256: '7'.repeat(64),
  NAGARIK_V2_IDL_SHA256: '8'.repeat(64),
  NAGARIK_V2_SIGNER_PUBLIC_KEY: 'Vote111111111111111111111111111111111111111',
  NAGARIK_V2_SIGNER_KMS_KEY_ID: 'kms/nagarik-v2-signer',
  NAGARIK_CAPABILITY_DERIVATION_KEY: `derive-${'d'.repeat(40)}`,
  NAGARIK_CAPABILITY_VERIFIER_KEY: `verify-${'e'.repeat(40)}`,
  NAGARIK_SECURITY_CORRELATION_KEY: `correlate-${'f'.repeat(40)}`,
  NAGARIK_COOKIE_SECRET: `cookie-${'g'.repeat(40)}`,
  NAGARIK_CSRF_SECRET: `csrf-${'h'.repeat(40)}`,
  NAGARIK_WORKER_AUTH_SECRET: `worker-${'i'.repeat(40)}`,
  CRON_SECRET: `cron-${'j'.repeat(40)}`,
  NAGARIK_ALERT_WEBHOOK_URL: 'https://alerts.example/nagarik',
  NAGARIK_ALERT_WEBHOOK_TOKEN: `alert-${'k'.repeat(40)}`,
  NAGARIK_LEGACY_READ: 'true',
  NAGARIK_LEGACY_MUTATIONS: 'false',
  NAGARIK_PUBLIC_READ: 'true',
  NAGARIK_PUBLIC_INTAKE: 'false',
  NAGARIK_PUBLIC_SIGNALS: 'false',
  NAGARIK_MAINNET_WRITES: 'false',
  NAGARIK_PUBLICATION_REQUIRES_FINALIZED_COMMIT: 'true',
  NAGARIK_SAMPLE_DATA: 'false',
  NAGARIK_CAP_PUBLIC_READ: 'true',
  NAGARIK_CAP_PUBLIC_MEDIA: 'true',
  NAGARIK_CAP_INVITE_INTAKE: 'true',
  NAGARIK_CAP_INVITE_SIGNALS: 'true',
  NAGARIK_CAP_OPERATOR_MUTATIONS: 'true',
  NAGARIK_CAP_PUBLICATION: 'true',
  NAGARIK_CAP_V2_WRITES: 'true',
  NAGARIK_ALLOW_REAL_CIVIC_DATA: 'false',
  NAGARIK_STAGING_TTL_HOURS: '24',
  NAGARIK_PRIVATE_RETENTION_DAYS: '90',
  NAGARIK_LOG_RETENTION_DAYS: '30',
  NAGARIK_SCHEMA_VERSION: '1',
} as const;

describe('production environment', () => {
  it('accepts the exact curated-pilot profile', () => {
    assert.equal(parseServerEnvironment(validProduction).NAGARIK_WORKFLOW_STORE, 'postgres');
  });

  it('rejects missing production dependencies', () => {
    assert.throws(() => parseServerEnvironment({ NODE_ENV: 'production' }));
  });

  it('rejects legacy administration secrets', () => {
    assert.throws(() =>
      parseServerEnvironment({ ...validProduction, NAGARIK_STEWARD_SECRET: 'legacy' }),
    );
  });

  it('rejects duplicate secret material', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_CSRF_SECRET: validProduction.NAGARIK_COOKIE_SECRET,
      }),
    );
  });

  it('requires a dedicated Vercel cron secret', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        CRON_SECRET: undefined,
      }),
    );
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        CRON_SECRET: validProduction.NAGARIK_WORKER_AUTH_SECRET,
      }),
    );
  });

  it('requires an independent HTTPS alert destination and credential', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_ALERT_WEBHOOK_URL: undefined,
      }),
    );
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_ALERT_WEBHOOK_URL: 'http://alerts.example/nagarik',
      }),
    );
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_ALERT_WEBHOOK_TOKEN: validProduction.CRON_SECRET,
      }),
    );
  });

  it('rejects default public Solana clusters', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_RPC_PRIMARY_URL: 'https://api.devnet.solana.com',
      }),
    );
  });

  it('requires two public-network RPC provider hostnames', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_RPC_SECONDARY_URL: 'https://rpc-one.example/secondary',
      }),
    );
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_RPC_SECONDARY_URL: 'https://127.0.0.1/rpc',
      }),
    );
  });

  it('requires external privacy approval before real civic data', () => {
    assert.throws(() =>
      parseServerEnvironment({
        ...validProduction,
        NAGARIK_ALLOW_REAL_CIVIC_DATA: 'true',
      }),
    );
  });

  it('keeps local development permissive without granting production status', () => {
    assert.equal(parseServerEnvironment({ NODE_ENV: 'development' }).NODE_ENV, 'development');
  });
});

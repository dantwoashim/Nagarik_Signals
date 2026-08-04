import { z } from 'zod';

import { safeAlertWebhookUrl } from '../ops/alertEndpoint';
import { safeSolanaRpcUrl } from '../solana/v2/readOnly';

const V1_PROGRAM_ID = '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY';
const RELEASE_PROFILE = 'curated_pilot_v2_non_mainnet';
const TRUE = 'true';
const FALSE = 'false';

const url = z.string().url();
const httpsUrl = url.refine((value) => value.startsWith('https://'), 'must use HTTPS');
const solanaRpcUrl = httpsUrl.refine(
  (value) => safeSolanaRpcUrl(value) !== null,
  'must be a public-network HTTPS endpoint without URL userinfo',
);
const alertWebhookUrl = httpsUrl.refine(
  (value) => safeAlertWebhookUrl(value) !== null,
  'must be a public credential-free HTTPS endpoint',
);
const remoteSignerUrl = httpsUrl.refine((value) => {
  const parsed = safeAlertWebhookUrl(value);
  return parsed !== null && parsed.pathname === '/sign';
}, 'must be an exact credential-free HTTPS /sign endpoint');
const secret = z
  .string()
  .min(32)
  .refine(
    (value) => !/(change|example|placeholder|secret|todo|replace|your[-_])/i.test(value),
    'must not be a placeholder',
  );
const publicKey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'must be a base58 public key');

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NAGARIK_RELEASE_PROFILE: z.string().optional(),
    NEXT_PUBLIC_APP_URL: url.optional(),
    NEXT_PUBLIC_RELEASE_ID: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    NEXT_PUBLIC_SUPABASE_URL: url.optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
    SUPABASE_SERVICE_ROLE_KEY: secret.optional(),
    DATABASE_URL: z.string().min(1).optional(),
    NAGARIK_WORKFLOW_STORE: z.enum(['postgres', 'legacy_json']).optional(),
    NAGARIK_STORAGE_MODE: z.enum(['blob', 'local']).optional(),
    BLOB_READ_WRITE_TOKEN: secret.optional(),
    NAGARIK_BLOB_ACCESS: z.enum(['private', 'public']).optional(),
    NAGARIK_BLOB_STAGING_PREFIX: z
      .string()
      .regex(/^staging\/[a-z0-9-]+\/$/)
      .optional(),
    NAGARIK_BLOB_DURABLE_PREFIX: z
      .string()
      .regex(/^private\/[a-z0-9-]+\/$/)
      .optional(),
    NAGARIK_AUTH_JWKS_URL: httpsUrl.optional(),
    NAGARIK_AUTH_ISSUER: httpsUrl.optional(),
    NAGARIK_AUTH_AUDIENCE: z.string().min(1).max(120).optional(),
    NAGARIK_AUTH_AAL2_REQUIRED: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_RPC_PRIMARY_URL: solanaRpcUrl.optional(),
    NAGARIK_RPC_SECONDARY_URL: solanaRpcUrl.optional(),
    NAGARIK_SOLANA_CLUSTER: z.enum(['localnet', 'testnet', 'custom']).optional(),
    NAGARIK_SOLANA_GENESIS_HASH: z.string().min(32).max(128).optional(),
    NAGARIK_V1_PROGRAM_ID: publicKey.optional(),
    NAGARIK_V2_PROGRAM_ID: publicKey.optional(),
    NAGARIK_V1_IDL_SHA256: z
      .string()
      .regex(/^[0-9A-F]{64}$/)
      .optional(),
    NAGARIK_V2_IDL_SHA256: z
      .string()
      .regex(/^[0-9A-F]{64}$/)
      .optional(),
    NAGARIK_V2_SIGNER_PUBLIC_KEY: publicKey.optional(),
    NAGARIK_V2_SIGNER_ENDPOINT: remoteSignerUrl.optional(),
    NAGARIK_V2_SIGNER_AUTH_SECRET: secret.optional(),
    NAGARIK_V2_SIGNER_CUSTODY_ID: z.string().min(8).max(240).optional(),
    NAGARIK_V2_LOCAL_SIGNER_PATH: z.string().min(1).optional(),
    NAGARIK_CAPABILITY_DERIVATION_KEY: secret.optional(),
    NAGARIK_CAPABILITY_VERIFIER_KEY: secret.optional(),
    NAGARIK_SECURITY_CORRELATION_KEY: secret.optional(),
    NAGARIK_COOKIE_SECRET: secret.optional(),
    NAGARIK_CSRF_SECRET: secret.optional(),
    NAGARIK_WORKER_AUTH_SECRET: secret.optional(),
    CRON_SECRET: secret.optional(),
    NAGARIK_ALERT_WEBHOOK_URL: alertWebhookUrl.optional(),
    NAGARIK_ALERT_WEBHOOK_TOKEN: secret.optional(),
    NAGARIK_LEGACY_READ: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_LEGACY_MUTATIONS: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_PUBLIC_READ: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_PUBLIC_INTAKE: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_PUBLIC_SIGNALS: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_MAINNET_WRITES: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_PUBLICATION_REQUIRES_FINALIZED_COMMIT: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_SAMPLE_DATA: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_PUBLIC_READ: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_PUBLIC_MEDIA: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_INVITE_INTAKE: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_INVITE_SIGNALS: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_OPERATOR_MUTATIONS: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_PUBLICATION: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_CAP_V2_WRITES: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_EXT003_REFERENCE: z.string().min(8).optional(),
    NAGARIK_ALLOW_REAL_CIVIC_DATA: z.enum([TRUE, FALSE]).optional(),
    NAGARIK_STAGING_TTL_HOURS: z.coerce.number().int().positive().max(24).optional(),
    NAGARIK_PRIVATE_RETENTION_DAYS: z.coerce.number().int().positive().max(90).optional(),
    NAGARIK_LOG_RETENTION_DAYS: z.coerce.number().int().positive().max(30).optional(),
    NAGARIK_SCHEMA_VERSION: z.coerce.number().int().positive().optional(),
    NAGARIK_ALLOWED_ORIGINS: z.string().optional(),
    NAGARIK_STEWARD_SECRET: z.string().optional(),
    NAGARIK_REINDEX_SECRET: z.string().optional(),
    NAGARIK_RELAYER_SECRET_KEY: z.string().optional(),
    NAGARIK_SESSION_DERIVATION_SECRET: z.string().optional(),
    NAGARIK_UPLOAD_RECEIPT_SECRET: z.string().optional(),
  })
  .passthrough()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    const required = [
      'NAGARIK_RELEASE_PROFILE',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_RELEASE_ID',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'DATABASE_URL',
      'NAGARIK_WORKFLOW_STORE',
      'NAGARIK_STORAGE_MODE',
      'BLOB_READ_WRITE_TOKEN',
      'NAGARIK_BLOB_ACCESS',
      'NAGARIK_BLOB_STAGING_PREFIX',
      'NAGARIK_BLOB_DURABLE_PREFIX',
      'NAGARIK_AUTH_JWKS_URL',
      'NAGARIK_AUTH_ISSUER',
      'NAGARIK_AUTH_AUDIENCE',
      'NAGARIK_AUTH_AAL2_REQUIRED',
      'NAGARIK_RPC_PRIMARY_URL',
      'NAGARIK_RPC_SECONDARY_URL',
      'NAGARIK_SOLANA_CLUSTER',
      'NAGARIK_SOLANA_GENESIS_HASH',
      'NAGARIK_V1_PROGRAM_ID',
      'NAGARIK_V2_PROGRAM_ID',
      'NAGARIK_V1_IDL_SHA256',
      'NAGARIK_V2_IDL_SHA256',
      'NAGARIK_V2_SIGNER_PUBLIC_KEY',
      'NAGARIK_V2_SIGNER_ENDPOINT',
      'NAGARIK_V2_SIGNER_AUTH_SECRET',
      'NAGARIK_V2_SIGNER_CUSTODY_ID',
      'NAGARIK_CAPABILITY_DERIVATION_KEY',
      'NAGARIK_CAPABILITY_VERIFIER_KEY',
      'NAGARIK_SECURITY_CORRELATION_KEY',
      'NAGARIK_COOKIE_SECRET',
      'NAGARIK_CSRF_SECRET',
      'NAGARIK_WORKER_AUTH_SECRET',
      'CRON_SECRET',
      'NAGARIK_ALERT_WEBHOOK_URL',
      'NAGARIK_ALERT_WEBHOOK_TOKEN',
      'NAGARIK_STAGING_TTL_HOURS',
      'NAGARIK_PRIVATE_RETENTION_DAYS',
      'NAGARIK_LOG_RETENTION_DAYS',
      'NAGARIK_SCHEMA_VERSION',
    ] as const;
    for (const key of required) {
      if (env[key] === undefined || env[key] === '') {
        ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
      }
    }

    const exact: Record<string, string> = {
      NAGARIK_RELEASE_PROFILE: RELEASE_PROFILE,
      NAGARIK_WORKFLOW_STORE: 'postgres',
      NAGARIK_STORAGE_MODE: 'blob',
      NAGARIK_BLOB_ACCESS: 'private',
      NAGARIK_AUTH_AAL2_REQUIRED: TRUE,
      NAGARIK_LEGACY_READ: TRUE,
      NAGARIK_LEGACY_MUTATIONS: FALSE,
      NAGARIK_PUBLIC_READ: TRUE,
      NAGARIK_PUBLIC_INTAKE: FALSE,
      NAGARIK_PUBLIC_SIGNALS: FALSE,
      NAGARIK_MAINNET_WRITES: FALSE,
      NAGARIK_PUBLICATION_REQUIRES_FINALIZED_COMMIT: TRUE,
      NAGARIK_SAMPLE_DATA: FALSE,
      NAGARIK_CAP_PUBLIC_READ: TRUE,
      NAGARIK_CAP_PUBLIC_MEDIA: TRUE,
      NAGARIK_CAP_INVITE_INTAKE: TRUE,
      NAGARIK_CAP_INVITE_SIGNALS: TRUE,
      NAGARIK_CAP_OPERATOR_MUTATIONS: TRUE,
      NAGARIK_CAP_PUBLICATION: TRUE,
      NAGARIK_CAP_V2_WRITES: TRUE,
      NAGARIK_SOLANA_CLUSTER: 'custom',
    };
    for (const [key, expected] of Object.entries(exact)) {
      if (env[key] !== expected) {
        ctx.addIssue({ code: 'custom', path: [key], message: `must equal ${expected}` });
      }
    }

    if (env.NEXT_PUBLIC_APP_URL && !env.NEXT_PUBLIC_APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_APP_URL'], message: 'must use HTTPS' });
    }
    if (env.NAGARIK_V1_PROGRAM_ID !== V1_PROGRAM_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['NAGARIK_V1_PROGRAM_ID'],
        message: 'does not match frozen v1',
      });
    }
    if (
      env.NAGARIK_V2_PROGRAM_ID === env.NAGARIK_V1_PROGRAM_ID ||
      env.NAGARIK_V2_PROGRAM_ID === '11111111111111111111111111111111'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['NAGARIK_V2_PROGRAM_ID'],
        message: 'must be a distinct non-default v2 program',
      });
    }
    if (env.NAGARIK_RPC_PRIMARY_URL === env.NAGARIK_RPC_SECONDARY_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['NAGARIK_RPC_SECONDARY_URL'],
        message: 'must use an independent provider',
      });
    }
    if (
      env.NAGARIK_V2_SIGNER_ENDPOINT &&
      env.NEXT_PUBLIC_APP_URL &&
      new URL(env.NAGARIK_V2_SIGNER_ENDPOINT).hostname === new URL(env.NEXT_PUBLIC_APP_URL).hostname
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['NAGARIK_V2_SIGNER_ENDPOINT'],
        message: 'must use an independently hosted signer',
      });
    }
    if (env.NAGARIK_RPC_PRIMARY_URL && env.NAGARIK_RPC_SECONDARY_URL) {
      const primary = safeSolanaRpcUrl(env.NAGARIK_RPC_PRIMARY_URL);
      const secondary = safeSolanaRpcUrl(env.NAGARIK_RPC_SECONDARY_URL);
      if (primary && secondary && primary.hostname === secondary.hostname) {
        ctx.addIssue({
          code: 'custom',
          path: ['NAGARIK_RPC_SECONDARY_URL'],
          message: 'must use an independently operated provider hostname',
        });
      }
    }
    for (const key of ['NAGARIK_RPC_PRIMARY_URL', 'NAGARIK_RPC_SECONDARY_URL'] as const) {
      if (env[key] && /(devnet|mainnet-beta)\.solana\.com/i.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'public default Solana clusters are not an approved production profile',
        });
      }
    }

    const legacySecrets = [
      'NAGARIK_STEWARD_SECRET',
      'NAGARIK_REINDEX_SECRET',
      'NAGARIK_RELAYER_SECRET_KEY',
      'NAGARIK_SESSION_DERIVATION_SECRET',
      'NAGARIK_UPLOAD_RECEIPT_SECRET',
      'NAGARIK_V2_LOCAL_SIGNER_PATH',
    ] as const;
    for (const key of legacySecrets) {
      if (env[key])
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'legacy secret is forbidden in production',
        });
    }

    const secretKeys = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'BLOB_READ_WRITE_TOKEN',
      'NAGARIK_CAPABILITY_DERIVATION_KEY',
      'NAGARIK_CAPABILITY_VERIFIER_KEY',
      'NAGARIK_SECURITY_CORRELATION_KEY',
      'NAGARIK_COOKIE_SECRET',
      'NAGARIK_CSRF_SECRET',
      'NAGARIK_WORKER_AUTH_SECRET',
      'CRON_SECRET',
      'NAGARIK_V2_SIGNER_AUTH_SECRET',
      'NAGARIK_ALERT_WEBHOOK_TOKEN',
    ] as const;
    const seen = new Map<string, string>();
    for (const key of secretKeys) {
      const value = env[key];
      if (!value) continue;
      const previous = seen.get(value);
      if (previous) {
        ctx.addIssue({ code: 'custom', path: [key], message: `must differ from ${previous}` });
      } else {
        seen.set(value, key);
      }
    }

    if (env.NAGARIK_ALLOW_REAL_CIVIC_DATA === TRUE && !env.NAGARIK_EXT003_REFERENCE) {
      ctx.addIssue({
        code: 'custom',
        path: ['NAGARIK_ALLOW_REAL_CIVIC_DATA'],
        message: 'requires EXT-003 evidence reference',
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}

export function formatEnvironmentError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .sort()
    .join('; ');
}

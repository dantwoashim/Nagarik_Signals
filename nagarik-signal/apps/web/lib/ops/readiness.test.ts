import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentRelease, runtimeReadiness, type RuntimeEnvironment } from './readiness';

const writableEnvironment: RuntimeEnvironment = {
  NODE_ENV: 'production',
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: '38D4C422038D9AE5BBFBDB05FBB39FCB6C7B10E1',
  VERCEL_GIT_COMMIT_REF: 'main',
  NEXT_PUBLIC_APP_URL: 'https://nagarik-signal.vercel.app',
  NAGARIK_STORAGE_MODE: 'blob',
  BLOB_READ_WRITE_TOKEN: 'blob-secret-value',
  NAGARIK_SESSION_DERIVATION_SECRET: 'session-secret-value-0123456789abcdef',
  NAGARIK_COOKIE_SECRET: 'cookie-secret-value',
  NAGARIK_UPLOAD_RECEIPT_SECRET: 'receipt-secret-value',
  NAGARIK_RATE_LIMIT_SALT: 'rate-salt-value',
  NAGARIK_RATE_LIMIT_PEPPER: 'rate-pepper-value',
  NAGARIK_STEWARD_SECRET: 'steward-secret-value',
  NAGARIK_REINDEX_SECRET: 'reindex-secret-value',
};

function readiness(env: RuntimeEnvironment = writableEnvironment, publicPreviewReadOnly = false) {
  return runtimeReadiness({
    env,
    publicPreviewReadOnly,
    readModelMode: 'vercel_blob',
    mediaStorageMode: 'blob',
    modelExists: true,
    rpcOk: true,
    programDeployed: true,
    relayerAvailable: true,
  });
}

test('a complete hosted configuration exposes capabilities without exposing secret values', () => {
  const result = readiness();
  assert.equal(result.operational, true);
  assert.deepEqual(result.capabilities, {
    publicRead: true,
    reporting: true,
    stewardship: true,
    maintenance: true,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('blob-secret-value'), false);
  assert.equal(serialized.includes('cookie-secret-value'), false);
});

test('a missing trusted production origin fails writable reporting readiness', () => {
  const result = readiness({ ...writableEnvironment, NEXT_PUBLIC_APP_URL: undefined });
  assert.equal(result.capabilities.publicRead, true);
  assert.equal(result.checks.trustedOrigins, false);
  assert.equal(result.capabilities.reporting, false);
  assert.equal(result.operational, false);
});

test('invalid origin entries and weak derivation secrets fail closed', () => {
  const invalidOrigin = readiness({
    ...writableEnvironment,
    NAGARIK_ALLOWED_ORIGINS: 'not-a-url,https://nagarik-signal.vercel.app',
  });
  assert.equal(invalidOrigin.checks.trustedOrigins, false);
  assert.equal(invalidOrigin.capabilities.reporting, false);

  const weakSecret = readiness({
    ...writableEnvironment,
    NAGARIK_SESSION_DERIVATION_SECRET: 'too-short',
  });
  assert.equal(weakSecret.checks.sessionSecurity, false);
  assert.equal(weakSecret.capabilities.reporting, false);
});

test('read-only mode remains operational for public proof without claiming write capability', () => {
  const result = readiness({}, true);
  assert.equal(result.mode, 'read_only');
  assert.equal(result.capabilities.publicRead, true);
  assert.equal(result.capabilities.reporting, false);
  assert.equal(result.operational, true);
});

test('release metadata is normalized and rejects arbitrary values', () => {
  assert.deepEqual(deploymentRelease(writableEnvironment), {
    provider: 'vercel',
    environment: 'production',
    commitSha: '38d4c422038d9ae5bbfbdb05fbb39fcb6c7b10e1',
    commitRef: 'main',
    deploymentId: null,
  });
  assert.equal(deploymentRelease({ NAGARIK_RELEASE_SHA: 'not-a-commit' }).commitSha, null);
  assert.equal(deploymentRelease({
    VERCEL_GIT_COMMIT_SHA: 'invalid',
    NAGARIK_RELEASE_SHA: '1234567',
  }).commitSha, '1234567');
});

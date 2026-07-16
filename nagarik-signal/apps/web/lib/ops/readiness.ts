export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type RuntimeReadinessInput = {
  env: RuntimeEnvironment;
  publicPreviewReadOnly: boolean;
  readModelMode: 'local_json' | 'vercel_blob' | 'bundled_public_snapshot';
  mediaStorageMode: 'local' | 'blob' | null;
  modelExists: boolean;
  rpcOk: boolean;
  programDeployed: boolean;
  relayerAvailable: boolean;
};

function configured(env: RuntimeEnvironment, name: string) {
  return Boolean(env[name]?.trim());
}

function configuredBytes(env: RuntimeEnvironment, name: string, minimumBytes: number) {
  const value = env[name];
  return Boolean(value?.trim()) && new TextEncoder().encode(value).byteLength >= minimumBytes;
}

function validConfiguredOrigin(env: RuntimeEnvironment) {
  const candidates = [
    env.NEXT_PUBLIC_APP_URL,
    ...(env.NAGARIK_ALLOWED_ORIGINS ?? '').split(','),
  ].filter((value): value is string => Boolean(value?.trim()));

  return candidates.length > 0 && candidates.every((value) => {
    try {
      const url = new URL(value.trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

function blobCredentialsConfigured(env: RuntimeEnvironment) {
  return configured(env, 'NAGARIK_BLOB_READ_WRITE_TOKEN')
    || configured(env, 'BLOB_READ_WRITE_TOKEN')
    || (
      configured(env, 'VERCEL_OIDC_TOKEN')
      && (configured(env, 'NAGARIK_BLOB_STORE_ID') || configured(env, 'BLOB_STORE_ID'))
    );
}

function cleanText(value: string | undefined, maxLength = 120) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function cleanCommit(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{7,40}$/.test(normalized) ? normalized : null;
}

export function deploymentRelease(env: RuntimeEnvironment) {
  return {
    provider: env.VERCEL ? 'vercel' : env.GITHUB_ACTIONS ? 'github_actions' : 'local',
    environment: cleanText(env.VERCEL_ENV ?? env.NODE_ENV, 32),
    commitSha: cleanCommit(env.VERCEL_GIT_COMMIT_SHA)
      ?? cleanCommit(env.GITHUB_SHA)
      ?? cleanCommit(env.NAGARIK_RELEASE_SHA),
    commitRef: cleanText(env.VERCEL_GIT_COMMIT_REF ?? env.GITHUB_REF_NAME, 120),
    deploymentId: cleanText(env.VERCEL_DEPLOYMENT_ID, 120),
  };
}

export function runtimeReadiness(input: RuntimeReadinessInput) {
  const production = input.env.NODE_ENV === 'production';
  const blobCredentials = blobCredentialsConfigured(input.env);
  const durableWrites = production
    ? input.readModelMode === 'vercel_blob'
    : input.readModelMode === 'vercel_blob' || input.readModelMode === 'local_json';
  const mediaStorage = input.mediaStorageMode !== null
    && (!production || input.mediaStorageMode === 'blob')
    && (input.mediaStorageMode !== 'blob' || blobCredentials);
  const sessionSecurity = !production || (
    (configured(input.env, 'NAGARIK_COOKIE_SECRET') || configured(input.env, 'NAGARIK_SESSION_DERIVATION_SECRET'))
    && configuredBytes(input.env, 'NAGARIK_SESSION_DERIVATION_SECRET', 32)
    && (configured(input.env, 'NAGARIK_UPLOAD_RECEIPT_SECRET') || configured(input.env, 'NAGARIK_COOKIE_SECRET'))
  );
  const abuseProtection = !production || (
    configured(input.env, 'NAGARIK_RATE_LIMIT_SALT')
    && (configured(input.env, 'NAGARIK_RATE_LIMIT_PEPPER') || configured(input.env, 'NAGARIK_COOKIE_SECRET'))
  );
  const trustedOrigins = !production || validConfiguredOrigin(input.env);
  const stewardAuth = !production || configured(input.env, 'NAGARIK_STEWARD_SECRET');
  const maintenanceAuth = !production || configured(input.env, 'NAGARIK_REINDEX_SECRET');
  const publicRead = input.modelExists && input.rpcOk && input.programDeployed;
  const reporting = !input.publicPreviewReadOnly
    && publicRead
    && durableWrites
    && mediaStorage
    && sessionSecurity
    && abuseProtection
    && trustedOrigins
    && input.relayerAvailable;
  const stewardship = reporting && stewardAuth;
  const maintenance = !input.publicPreviewReadOnly && publicRead && maintenanceAuth;
  const operational = publicRead && (
    input.publicPreviewReadOnly || (reporting && stewardship && maintenance)
  );

  return {
    operational,
    mode: input.publicPreviewReadOnly ? 'read_only' : 'writable',
    capabilities: {
      publicRead,
      reporting,
      stewardship,
      maintenance,
    },
    checks: {
      modelExists: input.modelExists,
      rpc: input.rpcOk,
      program: input.programDeployed,
      durableWrites,
      mediaStorage,
      sessionSecurity,
      abuseProtection,
      trustedOrigins,
      relayer: input.relayerAvailable,
      stewardAuth,
      maintenanceAuth,
    },
  };
}

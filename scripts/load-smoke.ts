import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

type RequestResult = {
  path: string;
  status: number | null;
  durationMs: number;
  bytes: number;
  error: string | null;
};

export type LoadSmokeConfig = {
  baseUrl: string;
  expectedSha: string | null;
  protectionBypassSecret: string | null;
  requests: number;
  concurrency: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxErrorRate: number;
  maxP95Ms: number;
  paths: string[];
  outputPath: string;
  gatePath: string;
};

function normalized(path: string) {
  return path.replaceAll('\\', '/');
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_must_be_integer_${minimum}_to_${maximum}`);
  }
  return value;
}

function boundedNumber(name: string, value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_must_be_${minimum}_to_${maximum}`);
  }
  return value;
}

function targetOrigin(value: string) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('load_target_requires_https_or_loopback');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('load_target_must_be_plain_origin');
  }
  return url.origin;
}

function optionalHeaderSecret(value: string | null) {
  const secret = value?.trim() || null;
  if (secret && (secret.length > 1_024 || /[\u0000-\u001f\u007f]/.test(secret))) {
    throw new Error('load_protection_bypass_secret_invalid');
  }
  return secret;
}

function requestHeaders(config: LoadSmokeConfig, accept: string) {
  const headers: Record<string, string> = {
    accept,
    'user-agent': 'nagarik-release-load-smoke/1',
  };
  if (config.protectionBypassSecret) {
    headers['x-vercel-protection-bypass'] = config.protectionBypassSecret;
  }
  return headers;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
}

function errorCode(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'request_timeout';
    return error.message.slice(0, 120).replaceAll(/https?:\/\/[^\s]+/g, '[target]');
  }
  return 'request_failed';
}

async function requestOnce(config: LoadSmokeConfig, path: string): Promise<RequestResult> {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, config.baseUrl), {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: requestHeaders(config, path.startsWith('/api/') ? 'application/json' : 'text/html'),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > config.maxResponseBytes) {
      throw new Error('response_too_large');
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > config.maxResponseBytes) throw new Error('response_too_large');
    return {
      path,
      status: response.status,
      durationMs: performance.now() - started,
      bytes: body.byteLength,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      path,
      status: null,
      durationMs: performance.now() - started,
      bytes: 0,
      error: errorCode(error),
    };
  }
}

async function releaseIdentity(config: LoadSmokeConfig) {
  const response = await fetch(new URL('/api/health', config.baseUrl), {
    method: 'GET',
    cache: 'no-store',
    headers: requestHeaders(config, 'application/json'),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`load_health_http_${response.status}`);
  const payload = (await response.json()) as {
    ok?: unknown;
    release?: { commitSha?: unknown };
  };
  const commitSha = payload.release?.commitSha;
  if (payload.ok !== true || typeof commitSha !== 'string' || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error('load_health_release_missing');
  }
  if (config.expectedSha && commitSha !== config.expectedSha) {
    throw new Error('load_release_commit_mismatch');
  }
  return commitSha;
}

export async function runLoadSmoke(input: LoadSmokeConfig) {
  const config: LoadSmokeConfig = {
    ...input,
    baseUrl: targetOrigin(input.baseUrl),
    protectionBypassSecret: optionalHeaderSecret(input.protectionBypassSecret),
    requests: boundedInteger('load_requests', input.requests, 1, 5_000),
    concurrency: boundedInteger('load_concurrency', input.concurrency, 1, 100),
    timeoutMs: boundedInteger('load_timeout_ms', input.timeoutMs, 100, 60_000),
    maxResponseBytes: boundedInteger(
      'load_max_response_bytes',
      input.maxResponseBytes,
      1_024,
      10_000_000,
    ),
    maxErrorRate: boundedNumber('load_max_error_rate', input.maxErrorRate, 0, 1),
    maxP95Ms: boundedNumber('load_max_p95_ms', input.maxP95Ms, 1, 60_000),
  };
  if (!config.paths.length || config.paths.some((path) => !path.startsWith('/'))) {
    throw new Error('load_paths_invalid');
  }

  const commitSha = await releaseIdentity(config);
  const results: RequestResult[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, config.requests) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= config.requests) return;
        results[index] = await requestOnce(config, config.paths[index % config.paths.length]);
      }
    }),
  );

  const failures = results.filter((result) => result.error !== null);
  const durations = results.map((result) => result.durationMs);
  const errorRate = failures.length / results.length;
  const p95Ms = percentile(durations, 0.95) ?? Number.POSITIVE_INFINITY;
  const passed = errorRate <= config.maxErrorRate && p95Ms <= config.maxP95Ms;
  const byPath = Object.fromEntries(
    config.paths.map((path) => {
      const selected = results.filter((result) => result.path === path);
      return [
        path,
        {
          requests: selected.length,
          failures: selected.filter((result) => result.error !== null).length,
          p50Ms: percentile(
            selected.map((result) => result.durationMs),
            0.5,
          ),
          p95Ms: percentile(
            selected.map((result) => result.durationMs),
            0.95,
          ),
        },
      ];
    }),
  );
  const report = {
    schemaVersion: 'nagarik-load-smoke-v1',
    generatedAt: new Date().toISOString(),
    targetOrigin: config.baseUrl,
    releaseId: commitSha,
    method: 'GET',
    mutationRequests: 0,
    requests: results.length,
    concurrency: config.concurrency,
    thresholds: { maxErrorRate: config.maxErrorRate, maxP95Ms: config.maxP95Ms },
    result: {
      passed,
      failures: failures.length,
      errorRate: Math.round(errorRate * 1_000_000) / 1_000_000,
      p50Ms: percentile(durations, 0.5),
      p95Ms,
      p99Ms: percentile(durations, 0.99),
      bytes: results.reduce((total, result) => total + result.bytes, 0),
    },
    byPath,
    errors: Object.fromEntries(
      [...new Set(failures.map((result) => result.error!))]
        .sort()
        .map((code) => [code, failures.filter((result) => result.error === code).length]),
    ),
  };

  const outputPath = resolve(config.outputPath);
  const gatePath = resolve(config.gatePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(dirname(gatePath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(
    gatePath,
    `${JSON.stringify(
      {
        status: passed ? 'pass' : 'fail',
        artifact: normalized(relative(process.cwd(), outputPath)),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  if (!passed) throw new Error('load_smoke_threshold_failed');
  return report;
}

function requiredNumber(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return Number(value);
}

async function main() {
  const publicId = process.env.NAGARIK_LOAD_PUBLIC_ID?.trim();
  const paths = [
    '/api/health',
    '/api/health/ready',
    '/api/v2/issues/stats',
    '/api/v2/issues?limit=20',
    '/',
    '/explore',
    ...(publicId
      ? [
          `/api/v2/issues/${encodeURIComponent(publicId)}`,
          `/api/v2/issues/${encodeURIComponent(publicId)}/proof`,
          `/issues/${encodeURIComponent(publicId)}`,
        ]
      : []),
  ];
  const report = await runLoadSmoke({
    baseUrl: process.env.NAGARIK_LOAD_BASE_URL?.trim() ?? '',
    expectedSha: process.env.NAGARIK_LOAD_EXPECTED_SHA?.trim().toLowerCase() || null,
    protectionBypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null,
    requests: Number(process.env.NAGARIK_LOAD_REQUESTS ?? 200),
    concurrency: Number(process.env.NAGARIK_LOAD_CONCURRENCY ?? 8),
    timeoutMs: Number(process.env.NAGARIK_LOAD_TIMEOUT_MS ?? 8_000),
    maxResponseBytes: Number(process.env.NAGARIK_LOAD_MAX_RESPONSE_BYTES ?? 2_000_000),
    maxErrorRate: requiredNumber('NAGARIK_LOAD_MAX_ERROR_RATE'),
    maxP95Ms: requiredNumber('NAGARIK_LOAD_MAX_P95_MS'),
    paths,
    outputPath: process.env.NAGARIK_LOAD_OUTPUT ?? 'artifacts/operations/load-smoke.json',
    gatePath: process.env.NAGARIK_LOAD_GATE ?? 'artifacts/release/gates/loadSmoke.json',
  });
  console.log(JSON.stringify(report, null, 2));
}

const entryName = process.argv[1] ? basename(process.argv[1]) : '';
if (/^load-smoke\.(?:[cm]?[jt]s)$/.test(entryName)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'load_smoke_failed');
    process.exitCode = 1;
  });
}

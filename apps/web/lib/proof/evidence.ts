import { createHash } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const HEX_32 = /^[a-f0-9]{64}$/i;

export type DeliveredEvidenceResult = {
  status: 'match' | 'mismatch' | 'unavailable';
  available: boolean;
  expectedHash: string;
  computedHash: string | null;
  byteLength: number | null;
  mediaType: string | null;
  error: string | null;
};

type EvidenceOptions = {
  appOrigin?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

function normalizeOrigin(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('app_origin_must_use_http');
  return url.origin;
}

function configuredAppOrigin(explicitOrigin?: string) {
  const configured =
    explicitOrigin ??
    process.env.NAGARIK_INTERNAL_APP_URL ??
    process.env.VERCEL_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) return normalizeOrigin(configured);
  if (process.env.NODE_ENV !== 'production') {
    return `http://127.0.0.1:${process.env.PORT ?? '3001'}`;
  }
  throw new Error('app_origin_not_configured_for_evidence_verification');
}

function resolveEvidenceUrl(photoUrl: string, appOrigin?: string) {
  const origin = configuredAppOrigin(appOrigin);
  const trimmed = photoUrl.trim();
  if (!trimmed) throw new Error('evidence_url_missing');
  if (trimmed.startsWith('//')) throw new Error('cross_origin_evidence_url_rejected');

  const resolved = trimmed.startsWith('/') ? new URL(trimmed, origin) : new URL(trimmed);
  if (resolved.username || resolved.password || resolved.origin !== origin) {
    throw new Error('cross_origin_evidence_url_rejected');
  }
  return resolved;
}

function unavailable(expectedHash: string, error: string): DeliveredEvidenceResult {
  return {
    status: 'unavailable',
    available: false,
    expectedHash,
    computedHash: null,
    byteLength: null,
    mediaType: null,
    error,
  };
}

export async function verifyDeliveredEvidence(
  photoUrl: string,
  expectedHash: string,
  options: EvidenceOptions = {}
): Promise<DeliveredEvidenceResult> {
  const normalizedExpectedHash = expectedHash.trim().toLowerCase();
  if (!HEX_32.test(normalizedExpectedHash)) {
    return unavailable(normalizedExpectedHash, 'stored_evidence_hash_invalid');
  }

  let url: URL;
  try {
    url = resolveEvidenceUrl(photoUrl, options.appOrigin);
  } catch (error) {
    return unavailable(
      normalizedExpectedHash,
      error instanceof Error ? error.message : 'evidence_url_invalid'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,application/octet-stream' },
    });
    if (!response.ok) return unavailable(normalizedExpectedHash, `evidence_http_${response.status}`);
    if (!response.body) return unavailable(normalizedExpectedHash, 'evidence_response_body_missing');

    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body.cancel();
      return unavailable(normalizedExpectedHash, 'evidence_response_too_large');
    }

    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return unavailable(normalizedExpectedHash, 'evidence_response_too_large');
      }
      hash.update(value);
    }
    if (byteLength === 0) return unavailable(normalizedExpectedHash, 'evidence_response_empty');

    const computedHash = hash.digest('hex');
    const matches = computedHash === normalizedExpectedHash;
    return {
      status: matches ? 'match' : 'mismatch',
      available: true,
      expectedHash: normalizedExpectedHash,
      computedHash,
      byteLength,
      mediaType: response.headers.get('content-type'),
      error: matches ? null : 'delivered_evidence_hash_mismatch',
    };
  } catch (error) {
    return unavailable(
      normalizedExpectedHash,
      error instanceof Error && error.name === 'AbortError'
        ? 'evidence_fetch_timeout'
        : 'evidence_fetch_failed'
    );
  } finally {
    clearTimeout(timeout);
  }
}

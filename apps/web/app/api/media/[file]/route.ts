import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireOperator } from '@/lib/auth/operator';
import { databaseExecutor } from '@/lib/db/transaction';
import {
  capabilityKeysFromEnvironment,
  parseCapabilityToken,
} from '@/lib/security/capabilityTokens';
import { authorizeTrackingCapability } from '@/lib/security/trackingCapabilityCore';
import {
  isPrivateMediaReadable,
  isPublicMediaReadable,
  parseOpaqueMediaId,
} from '@/lib/storage/mediaAccess';
import {
  isValidMediaFileName,
  MediaStorageConfigurationError,
  privateMediaCacheControl,
  readStoredMedia,
} from '@/lib/storage/media';
import { readPrivateObject } from '@/lib/storage/privateStorage';

export const runtime = 'nodejs';

const publicMediaCacheControl = 'public, max-age=60, s-maxage=300, must-revalidate';

type MediaRow = {
  id: string;
  organization_id: string;
  state: string;
  source_media_id: string | null;
  storage_key: string;
  mime_type: string;
  byte_length: number;
  sha256: Uint8Array;
  expires_at: string | null;
  projection_state: string | null;
  publication_state: string | null;
  public_read_enabled: boolean;
  public_media_enabled: boolean;
  access_restricted: boolean;
};

function asResponseBody(body: ReadableStream<Uint8Array> | Uint8Array): BodyInit {
  if (body instanceof ReadableStream) return body;
  const buffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(buffer).set(body);
  return buffer;
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator > 0 && segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return null;
}

function trackingToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('NagarikTracking ')) {
    return authorization.slice('NagarikTracking '.length);
  }
  return (
    cookieValue(request, '__Host-nagarik-tracking') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-tracking'))
  );
}

function neutralNotFound() {
  return NextResponse.json(
    { ok: false, error: 'media_not_found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function legacyDevelopmentResponse(request: Request, file: string): Promise<Response> {
  if (process.env.NODE_ENV === 'production' || !isValidMediaFileName(file)) {
    return neutralNotFound();
  }
  try {
    const media = await readStoredMedia(file, request.headers.get('if-none-match'));
    if (!media) return neutralNotFound();
    const headers = {
      'Cache-Control': privateMediaCacheControl,
      'Content-Disposition': 'inline',
      'Content-Type': media.contentType,
      ETag: media.etag,
      'X-Content-Type-Options': 'nosniff',
      ...(media.contentLength === null ? {} : { 'Content-Length': String(media.contentLength) }),
    };
    if (media.status === 304) return new Response(null, { status: 304, headers });
    return new Response(asResponseBody(media.body), { headers });
  } catch {
    return neutralNotFound();
  }
}

async function trackingAuthorized(request: Request, media: MediaRow): Promise<boolean> {
  const token = trackingToken(request);
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!token || !parsed || parsed.purpose !== 'submission_tracking') return false;

  const rows = await databaseExecutor().query(
    `select
       capability.id as capability_id,
       capability.organization_id,
       capability.subject_id,
       capability.issuance_idempotency_id,
       capability.key_version,
       capability.verifier,
       capability.state as capability_state,
       capability.scope,
       capability.expires_at,
       submission.id as submission_id,
       submission.tracking_id
     from nagarik.capabilities capability
     join nagarik.submissions submission on submission.id = capability.subject_id
     join nagarik.submission_revisions revision
       on revision.submission_id = submission.id
      and revision.revision_number = submission.current_revision_number
     join nagarik.submission_media binding on binding.revision_id = revision.id
     where capability.id = $1::uuid
       and capability.purpose = 4
       and binding.media_id = $2::uuid
       and capability.organization_id = $3::uuid
     limit 1`,
    [parsed.capabilityId, media.id, media.organization_id],
  );
  const row = rows[0];
  if (!row) return false;
  return Boolean(
    authorizeTrackingCapability(
      token,
      {
        keyVersion: Number(row.key_version),
        purpose: 'submission_tracking',
        organizationId: String(row.organization_id),
        capabilityId: String(row.capability_id),
        subjectId: String(row.subject_id),
        issuanceIdempotencyId: String(row.issuance_idempotency_id),
        verifier: row.verifier as Uint8Array,
        state: String(row.capability_state),
        expiresAt: new Date(String(row.expires_at)),
        scope: row.scope,
      },
      {
        submissionId: String(row.submission_id),
        trackingId: String(row.tracking_id),
        organizationId: String(row.organization_id),
      },
      capabilityKeysFromEnvironment(),
    ),
  );
}

async function operatorAuthorized(media: MediaRow): Promise<boolean> {
  try {
    await requireOperator({
      organizationId: media.organization_id,
      roles: ['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin'],
    });
    return true;
  } catch {
    return false;
  }
}

function mediaHeaders(input: {
  media: MediaRow;
  etag: string;
  access: 'public' | 'private';
}): HeadersInit {
  return {
    'Cache-Control': input.access === 'public' ? publicMediaCacheControl : privateMediaCacheControl,
    'Content-Disposition': 'inline',
    'Content-Length': String(input.media.byte_length),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': input.media.mime_type,
    'Cross-Origin-Resource-Policy': 'same-origin',
    ETag: input.etag,
    'X-Content-Type-Options': 'nosniff',
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const mediaId = parseOpaqueMediaId(file);
  if (!mediaId) return legacyDevelopmentResponse(request, file);

  try {
    const rows = await databaseExecutor().query(
      `select
         media.id,
         media.organization_id,
         media.state,
         media.source_media_id,
         media.storage_key,
         media.mime_type,
         media.byte_length,
         media.sha256,
         media.expires_at,
         projection.state as projection_state,
         issue.publication_state,
         coalesce(nagarik.is_issue_access_restricted(projection.issue_public_id), false)
           as access_restricted,
         coalesce(public_read.disabled = false, false) as public_read_enabled,
         coalesce(public_media.disabled = false, false) as public_media_enabled
       from nagarik.media_objects media
       left join public.media_projection projection on projection.media_id = media.id
       left join public.issue_projection issue
         on issue.public_id = projection.issue_public_id
        and issue.version_id = projection.version_id
       left join nagarik.capability_kill_switches public_read
         on public_read.capability = 'publicReadEnabled'
       left join nagarik.capability_kill_switches public_media
         on public_media.capability = 'publicMediaEnabled'
       where media.id = $1::uuid
       limit 1`,
      [mediaId],
    );
    const media = rows[0] as MediaRow | undefined;
    if (!media) return neutralNotFound();

    const publicAccess =
      !media.access_restricted &&
      isPublicMediaReadable({
        mediaState: media.state,
        hasSourceDerivative: Boolean(media.source_media_id),
        projectionEligible: media.projection_state === 'eligible',
        issuePublicationState: media.publication_state,
        publicReadEnabled: media.public_read_enabled,
        publicMediaEnabled: media.public_media_enabled,
      });

    let access: 'public' | 'private' | null = publicAccess ? 'public' : null;
    if (!access) {
      const expiresAt = media.expires_at ? new Date(media.expires_at) : null;
      if (
        isPrivateMediaReadable({
          mediaState: media.state,
          expiresAt,
          now: new Date(),
          requester: 'tracking',
        }) &&
        (await trackingAuthorized(request, media))
      ) {
        access = 'private';
      } else if (
        isPrivateMediaReadable({
          mediaState: media.state,
          expiresAt,
          now: new Date(),
          requester: 'operator',
        }) &&
        (await operatorAuthorized(media))
      ) {
        access = 'private';
      }
    }
    if (!access) return neutralNotFound();

    const object = await readPrivateObject(media.storage_key, media.byte_length);
    if (
      object.bytes.byteLength !== media.byte_length ||
      object.contentType !== media.mime_type ||
      !createHash('sha256').update(object.bytes).digest().equals(Buffer.from(media.sha256))
    ) {
      throw new Error('media_integrity_mismatch');
    }
    const etag = `"sha256-${Buffer.from(media.sha256).toString('hex')}"`;
    const headers = mediaHeaders({ media, etag, access });
    if (access === 'public' && request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(asResponseBody(object.bytes), { headers });
  } catch (error) {
    if (error instanceof MediaStorageConfigurationError) {
      return NextResponse.json(
        { ok: false, error: 'media_storage_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return neutralNotFound();
  }
}

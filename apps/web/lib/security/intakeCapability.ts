import 'server-only';

import {
  capabilityKeysFromEnvironment,
  parseCapabilityToken,
} from '@/lib/security/capabilityTokens';
import {
  authorizeIntakeCapability,
  type IntakeCapability,
  type IntakeCapabilityRow,
} from '@/lib/security/intakeCapabilityCore';
import { databaseExecutor } from '@/lib/db/transaction';

export class IntakeAuthorizationError extends Error {
  constructor(
    public readonly code: 'intake_disabled' | 'intake_capability_required',
    public readonly status: 401 | 503,
  ) {
    super(code);
    this.name = 'IntakeAuthorizationError';
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 1) continue;
    if (segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return null;
}

function intakeCookie(request: Request): string | null {
  return (
    cookieValue(request, '__Host-nagarik-pilot') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-pilot'))
  );
}

export async function requireIntakeCapability(request: Request): Promise<IntakeCapability> {
  if (process.env.NAGARIK_CAP_INVITE_INTAKE !== 'true') {
    throw new IntakeAuthorizationError('intake_disabled', 503);
  }

  const token = intakeCookie(request);
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!token || !parsed || parsed.purpose !== 'pilot_intake') {
    throw new IntakeAuthorizationError('intake_capability_required', 401);
  }

  const rows = await databaseExecutor().query(
    `select
       capability.id,
       capability.organization_id,
       capability.purpose,
       capability.subject_id,
       capability.issuance_idempotency_id,
       capability.key_version,
       capability.verifier,
       capability.state,
       capability.scope,
       capability.expires_at,
       switch.disabled as intake_disabled
     from nagarik.capabilities capability
     join nagarik.capability_kill_switches switch
       on switch.capability = 'inviteIntakeEnabled'
     where capability.id = $1::uuid
       and capability.purpose = 2
     limit 1`,
    [parsed.capabilityId],
  );
  const raw = rows[0];
  if (!raw || raw.intake_disabled === true) {
    throw new IntakeAuthorizationError('intake_disabled', 503);
  }

  const row: IntakeCapabilityRow = {
    keyVersion: Number(raw.key_version),
    purpose: 'pilot_intake',
    organizationId: String(raw.organization_id),
    capabilityId: String(raw.id),
    subjectId: String(raw.subject_id),
    issuanceIdempotencyId: String(raw.issuance_idempotency_id),
    verifier: raw.verifier as Uint8Array,
    state: raw.state as IntakeCapabilityRow['state'],
    expiresAt: new Date(String(raw.expires_at)),
    scope: raw.scope,
  };
  const authorized = authorizeIntakeCapability(token, row, capabilityKeysFromEnvironment());
  if (!authorized) {
    throw new IntakeAuthorizationError('intake_capability_required', 401);
  }
  return authorized;
}

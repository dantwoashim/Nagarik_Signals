import 'server-only';

import { databaseExecutor } from '@/lib/db/transaction';
import {
  capabilityKeysFromEnvironment,
  parseCapabilityToken,
} from '@/lib/security/capabilityTokens';
import {
  authorizeSignalCapability,
  type AuthorizedSignalCapability,
  type SignalCapabilityRow,
} from '@/lib/security/signalCapabilityCore';

export class SignalAuthorizationError extends Error {
  constructor(
    public readonly code: 'signals_disabled' | 'signal_capability_required',
    public readonly status: 401 | 503,
  ) {
    super(code);
    this.name = 'SignalAuthorizationError';
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

function signalCookie(request: Request): string | null {
  return (
    cookieValue(request, '__Host-nagarik-signal-context') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-signal-context'))
  );
}

export async function requireSignalCapability(
  request: Request,
): Promise<AuthorizedSignalCapability> {
  if (process.env.NAGARIK_CAP_INVITE_SIGNALS !== 'true') {
    throw new SignalAuthorizationError('signals_disabled', 503);
  }
  const token = signalCookie(request);
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!token || !parsed || parsed.purpose !== 'pilot_signal') {
    throw new SignalAuthorizationError('signal_capability_required', 401);
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
       switch.disabled as signals_disabled
     from nagarik.capabilities capability
     join nagarik.capability_kill_switches switch
       on switch.capability = 'inviteSignalsEnabled'
     where capability.id = $1::uuid
       and capability.purpose = 3
     limit 1`,
    [parsed.capabilityId],
  );
  const raw = rows[0];
  if (!raw || raw.signals_disabled === true) {
    throw new SignalAuthorizationError('signals_disabled', 503);
  }
  const row: SignalCapabilityRow = {
    keyVersion: Number(raw.key_version),
    purpose: 'pilot_signal',
    organizationId: String(raw.organization_id),
    capabilityId: String(raw.id),
    subjectId: String(raw.subject_id),
    issuanceIdempotencyId: String(raw.issuance_idempotency_id),
    verifier: raw.verifier as Uint8Array,
    state: raw.state as SignalCapabilityRow['state'],
    expiresAt: new Date(String(raw.expires_at)),
    scope: raw.scope,
  };
  const authorized = authorizeSignalCapability(token, row, capabilityKeysFromEnvironment());
  if (!authorized) {
    throw new SignalAuthorizationError('signal_capability_required', 401);
  }
  return authorized;
}

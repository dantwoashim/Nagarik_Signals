const opaqueMediaIdPattern =
  /^med_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

const trackingReadableStates = new Set(['quarantined', 'approved_private', 'redacted_derivative']);

const operatorReadableStates = new Set([...trackingReadableStates, 'approved_public']);

export function parseOpaqueMediaId(value: string): string | null {
  return opaqueMediaIdPattern.exec(value)?.[1] ?? null;
}

export function isPublicMediaReadable(input: {
  mediaState: string;
  hasSourceDerivative: boolean;
  projectionEligible: boolean;
  issuePublicationState: string | null;
  publicReadEnabled: boolean;
  publicMediaEnabled: boolean;
}): boolean {
  return (
    input.mediaState === 'approved_public' &&
    input.hasSourceDerivative &&
    input.projectionEligible &&
    (input.issuePublicationState === 'published' || input.issuePublicationState === 'superseded') &&
    input.publicReadEnabled &&
    input.publicMediaEnabled
  );
}

export function isPrivateMediaReadable(input: {
  mediaState: string;
  expiresAt: Date | null;
  now: Date;
  requester: 'tracking' | 'operator';
}): boolean {
  if (input.expiresAt && input.expiresAt <= input.now) return false;
  return (input.requester === 'tracking' ? trackingReadableStates : operatorReadableStates).has(
    input.mediaState,
  );
}

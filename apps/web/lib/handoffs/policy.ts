import type { AuthorityHandoff, HandoffEvidenceBasis, HandoffState } from '../types';

export type HandoffDraftInput = {
  state?: unknown;
  authorityName?: unknown;
  channelName?: unknown;
  channelUrl?: unknown;
  externalReference?: unknown;
  note?: unknown;
  occurredAt?: unknown;
  followUpDueAt?: unknown;
  receiptPhotoUrl?: unknown;
  receiptEvidenceHash?: unknown;
  receiptPrivacyReviewed?: unknown;
};

export type ValidatedHandoffDraft = {
  state: HandoffState;
  authorityName: string;
  channelName: string;
  channelUrl: string | null;
  externalReference: string | null;
  note: string;
  occurredAt: string;
  followUpDueAt: string | null;
  receiptPhotoUrl: string | null;
  receiptEvidenceHash: string | null;
  receiptPrivacyReviewed: boolean;
  evidenceBasis: HandoffEvidenceBasis;
};

export const handoffStates: ReadonlyArray<{ id: HandoffState; label: string }> = [
  { id: 'prepared', label: 'Route prepared' },
  { id: 'submitted', label: 'Submitted to channel' },
  { id: 'acknowledged', label: 'Acknowledgement recorded' },
  { id: 'follow_up', label: 'Follow-up recorded' },
  { id: 'closed', label: 'Handoff closed' },
];

const transitions: Record<HandoffState | 'none', readonly HandoffState[]> = {
  none: ['prepared', 'submitted'],
  prepared: ['submitted'],
  submitted: ['acknowledged', 'follow_up', 'closed'],
  acknowledged: ['follow_up', 'closed'],
  follow_up: ['follow_up', 'acknowledged', 'closed'],
  closed: [],
};

const DAY = 86_400_000;
const HEX_32 = /^[0-9a-f]{64}$/;
const MEDIA_PATH = /^\/api\/media\/([0-9a-f]{64})\.(jpg|jpeg|png|webp)$/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function handoffStateLabel(state: HandoffState | null | undefined) {
  return handoffStates.find((item) => item.id === state)?.label ?? 'Not routed';
}

export function nextHandoffStates(previous: HandoffState | null | undefined) {
  return [...transitions[previous ?? 'none']];
}

export function handoffDraftMatches(record: AuthorityHandoff, draft: ValidatedHandoffDraft) {
  return record.state === draft.state
    && record.authorityName === draft.authorityName
    && record.channelName === draft.channelName
    && record.channelUrl === draft.channelUrl
    && record.externalReference === draft.externalReference
    && record.note === draft.note
    && record.occurredAt === draft.occurredAt
    && record.followUpDueAt === draft.followUpDueAt
    && record.receiptPhotoUrl === draft.receiptPhotoUrl
    && record.receiptEvidenceHash === draft.receiptEvidenceHash
    && record.receiptPrivacyReviewed === draft.receiptPrivacyReviewed
    && record.evidenceBasis === draft.evidenceBasis;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function validText(value: string, minimum: number, maximum: number) {
  return value.length >= minimum && value.length <= maximum && !CONTROL_CHARACTERS.test(value);
}

function parseIso(value: string, fallback: number) {
  const timestamp = value ? Date.parse(value) : fallback;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeHttpsUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 500) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateHandoffDraft(
  input: HandoffDraftInput,
  previousState: HandoffState | null,
  nowMs = Date.now(),
): { ok: true; value: ValidatedHandoffDraft } | { ok: false; error: string } {
  const state = text(input.state) as HandoffState;
  if (!handoffStates.some((item) => item.id === state)) return { ok: false, error: 'invalid_handoff_state' };
  if (!nextHandoffStates(previousState).includes(state)) return { ok: false, error: 'invalid_handoff_transition' };

  const authorityName = text(input.authorityName);
  const channelName = text(input.channelName);
  const rawChannelUrl = text(input.channelUrl);
  const channelUrl = normalizeHttpsUrl(rawChannelUrl);
  const externalReference = text(input.externalReference) || null;
  const note = text(input.note);
  if (!validText(authorityName, 2, 120)) return { ok: false, error: 'invalid_authority_name' };
  if (!validText(channelName, 2, 120)) return { ok: false, error: 'invalid_channel_name' };
  if (rawChannelUrl && !channelUrl) return { ok: false, error: 'invalid_channel_url' };
  if (externalReference && !validText(externalReference, 2, 160)) {
    return { ok: false, error: 'invalid_external_reference' };
  }
  if (note && !validText(note, 1, 1_000)) return { ok: false, error: 'invalid_handoff_note' };

  const occurredAt = parseIso(text(input.occurredAt), nowMs);
  if (!occurredAt) return { ok: false, error: 'invalid_handoff_occurred_at' };
  const occurredMs = Date.parse(occurredAt);
  if (occurredMs > nowMs + 5 * 60_000 || occurredMs < nowMs - 366 * DAY) {
    return { ok: false, error: 'handoff_occurred_at_outside_range' };
  }

  const rawFollowUpDueAt = text(input.followUpDueAt);
  const followUpDueAt = rawFollowUpDueAt ? parseIso(rawFollowUpDueAt, nowMs) : null;
  if (rawFollowUpDueAt && !followUpDueAt) return { ok: false, error: 'invalid_follow_up_due_at' };
  if (followUpDueAt) {
    const dueMs = Date.parse(followUpDueAt);
    if (dueMs <= occurredMs || dueMs > occurredMs + 366 * DAY) {
      return { ok: false, error: 'follow_up_due_at_outside_range' };
    }
  }

  const receiptPhotoUrl = text(input.receiptPhotoUrl) || null;
  const receiptEvidenceHash = text(input.receiptEvidenceHash).toLowerCase() || null;
  if (Boolean(receiptPhotoUrl) !== Boolean(receiptEvidenceHash)) {
    return { ok: false, error: 'receipt_artifact_incomplete' };
  }
  if (receiptEvidenceHash && !HEX_32.test(receiptEvidenceHash)) {
    return { ok: false, error: 'invalid_receipt_evidence_hash' };
  }
  if (receiptPhotoUrl) {
    const match = receiptPhotoUrl.match(MEDIA_PATH);
    if (!match || match[1].toLowerCase() !== receiptEvidenceHash) {
      return { ok: false, error: 'invalid_receipt_photo_url' };
    }
    if (input.receiptPrivacyReviewed !== true) {
      return { ok: false, error: 'receipt_privacy_review_required' };
    }
  }

  if (state === 'prepared' && (externalReference || receiptPhotoUrl)) {
    return { ok: false, error: 'prepared_route_cannot_claim_submission_evidence' };
  }
  if (state === 'submitted' && !externalReference && !receiptPhotoUrl) {
    return { ok: false, error: 'submission_reference_or_receipt_required' };
  }
  if (state === 'acknowledged' && !receiptPhotoUrl) {
    return { ok: false, error: 'acknowledgement_receipt_required' };
  }
  if ((state === 'submitted' || state === 'follow_up') && !followUpDueAt) {
    return { ok: false, error: 'follow_up_due_at_required' };
  }
  if ((state === 'follow_up' || state === 'closed') && note.length < 8) {
    return { ok: false, error: 'handoff_note_required' };
  }
  if (state === 'closed' && followUpDueAt) return { ok: false, error: 'closed_handoff_cannot_have_follow_up' };

  const evidenceBasis: HandoffEvidenceBasis = receiptPhotoUrl
    ? 'redacted_receipt'
    : externalReference
      ? 'external_reference'
      : 'route_only';

  return {
    ok: true,
    value: {
      state,
      authorityName,
      channelName,
      channelUrl,
      externalReference,
      note,
      occurredAt,
      followUpDueAt,
      receiptPhotoUrl,
      receiptEvidenceHash,
      receiptPrivacyReviewed: Boolean(receiptPhotoUrl),
      evidenceBasis,
    },
  };
}

export type KnownDefectCounts = {
  p0: number | null;
  p1: number | null;
  p2: number | null;
  p3: number | null;
};

export type KnownDefectReview = {
  status: 'invalid' | 'missing' | 'pass';
  reason: string | null;
  releaseId: string | null;
  reviewedAt: string | null;
  ownerReference: string | null;
  reviewerReference: string | null;
  evidenceReferences: string[];
};

const emptyCounts: KnownDefectCounts = { p0: null, p1: null, p2: null, p3: null };
const releasePattern = /^[0-9a-f]{40}$/;
const referencePattern =
  /^(?:restricted:[a-zA-Z0-9._:/-]{6,220}|https:\/\/github\.com\/[a-zA-Z0-9._/-]{6,220})$/;
const maximumReviewAgeMs = 30 * 24 * 60 * 60 * 1_000;
const clockSkewMs = 5 * 60 * 1_000;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function reference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return referencePattern.test(normalized) ? normalized : null;
}

function invalid(reason: string): { counts: KnownDefectCounts; review: KnownDefectReview } {
  return {
    counts: { ...emptyCounts },
    review: {
      status: 'invalid',
      reason,
      releaseId: null,
      reviewedAt: null,
      ownerReference: null,
      reviewerReference: null,
      evidenceReferences: [],
    },
  };
}

export function parseKnownDefectEvidence(
  value: unknown,
  input: { expectedReleaseId: string; releaseCommittedAt: Date; now?: Date },
): { counts: KnownDefectCounts; review: KnownDefectReview } {
  if (value === null || value === undefined) {
    return {
      counts: { ...emptyCounts },
      review: {
        status: 'missing',
        reason: 'known_defect_review_missing',
        releaseId: null,
        reviewedAt: null,
        ownerReference: null,
        reviewerReference: null,
        evidenceReferences: [],
      },
    };
  }

  const source = object(value);
  if (!source) return invalid('known_defect_review_must_be_object');
  if (source.schemaVersion !== 'nagarik-known-defects-v1') {
    return invalid('known_defect_review_schema_invalid');
  }

  const releaseId =
    typeof source.releaseId === 'string' ? source.releaseId.trim().toLowerCase() : '';
  if (!releasePattern.test(releaseId) || releaseId !== input.expectedReleaseId.toLowerCase()) {
    return invalid('known_defect_review_release_mismatch');
  }

  const reviewedAt = typeof source.reviewedAt === 'string' ? source.reviewedAt.trim() : '';
  const reviewedAtMs = Date.parse(reviewedAt);
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(reviewedAtMs)) return invalid('known_defect_review_time_invalid');
  if (reviewedAtMs < input.releaseCommittedAt.getTime()) {
    return invalid('known_defect_review_predates_release');
  }
  if (reviewedAtMs > nowMs + clockSkewMs) return invalid('known_defect_review_from_future');
  if (nowMs - reviewedAtMs > maximumReviewAgeMs) {
    return invalid('known_defect_review_expired');
  }

  const ownerReference = reference(source.ownerReference);
  const reviewerReference = reference(source.reviewerReference);
  if (!ownerReference || !reviewerReference) {
    return invalid('known_defect_review_actor_reference_invalid');
  }
  if (ownerReference === reviewerReference) {
    return invalid('known_defect_review_requires_independent_reviewer');
  }

  if (!Array.isArray(source.evidenceReferences)) {
    return invalid('known_defect_review_evidence_missing');
  }
  const evidenceReferences = source.evidenceReferences.map(reference);
  if (
    evidenceReferences.length < 2 ||
    evidenceReferences.length > 20 ||
    evidenceReferences.some((item) => item === null) ||
    new Set(evidenceReferences).size !== evidenceReferences.length
  ) {
    return invalid('known_defect_review_evidence_invalid');
  }

  const counts = {
    p0: source.p0,
    p1: source.p1,
    p2: source.p2,
    p3: source.p3,
  };
  if (!Object.values(counts).every((count) => Number.isInteger(count) && count >= 0)) {
    return invalid('known_defect_review_counts_invalid');
  }

  return {
    counts: counts as KnownDefectCounts,
    review: {
      status: 'pass',
      reason: null,
      releaseId,
      reviewedAt: new Date(reviewedAtMs).toISOString(),
      ownerReference,
      reviewerReference,
      evidenceReferences: evidenceReferences as string[],
    },
  };
}

export type IssueCategory =
  | 'road'
  | 'waste'
  | 'water'
  | 'electricity_lighting'
  | 'public_facility'
  | 'public_safety_hazard'
  | 'other_public_infrastructure';

export type IssueStatus =
  | 'submitted'
  | 'verified'
  | 'in_progress'
  | 'resolved'
  | 'disputed'
  | 'rejected';

export type ProofStatus = 'seeded_demo' | 'ready_for_devnet' | 'indexed_devnet' | 'verified_devnet' | 'mismatch';

export type RecordKind = 'community_report' | 'public_source' | 'illustrative_sample' | 'qa_fixture';

export type SafetyReviewStatus = 'visible' | 'hidden_media' | 'disputed' | 'rejected' | 'resolved';

export type HandoffState = 'prepared' | 'submitted' | 'acknowledged' | 'follow_up' | 'closed';

export type HandoffEvidenceBasis = 'route_only' | 'external_reference' | 'redacted_receipt';

export type AuthorityHandoff = {
  version: '1.0';
  id: string;
  idempotencyKey: string;
  issueId: number;
  seq: number;
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
  recordedBy: 'platform_steward';
  previousEventHash: string | null;
  eventHash: string;
  createdAt: string;
};

export type HandoffStats = {
  routedIssues: number;
  preparedOnly: number;
  submittedIssues: number;
  acknowledgedIssues: number;
  overdueFollowUps: number;
  closedHandoffs: number;
  totalEvents: number;
};

export type IssueProvenance = {
  publisher: string;
  sourceTitle: string;
  sourceUrl: string;
  corroboratingUrls: string[];
  sourceType: 'official' | 'public_broadcaster' | 'reputable_news';
  publishedAt: string;
  checkedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium';
  statusAtCheck: 'reported_open' | 'time_bounded_notice' | 'needs_recheck';
  escalationUrl: string | null;
};

export type Ward = {
  id: string;
  label: string;
  locality: string;
  lat: number;
  lng: number;
};

export type IssueProof = {
  issuePda: string;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  timelineHash: string;
  proofStatus: ProofStatus;
  createTxSig: string | null;
  latestTxSig: string | null;
  explorerUrl: string | null;
};

export type StatusTimelineEntry = {
  seq: number;
  status: IssueStatus;
  label: string;
  note: string;
  proofHash: string;
  txSig: string | null;
  statusUpdatePda?: string | null;
  createdAt: string;
};

export type CivicIssue = {
  id: string;
  issueId: number;
  title: string;
  description: string;
  category: IssueCategory;
  wardId: string;
  locality: string;
  status: IssueStatus;
  geohash: string | null;
  firstObservedAt: string;
  proofAnchoredAt: string | null;
  reporterMode: 'session' | 'wallet';
  reporterPubkey: string;
  recordKind: RecordKind;
  provenance: IssueProvenance | null;
  verificationCount: number;
  updateCount: number;
  photoUrl: string;
  resolutionHash: string | null;
  resolutionPhotoUrl: string | null;
  safetyReviewStatus: SafetyReviewStatus;
  latDisplay: number;
  lngDisplay: number;
  proof: IssueProof;
  timeline: StatusTimelineEntry[];
};

export type DashboardStats = {
  totalIssues: number;
  unresolvedIssues: number;
  verifiedIssues: number;
  resolvedIssues: number;
  averageDaysIgnored: number;
};

export type VerificationResult = {
  ok: boolean;
  status: 'verified' | 'rejected';
  reason: string;
  issueId: string;
  verificationPda?: string;
  txSig?: string | null;
};

type ProofMetadataBase = {
  title: string;
  description: string;
  category: IssueCategory;
  wardId: string;
  locality: string;
  approxLocation: {
    latRounded: number;
    lngRounded: number;
  };
  geohashPrecision: number;
  firstObservedAt: string;
  photoHash: string;
  photoUrl: string;
  safetyDeclaration: true;
};

export type ProofMetadata =
  | (ProofMetadataBase & { version: '1.0' })
  | (ProofMetadataBase & {
      version: '1.1';
      recordKind: 'community_report' | 'public_source';
      provenance: Pick<
        IssueProvenance,
        'publisher' | 'sourceTitle' | 'sourceUrl' | 'publishedAt' | 'checkedAt' | 'expiresAt' | 'statusAtCheck'
      > | null;
    });

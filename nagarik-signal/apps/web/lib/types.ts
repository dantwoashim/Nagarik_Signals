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
  verificationCount: number;
  updateCount: number;
  photoUrl: string;
  resolutionHash: string | null;
  resolutionPhotoUrl: string | null;
  safetyReviewStatus: 'visible' | 'hidden_media' | 'disputed' | 'rejected' | 'resolved';
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

export type ProofMetadata = {
  version: '1.0';
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

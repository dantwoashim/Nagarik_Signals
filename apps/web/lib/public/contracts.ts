export type PublicWard = {
  id: string | null;
  label: string;
};

export type PublicLocation = {
  policyVersion?: string;
  wardId?: string;
  wardGeometryVersion?: string;
  coarseCellId?: string;
  centerLatE6?: number;
  centerLngE6?: number;
  uncertaintyRadiusM?: number;
  latRounded?: number;
  lngRounded?: number;
};

export type PublicIssueSummary = {
  publicId: string;
  workflowVersion: 'v2' | 'v1_legacy';
  publicationState: 'published' | 'superseded' | 'removed';
  title: string | null;
  summary: string | null;
  category: string | null;
  ward: unknown;
  location: unknown;
  mediaUrl: string | null;
  lifecycle: string | null;
  legacyStatus: string | null;
  signalCount: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicIssueEvent = {
  id: string;
  type: string;
  chainSequence: number | null;
  data: unknown;
  occurredAt: string;
};

export type PublicIssueDetail = PublicIssueSummary & {
  versionId: string | null;
  narrative: string | null;
  provenance: unknown;
  proofAvailable: boolean;
  events: PublicIssueEvent[];
};

export type PublicIssueTombstone = {
  publicId: string;
  publicationState: 'removed';
  tombstone: unknown;
  proofAvailable: boolean;
  updatedAt: string;
};

export type PublicIssueStats = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  signals: number;
  categories: Array<{ category: string; total: number }>;
  wards: Array<{ id: string; label: string; total: number }>;
  updatedAt: string | null;
};

export type PublicProof = {
  schemaVersion: 'nagarik-proof-response-v2';
  publicId: string;
  protocolVersion: 'v1_legacy' | 'v2';
  checkedAt: string;
  checks: {
    metadata: HashCheck;
    evidence: HashCheck & {
      available: boolean;
      byteLength: number | null;
      mediaType: string | null;
      error: string | null;
    };
    location: HashCheck;
    chain: {
      status: string;
      cluster: string;
      genesisHash: string;
      programId: string;
      issueAccount: string;
      eventAccount: string | null;
      signature: string;
      finalizedSlot: number;
      updateCount: number;
      timelineHead: string;
      handoffHead: string;
      confirmedAt: string;
    };
    availability: { issue: string; media: string };
  };
  canonicalMetadata: unknown;
  boundary: {
    integrity: string;
    truth: string;
    signals: string;
  };
};

type HashCheck = {
  status: string;
  expectedHash: string;
  computedHash: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function publicWard(value: unknown): PublicWard {
  const ward = objectValue(value);
  return {
    id: typeof ward.id === 'string' ? ward.id : null,
    label:
      typeof ward.label === 'string' && ward.label.trim()
        ? ward.label
        : typeof ward.id === 'string'
          ? ward.id
          : 'Approximate area',
  };
}

export function publicPoint(value: unknown): { latitude: number; longitude: number } | null {
  const location = objectValue(value) as PublicLocation;
  if (Number.isFinite(location.centerLatE6) && Number.isFinite(location.centerLngE6)) {
    return {
      latitude: Number(location.centerLatE6) / 1_000_000,
      longitude: Number(location.centerLngE6) / 1_000_000,
    };
  }
  if (Number.isFinite(location.latRounded) && Number.isFinite(location.lngRounded)) {
    return {
      latitude: Number(location.latRounded),
      longitude: Number(location.lngRounded),
    };
  }
  return null;
}

export function publicRadius(value: unknown): number {
  const radius = objectValue(value).uncertaintyRadiusM;
  return typeof radius === 'number' && Number.isFinite(radius) && radius > 0 ? radius : 800;
}

export function lifecycleLabel(issue: Pick<PublicIssueSummary, 'lifecycle' | 'legacyStatus'>) {
  const value = issue.lifecycle ?? issue.legacyStatus ?? 'open';
  const labels: Record<string, string> = {
    submitted: 'Open',
    verified: 'Open',
    in_progress: 'In progress',
    resolved: 'Resolved',
    closed: 'Closed',
    disputed: 'Needs review',
    rejected: 'Removed',
    open: 'Open',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

export function categoryName(value: string | null) {
  const labels: Record<string, string> = {
    road: 'Road',
    waste: 'Waste',
    water: 'Water and drainage',
    electricity_lighting: 'Electricity and lighting',
    public_facility: 'Public facility',
    public_safety_hazard: 'Public safety hazard',
    other_public_infrastructure: 'Other public infrastructure',
  };
  return value ? (labels[value] ?? value.replaceAll('_', ' ')) : 'Public infrastructure';
}

export function formatPublicDate(value: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kathmandu',
  }).format(date);
}

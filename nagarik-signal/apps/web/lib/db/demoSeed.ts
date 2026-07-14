import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { categories } from '../constants/categories';
import { statuses } from '../constants/statuses';
import { coarseGeohash } from '../geo/geohash';
import { wards } from '../geo/wards';
import { canonicalize } from '../proof/canonicalize';
import { buildProofMetadata } from '../proof/metadata';
import type { CivicIssue, IssueCategory, IssueStatus, StatusTimelineEntry } from '../types';
import type { ReadModel, StatusUpdateRecord, VerificationRecord } from './queries';

type DemoSpec = {
  title: string;
  description: string;
  category: IssueCategory;
  wardIndex: number;
  status: IssueStatus;
  daysAgo: number;
  verificationCount: number;
  photoIndex: number;
};

const demoPhotos = [
  '/demo/broken-paving-top.jpg',
  '/demo/garbage-street.jpg',
  '/demo/storm-drain.jpg',
  '/demo/pothole-road.jpg',
  '/demo/broken-paving-top.jpg',
  '/demo/pothole-road.jpg',
  '/demo/storm-drain.jpg',
  '/demo/garbage-street.jpg',
  '/demo/broken-paving-top.jpg',
  '/demo/storm-drain.jpg',
];

const specs: DemoSpec[] = [
  {
    title: 'Broken drain cover beside public bus stop',
    description: 'A damaged public drain cover is forcing pedestrians into the road near a busy bus stop.',
    category: 'water',
    wardIndex: 1,
    status: 'verified',
    daysAgo: 28,
    verificationCount: 4,
    photoIndex: 6,
  },
  {
    title: 'Streetlight outage on public footpath',
    description: 'The streetlight along a public footpath has been out for several nights and needs repair follow-up.',
    category: 'electricity_lighting',
    wardIndex: 2,
    status: 'in_progress',
    daysAgo: 21,
    verificationCount: 3,
    photoIndex: 2,
  },
  {
    title: 'Waste pile blocking community tap access',
    description: 'Uncollected public waste is blocking safe access to the community water tap area.',
    category: 'waste',
    wardIndex: 3,
    status: 'resolved',
    daysAgo: 32,
    verificationCount: 5,
    photoIndex: 1,
  },
  {
    title: 'Pothole near public school crossing',
    description: 'A pothole on the public school crossing route is collecting rainwater and slowing traffic.',
    category: 'road',
    wardIndex: 0,
    status: 'verified',
    daysAgo: 19,
    verificationCount: 3,
    photoIndex: 7,
  },
  {
    title: 'Loose railing on public bridge approach',
    description: 'The pedestrian railing near a public bridge approach is loose and needs safety review.',
    category: 'public_safety_hazard',
    wardIndex: 4,
    status: 'in_progress',
    daysAgo: 15,
    verificationCount: 2,
    photoIndex: 5,
  },
  {
    title: 'Damaged bench at public waiting area',
    description: 'A bench in a public waiting area is damaged and difficult for older residents to use safely.',
    category: 'public_facility',
    wardIndex: 1,
    status: 'submitted',
    daysAgo: 8,
    verificationCount: 0,
    photoIndex: 0,
  },
  {
    title: 'Blocked roadside drain after rainfall',
    description: 'A roadside drain is blocked and overflow is spreading across the public walking lane.',
    category: 'water',
    wardIndex: 2,
    status: 'verified',
    daysAgo: 24,
    verificationCount: 3,
    photoIndex: 6,
  },
  {
    title: 'Public park tap leaking continuously',
    description: 'A public park tap is leaking continuously and wasting water near the shared path.',
    category: 'water',
    wardIndex: 4,
    status: 'resolved',
    daysAgo: 26,
    verificationCount: 2,
    photoIndex: 3,
  },
  {
    title: 'Overflowing public bin near market lane',
    description: 'An overflowing public waste bin is spilling into the market lane and needs collection.',
    category: 'waste',
    wardIndex: 0,
    status: 'in_progress',
    daysAgo: 13,
    verificationCount: 2,
    photoIndex: 1,
  },
  {
    title: 'Cracked sidewalk slab beside clinic',
    description: 'A cracked public sidewalk slab beside a clinic creates a trip hazard for pedestrians.',
    category: 'road',
    wardIndex: 3,
    status: 'verified',
    daysAgo: 17,
    verificationCount: 3,
    photoIndex: 7,
  },
  {
    title: 'Missing cover on public cable junction',
    description: 'A public cable junction cover is missing beside the road and should be secured.',
    category: 'electricity_lighting',
    wardIndex: 1,
    status: 'disputed',
    daysAgo: 10,
    verificationCount: 1,
    photoIndex: 2,
  },
  {
    title: 'Damaged public notice board frame',
    description: 'The public notice board frame is broken and notices are falling onto the walkway.',
    category: 'public_facility',
    wardIndex: 2,
    status: 'submitted',
    daysAgo: 6,
    verificationCount: 0,
    photoIndex: 0,
  },
  {
    title: 'Open manhole warning barrier missing',
    description: 'A public manhole area lacks a clear warning barrier and requires quick steward review.',
    category: 'public_safety_hazard',
    wardIndex: 0,
    status: 'verified',
    daysAgo: 12,
    verificationCount: 3,
    photoIndex: 5,
  },
  {
    title: 'Road edge erosion near shared stop',
    description: 'The road edge beside a shared public transport stop is eroding after repeated rain.',
    category: 'road',
    wardIndex: 4,
    status: 'in_progress',
    daysAgo: 23,
    verificationCount: 2,
    photoIndex: 8,
  },
  {
    title: 'Public staircase light not working',
    description: 'Lighting on a public staircase has stopped working and residents now avoid the path at night.',
    category: 'electricity_lighting',
    wardIndex: 3,
    status: 'verified',
    daysAgo: 20,
    verificationCount: 2,
    photoIndex: 2,
  },
  {
    title: 'Water pooling at zebra crossing',
    description: 'Water pools at a public zebra crossing after rain and blocks safe pedestrian movement.',
    category: 'water',
    wardIndex: 0,
    status: 'submitted',
    daysAgo: 9,
    verificationCount: 0,
    photoIndex: 6,
  },
  {
    title: 'Public footpath narrowed by debris',
    description: 'Construction debris has narrowed a public footpath and should be cleared from the walkway.',
    category: 'other_public_infrastructure',
    wardIndex: 1,
    status: 'verified',
    daysAgo: 14,
    verificationCount: 2,
    photoIndex: 9,
  },
  {
    title: 'Community park gate hinge broken',
    description: 'A gate hinge at the public community park entrance is broken and difficult to close.',
    category: 'public_facility',
    wardIndex: 4,
    status: 'resolved',
    daysAgo: 30,
    verificationCount: 3,
    photoIndex: 4,
  },
  {
    title: 'Storm drain grate partly collapsed',
    description: 'A storm drain grate on a public lane is partly collapsed and needs repair tracking.',
    category: 'water',
    wardIndex: 2,
    status: 'in_progress',
    daysAgo: 25,
    verificationCount: 3,
    photoIndex: 6,
  },
  {
    title: 'Damaged tactile paving near crossing',
    description: 'Tactile paving near a public crossing is damaged, making navigation harder for pedestrians.',
    category: 'road',
    wardIndex: 3,
    status: 'verified',
    daysAgo: 16,
    verificationCount: 2,
    photoIndex: 8,
  },
  {
    title: 'Public bin missing from bus bay',
    description: 'A public bin is missing from the bus bay and litter is collecting near the waiting area.',
    category: 'waste',
    wardIndex: 4,
    status: 'submitted',
    daysAgo: 7,
    verificationCount: 0,
    photoIndex: 1,
  },
  {
    title: 'Drain smell near public walkway',
    description: 'A drain near the public walkway has an ongoing overflow smell and visible stagnant water.',
    category: 'water',
    wardIndex: 1,
    status: 'verified',
    daysAgo: 18,
    verificationCount: 2,
    photoIndex: 6,
  },
  {
    title: 'Uneven public ramp at ward office lane',
    description: 'The public ramp surface near the ward office lane is uneven and difficult for wheelchair users.',
    category: 'public_facility',
    wardIndex: 0,
    status: 'in_progress',
    daysAgo: 27,
    verificationCount: 2,
    photoIndex: 4,
  },
  {
    title: 'Streetlight pole access panel open',
    description: 'A streetlight pole access panel is open along a public sidewalk and needs securing.',
    category: 'electricity_lighting',
    wardIndex: 2,
    status: 'verified',
    daysAgo: 11,
    verificationCount: 1,
    photoIndex: 2,
  },
  {
    title: 'Public lane pothole near health post',
    description: 'A pothole near a public health post lane has grown wider after recent rain.',
    category: 'road',
    wardIndex: 1,
    status: 'submitted',
    daysAgo: 5,
    verificationCount: 0,
    photoIndex: 8,
  },
  {
    title: 'Overflowing drain beside shared courtyard',
    description: 'An overflowing public drain is affecting a shared courtyard path used by nearby residents.',
    category: 'water',
    wardIndex: 3,
    status: 'verified',
    daysAgo: 22,
    verificationCount: 3,
    photoIndex: 6,
  },
  {
    title: 'Public waiting shelter roof leak',
    description: 'The roof of a public waiting shelter leaks during rain and leaves the seating area wet.',
    category: 'public_facility',
    wardIndex: 4,
    status: 'resolved',
    daysAgo: 34,
    verificationCount: 4,
    photoIndex: 0,
  },
  {
    title: 'Waste scattered near public footbridge',
    description: 'Waste is scattered near a public footbridge entrance and should be cleaned up safely.',
    category: 'waste',
    wardIndex: 2,
    status: 'rejected',
    daysAgo: 6,
    verificationCount: 1,
    photoIndex: 1,
  },
  {
    title: 'Loose paving stone near temple square',
    description: 'A loose paving stone in a public square creates a visible trip hazard for pedestrians.',
    category: 'public_safety_hazard',
    wardIndex: 3,
    status: 'verified',
    daysAgo: 29,
    verificationCount: 4,
    photoIndex: 5,
  },
  {
    title: 'Public drainage channel needs clearing',
    description: 'A public drainage channel has visible blockage and should be cleared before heavier rainfall.',
    category: 'water',
    wardIndex: 0,
    status: 'in_progress',
    daysAgo: 31,
    verificationCount: 3,
    photoIndex: 6,
  },
];

function sha256Sync(input: string | Buffer) {
  return createHash('sha256').update(input).digest('hex');
}

function isoDaysAgo(daysAgo: number, hour = 6) {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function demoPda(prefix: string, issueId: number, suffix = '') {
  return `${prefix}${issueId}${suffix ? `_${suffix}` : ''}`;
}

function timelineEntry(input: {
  issueId: number;
  seq: number;
  status: IssueStatus;
  note: string;
  daysAgo: number;
  proofHash?: string;
  statusUpdatePda?: string | null;
}): StatusTimelineEntry {
  return {
    seq: input.seq,
    status: input.status,
    label: input.status.replaceAll('_', ' '),
    note: input.note,
    proofHash: input.proofHash ?? sha256Sync(`${input.issueId}:${input.seq}:${input.status}:${input.note}`),
    txSig: null,
    statusUpdatePda: input.statusUpdatePda ?? null,
    createdAt: isoDaysAgo(input.daysAgo, 8 + Math.min(Math.floor(input.seq), 8)),
  };
}

function timelineFor(spec: DemoSpec, issueId: number) {
  const entries: StatusTimelineEntry[] = [
    timelineEntry({
      issueId,
      seq: 0,
      status: 'submitted',
      note: 'Sample public infrastructure record accepted after safety screen.',
      daysAgo: spec.daysAgo,
    }),
  ];

  if (spec.verificationCount > 0 && spec.status !== 'submitted') {
    entries.push(
      timelineEntry({
        issueId,
        seq: 0.5,
        status: 'verified',
        note: `${spec.verificationCount} sample citizen signals were recorded for this illustrative record.`,
        daysAgo: Math.max(1, spec.daysAgo - 2),
      })
    );
  }

  if (['in_progress', 'resolved', 'disputed', 'rejected'].includes(spec.status)) {
    const status = spec.status === 'resolved' ? 'in_progress' : spec.status;
    entries.push(
      timelineEntry({
        issueId,
        seq: 1,
        status: status as IssueStatus,
        note:
          status === 'in_progress'
            ? 'Sample data steward marked repair follow-up in progress.'
            : status === 'disputed'
              ? 'Sample data steward marked this issue for review because location details need confirmation.'
              : status === 'rejected'
                ? 'Sample data steward hid this item from the active queue after safety review.'
                : 'Sample data steward update recorded.',
        daysAgo: Math.max(1, spec.daysAgo - 6),
        statusUpdatePda: demoPda('DemoStatusUpdatePda', issueId, '1'),
      })
    );
  }

  if (spec.status === 'resolved') {
    const proofHash = sha256Sync(`${issueId}:seeded-resolution-proof`);
    entries.push(
      timelineEntry({
        issueId,
        seq: 2,
        status: 'resolved',
        note: 'Sample data steward attached after-state resolution proof for the public asset.',
        daysAgo: Math.max(1, spec.daysAgo - 14),
        proofHash,
        statusUpdatePda: demoPda('DemoStatusUpdatePda', issueId, '2'),
      })
    );
  }

  return entries.sort((a, b) => a.seq - b.seq);
}

function makeIssue(spec: DemoSpec, index: number): CivicIssue {
  const issueId = 910001 + index;
  const ward = wards[spec.wardIndex % wards.length];
  const firstObservedAt = isoDaysAgo(spec.daysAgo);
  const latDisplay = Number((ward.lat + ((index % 5) - 2) * 0.002).toFixed(3));
  const lngDisplay = Number((ward.lng + ((index % 7) - 3) * 0.002).toFixed(3));
  const geohash = coarseGeohash(latDisplay, lngDisplay);
  const photoUrl = demoPhotos[spec.photoIndex % demoPhotos.length];
  const evidenceHash = sha256Sync(readFileSync(resolve(process.cwd(), 'apps', 'web', 'public', photoUrl.slice(1))));
  const metadata = buildProofMetadata({
    title: spec.title,
    description: spec.description,
    category: spec.category,
    wardId: ward.id,
    locality: ward.label,
    latDisplay,
    lngDisplay,
    geohash,
    firstObservedAt,
    evidenceHash,
    photoUrl,
  });
  const timeline = timelineFor(spec, issueId);
  const metadataHash = sha256Sync(canonicalize(metadata));
  const locationHash = sha256Sync(`${ward.id}:${geohash}:v1`);
  const resolutionEntry = timeline.find((entry) => entry.status === 'resolved');

  return {
    id: `seeded-demo-${issueId}`,
    issueId,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    wardId: ward.id,
    locality: ward.label,
    status: spec.status,
    geohash,
    firstObservedAt,
    proofAnchoredAt: isoDaysAgo(Math.max(0, spec.daysAgo - 1), 7),
    reporterMode: 'session',
    reporterPubkey: demoPda('DemoReporterPubkey', issueId),
    recordKind: 'illustrative_sample',
    provenance: null,
    verificationCount: spec.verificationCount,
    updateCount: timeline.filter((entry) => Number.isInteger(entry.seq) && entry.seq > 0).length,
    photoUrl,
    resolutionHash: resolutionEntry?.proofHash ?? null,
    resolutionPhotoUrl: resolutionEntry ? demoPhotos[(spec.photoIndex + 1) % demoPhotos.length] : null,
    safetyReviewStatus: spec.status === 'rejected' ? 'rejected' : 'visible',
    latDisplay,
    lngDisplay,
    proof: {
      issuePda: demoPda('DemoIssuePda', issueId),
      metadataHash,
      evidenceHash,
      locationHash,
      timelineHash: sha256Sync(canonicalize(timeline)),
      proofStatus: 'seeded_demo',
      createTxSig: null,
      latestTxSig: null,
      explorerUrl: null,
    },
    timeline,
  };
}

function makeVerifications(issue: CivicIssue): VerificationRecord[] {
  return Array.from({ length: issue.verificationCount }, (_, index) => ({
    issueId: issue.issueId,
    verifierPubkey: demoPda('DemoVerifierPubkey', issue.issueId, String(index + 1)),
    verifierMode: 'session',
    verificationPda: demoPda('DemoVerificationPda', issue.issueId, String(index + 1)),
    txSig: 'seeded_demo_no_tx',
    createdAt: isoDaysAgo(Math.max(1, Math.floor((Date.now() - Date.parse(issue.firstObservedAt)) / 86_400_000) - index - 1), 10),
  }));
}

function makeStatusUpdates(issue: CivicIssue): StatusUpdateRecord[] {
  return issue.timeline
    .filter((entry) => Number.isInteger(entry.seq) && entry.seq > 0)
    .map((entry) => ({
      issueId: issue.issueId,
      seq: entry.seq,
      updaterPubkey: 'DemoStewardPubkey',
      oldStatus: 'submitted',
      newStatus: entry.status,
      proofHash: entry.proofHash,
      previousTimelineHash: sha256Sync(`${issue.issueId}:${entry.seq}:previous-timeline`),
      newTimelineHash: sha256Sync(`${issue.issueId}:${entry.seq}:new-timeline`),
      statusUpdatePda: entry.statusUpdatePda ?? demoPda('DemoStatusUpdatePda', issue.issueId, String(entry.seq)),
      txSig: 'seeded_demo_no_tx',
      note: entry.note,
      proofPhotoUrl: entry.status === 'resolved' ? issue.resolutionPhotoUrl : null,
      createdAt: entry.createdAt,
    }));
}

export function createSeededDemoReadModel(existing?: ReadModel): ReadModel {
  const seededIssues = specs.map(makeIssue);
  const existingLiveIssues = (existing?.issues ?? []).filter((issue) => issue.proof.proofStatus !== 'seeded_demo');
  const issues = [...seededIssues, ...existingLiveIssues].sort((a, b) => a.issueId - b.issueId);
  const seededIssueIds = new Set(seededIssues.map((issue) => issue.issueId));
  const existingVerifications = (existing?.verifications ?? []).filter((row) => !seededIssueIds.has(row.issueId));
  const existingStatusUpdates = (existing?.statusUpdates ?? []).filter((row) => !seededIssueIds.has(row.issueId));

  return {
    version: 1,
    storage: 'local_json',
    updatedAt: new Date().toISOString(),
    issues,
    verifications: [
      ...seededIssues.flatMap(makeVerifications),
      ...existingVerifications,
    ],
    statusUpdates: [
      ...seededIssues.flatMap(makeStatusUpdates),
      ...existingStatusUpdates,
    ],
    sessions: existing?.sessions ?? [],
    stewards: [
      {
        walletPubkey: 'DemoStewardPubkey',
        displayName: 'Sample data steward',
        active: true,
        createdAt: isoDaysAgo(35),
        revokedAt: null,
      },
      ...(existing?.stewards ?? []).filter((row) => row.walletPubkey !== 'DemoStewardPubkey'),
    ],
  };
}

export function seededDemoSummary(model: ReadModel) {
  const visibleIssues = model.issues.filter((issue) => issue.safetyReviewStatus === 'visible');
  const seededIssues = model.issues.filter((issue) => issue.proof.proofStatus === 'seeded_demo');
  return {
    issues: visibleIssues.length,
    seededIssues: seededIssues.length,
    wards: new Set(visibleIssues.map((issue) => issue.wardId)).size,
    verifications: model.verifications.length,
    seededVerifications: model.verifications.filter((row) => row.txSig === 'seeded_demo_no_tx').length,
    resolved: visibleIssues.filter((issue) => issue.status === 'resolved').length,
    inProgress: visibleIssues.filter((issue) => issue.status === 'in_progress').length,
    unresolved: visibleIssues.filter((issue) => !statuses.find((status) => status.id === issue.status)?.closed).length,
    categories: categories.length,
    maxVerifications: Math.max(...visibleIssues.map((issue) => issue.verificationCount), 0),
    note: 'Seeded rows are synthetic/staged public infrastructure examples and are marked seeded_demo, not indexed_devnet.',
  };
}

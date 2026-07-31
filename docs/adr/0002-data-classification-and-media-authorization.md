# ADR 0002: Data Classification and Media Authorization

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture, security, media/privacy

## Context

The prototype can serve an upload when no issue row links to it, exposes
filename-oriented media routes, mixes private and public record shapes, and
does not define a complete location/retention contract. URL possession and
field omission are not authorization.

## Decision

Use the classes in `docs/production/data-classification.md`. Private is the
default. A field or object becomes public only through an approved immutable
public version and explicit public allowlist.

Media access begins denied. The same-origin proxy resolves an opaque media ID
to a database row and serves bytes only when:

1. it is an approved public derivative attached to a currently published or
   superseded-public version; or
2. a valid bound tracking capability or authorized operator can access its
   non-expired private lifecycle state.

The proxy never accepts or returns a storage URL. Unknown and denied objects
return the same neutral response.

Every media object selected for submission, correction, status, or handoff
must transition `staged -> promotion_pending -> quarantined ->
approved_private` through durable private promotion and a human moderator
decision. Direct staged approval is forbidden.

Images are streamed, decoded, orientation-normalized, actually resized,
metadata-stripped, deterministically re-encoded, bounded, and hashed as the
exact stored normalized artifact. Public display always creates a distinct
derivative row/object and requires a separate moderator display decision, even
when its bytes and hash equal the normalized private artifact.

All new private objects land under a storage-managed `staging/` prefix with an
independent 24-hour lifecycle rule. DB authorization remains deny-by-default.
Immediate cleanup plus an inventory sweeper handles orphans; storage expiry
bounds the DB-and-delete double-failure case.

Public intake accepts only bounded signed integer E6 coordinates. The
application applies the frozen integer half-away-from-zero formula and stores
only three-decimal integer `latE3`/`lngE3`. Public location always uses
`grid-0.01deg-v1`: origin `(-90,-180)`, floor-based 0.01-degree cell indices,
integer E6 cell center, `g1-{latIndex}-{lngIndex}`, and fixed 800 m
uncertainty. There is no centroid fallback. The canonical object also binds
ward ID and ward-geometry version. `localityLabel` remains separate metadata.
Only this canonical public location is committed to v2.

## Pilot retention decision

- unattached staged media: 24 hours;
- inactive `received` or `changes_requested` private intake: maximum 90 days;
- `under_review` intake: a non-resettable 30-day deadline from first review
  entry; expire unless a scoped legal hold applies;
- rejected/withdrawn/expired private data: origin access revoked
  transactionally, delete within 30 days;
- approved private original and private review point: delete within 90 days
  after approval/public-version freeze; delayed or failed publication never
  resets the deadline;
- removed public derivative: origin access revoked transactionally, purge
  platform-controlled caches within five minutes, delete within 30 days;
- idempotency: 30-day maximum with a maximum 24-hour client retry horizon;
- invitation verifier: 90 days after consumption/expiry; pilot capability
  verifier: expiry/revocation plus 30 days;
- terminal tracking: mutation access revoked immediately, read-only access for
  at most 90 days, verifier deletion within 30 days afterward;
- privacy-export verifier: consumption/expiry/revocation plus 30 days;
- encrypted privacy-export artifact: delete at successful consumption or
  24-hour expiry; media receipt verifiers: consumption/expiry plus 30 days;
- signal keyed values: while published, then delete within 30 days after
  removal/retraction; rate-limit keyed values: seven days;
- ordinary application logs: 30 days; security/audit-correlation logs: 90
  days; operator audit: one year;
- privacy request evidence: one year after closure; outbox attempts and
  restricted diagnostics: one year after confirmation/administrative closure;
- backups: rolling 35 days; restore-test evidence: one year; independently
  protected non-content revocation/deletion ledger: one year and no shorter
  than the recoverable backup window;
- approved public versions, tombstones, and proof bindings: durable;
- legal hold: restricted, individually authorized, audited, and never restores
  public access; applies only to minimum erasure-controlled private data and
  never extends credentials, idempotency, rate-limit, or session records;
- legal-hold metadata: active hold plus one year after release.

These are technical maximums. All real-person/private civic intake, including a
pilot labelled non-production, remains disabled until Nepal-specific legal
review approves collection and retention (`EXT-003`). Before then, only
synthetic fixtures in isolated non-public namespaces are allowed.
Configuration may shorten a maximum. Extending one requires a versioned policy,
ADR amendment, and legal approval before deployment.

## Invariants

- Raw tracking/intake/signal tokens and storage URLs are never persisted or
  logged.
- Public-source response bodies are checksummed in a bounded stream and
  discarded; only approved provenance, checksum, and restricted fetch metadata
  persist.
- Server stores versioned HMAC hashes with separate purpose keys.
- Public DTO/view has no precise point, raw media, private text, moderator
  note, token hash, operator data, outbox, or audit internals.
- Private responses are `no-store`.
- Public derivatives use versioned identities and bounded revalidation:
  browser maximum 60 seconds, shared-cache maximum 300 seconds, no
  `immutable`.
- Platform cache purge after removal is monitored with a five-minute maximum;
  previously downloaded third-party copies cannot be revoked.
- Orphan, rejected, expired, removed, deleted, wrong-capability, and
  cross-organization media remain denied.
- No private coordinate or reversible encoding reaches chain data.
- A restored snapshot remains isolated until all later revocation, removal,
  deletion, and tombstone ledger entries are replayed and privacy gates pass.

## Rejected alternatives

- **Public bucket/content-addressed URL:** knowledge becomes authorization.
- **Serve originals after EXIF stripping:** visual PII and unnecessary source
  quality remain exposed.
- **Three-decimal public location:** precision is still too high for the
  selected pilot policy.
- **Hash exact private location with a predictable salt:** enables dictionary
  recovery and creates immutable private linkage.
- **Retention documented but not enforced:** provides no operational control.

## Verification

- media lifecycle/capability/role negative matrix;
- malformed/animated/bomb/metadata fixtures;
- exact resize/output/hash vectors;
- public DTO, log, cache, analytics, source-map, and deployment sentinel scans;
- location property/boundary tests;
- idempotent retention and legal-hold tests;
- post-removal retrieval tests.

## Rollback

Disable intake, publication, public reads, and public media independently.
Public-read/media shutdown denies at origin and provider edge before cache
lookup and purges existing CDN entries. Removal denies access immediately.
Storage deletion follows policy and is not reversed without an approved legal
basis.

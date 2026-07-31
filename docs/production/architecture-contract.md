# Production Architecture Contract

Status: frozen and accepted for implementation  
Decision scope: curated invite-only pilot  
Authority: production-readiness master plan and accepted ADRs  
Current release decision: `NO_GO`

## Purpose

This document fixes the cross-system semantics that every production
workstream must implement. A workstream may choose an internal implementation
detail only when it does not alter these rules. Any change to ordering,
authority, public/private projection, protocol version, identity, or
idempotency requires an ADR amendment and integration review.

## Selected operating profile

The first credible target is a curated pilot with:

- one or more configured organizations;
- named, individually authenticated operators;
- invitation-derived intake and signal capabilities;
- human moderation before any public visibility;
- v2 commitments on an explicitly approved non-mainnet cluster;
- public browsing of approved versions;
- invite-scoped public-facing signals with neutral, non-personhood semantics;
- legacy v1 read/proof support only;
- public intake, mainnet writes, and institutional claims disabled.

The application must not ship a default organization, partner name, pilot
polygon, or ward authority. Enabling intake requires a versioned pilot-scope
configuration and an active organization. Missing scope is a startup/readiness
failure, not a nationwide fallback.

Production category IDs are frozen as:

```text
road
waste
water
electricity_lighting
public_facility
public_safety_hazard
other_public_infrastructure
```

Only `community_report` and reviewed `public_source` records can become
production-public. `illustrative_sample` and `qa_fixture` are test/demo classes
and are rejected by production import/publication constraints.

## System authority

### Postgres

Postgres is authoritative for:

- private submissions and tracking capabilities;
- media lifecycle and authorization;
- moderation decisions and redaction;
- public issue projection and immutable public versions;
- lifecycle, handoff, correction, and removal history;
- idempotency reservations and stored logical responses;
- chain intent, attempts, confirmation, reconciliation, and dead letters;
- individual operator identity mapping, organization scope, and roles;
- audit, privacy requests, rate limiting, and operational ownership.

### Solana

Solana v2 is an independent public commitment/checkpoint layer. It stores
compact, versioned hashes and protocol state. It is not:

- the source of private workflow state;
- an intake queue;
- a media store;
- an identity or personhood system;
- an authorization substitute for operator actions;
- the source of truth for whether an authority received or resolved an issue.

### Object storage

Private object storage holds staged/original evidence and approved derivatives.
Storage keys and raw Blob URLs are private infrastructure identifiers. Access
is always mediated by the application using an opaque media ID and a database
authorization decision.

### Public projection

The public projection contains approved immutable version data only. Public
routes may depend on a public view or public repository type, never a private
submission row plus field omission.

## Required ordering

### Intake

1. Establish a short-lived intake capability.
2. Stream, normalize, hash, and stage media privately.
3. Persist media lifecycle state and a one-time purpose-bound receipt.
4. Validate submission schema, idempotency key, pilot scope, category,
   geography, ward relationship, and receipt.
5. In one database transaction, reserve idempotency, consume the receipt,
   create the private submission, bind media, and append audit.
6. Return `202 Accepted` and a private tracking capability.

This path creates no public issue, chain intent, or Solana transaction.

### Moderation and publication

1. An AAL2-authenticated operator reads the private submission under
   organization scope.
2. Append a moderation decision; never overwrite prior decisions.
3. Approval selects/redacts content and creates a frozen immutable public
   version.
4. In the same database transaction, create/update the non-public issue
   projection and insert a deterministic v2 outbox operation.
5. A bounded worker leases the operation, checks existing chain state, submits
   if required, then obtains matching finalized event-account bytes and
   signature status from at least two independently operated, explicitly
   configured RPC providers on the pinned genesis hash.
6. Reconciliation handles timeout-after-submit and worker crashes.
7. Provider disagreement, partial availability, wrong genesis, or non-finalized
   status blocks publication. Only an exact quorum-confirmed binding changes
   publication state to `published` and makes the public projection visible.

The write RPC does not count as a second operator when it shares provider
ownership or infrastructure with a confirmation source. Each confirmation
source must report the pinned genesis hash, finalized signature status, and
byte-identical immutable event account owned by the expected program; the
application parses and compares those bytes to the intended operation. Slots
may differ, but each must be at or beyond the transaction's finalized slot.

### Status and handoff

1. Authenticate and authorize the named operator at AAL2.
2. Require idempotency key and the named database domain aggregate's expected
   version/head/state.
3. Validate the frozen state machine and evidence requirements.
4. Derive canonical event bytes and hashes on the server.
5. In one database transaction, reserve idempotency, append the event, update
   the current projection, append audit, and insert an outbox checkpoint when
   required.
6. The worker and reconciler converge the chain binding.

No external route accepts a caller-selected chain sequence, on-chain update
count, timeline/handoff head, event/operation ID, canonical payload, or
payload/account hash. The server derives and reserves all chain inputs while
holding the issue checkpoint lock, and nothing writes to Solana before durable
database intent.

### Chain checkpoint policy

The initial v2 profile creates one deterministic outbox job and one issue
instruction per checkpointed logical event. Workers may lease/process a batch,
but multiple logical events are not combined into one instruction or
transaction.

Checkpoint ordering is one issue-global FIFO across timeline and handoff
streams. The database checkpoint row stores confirmed and projected:

```text
chainSequence
timelineHead
handoffHead
lastReservedOperationId
```

A checkpoint-producing domain transaction locks that row, reserves
`chainSequence = projectedChainSequence + 1`, records the prior operation as
its predecessor, snapshots both projected heads, computes the one changed head,
updates projected state, and inserts the immutable outbox payload atomically.
The resulting `CommitmentEvent.sequence` is the reserved chain sequence.
Timeline instructions still change only `timelineHead`; handoff instructions
change only `handoffHead`; every instruction validates the expected global
count and both expected heads to prevent cross-stream races.

A worker may submit only `confirmedChainSequence + 1` after its predecessor is
confirmed. Later reservations are `blocked_by_predecessor` until then. A dead
letter at sequence `n` freezes submission of `n` and all descendants. An AAL2
system admin may schedule an exact-payload retry or acknowledge the freeze, but
cannot skip, cancel, rebase, reorder, or mutate the operation. This produces no
chain sequence gaps. A permanently irreconcilable operation leaves the issue
checkpoint-frozen and requires a new reviewed protocol/release decision, not an
ad hoc repair.

| Domain event | v2 operation | Public visibility rule |
|---|---|---|
| private submission received/revised/withdrawn/expired | none | always private |
| moderation start/changes/reject | none | always private |
| first approval/public version | `issue_created` | issue/version hidden until finalized exact binding |
| correction, source recheck, media redaction, or location-policy version | `metadata_version_committed` | prior version remains current; new version hidden until finalized exact binding |
| lifecycle change | `lifecycle_changed` | operator sees pending event; public lifecycle/event remain at prior finalized head until finalized exact binding |
| handoff `prepared` or `failed` | none | operator-only |
| handoff `sent`, `acknowledged`, `closed`, `action_recorded`, or `superseded` | `handoff_checkpointed` | operator sees pending event; public event hidden until finalized exact binding |
| public removal/tombstone | `publication_removed` | origin access is revoked and neutral tombstone is public immediately for safety; proof shows checkpoint pending/failed until finalized |
| public signal | none | aggregate only; no lifecycle/proof change |
| privacy-request transition | none unless it produces correction/removal | private workflow |

Create, correction, lifecycle, and public handoff dead letters leave the prior
public projection unchanged and freeze later checkpoint finalization for that
issue. Removal is intentionally fail-safe in the other direction: access
remains revoked and the tombstone remains public even when its FIFO checkpoint
is queued behind, blocked by, or dead-lettered after an earlier operation.
Removed content is never republished to make chain state look green.

## Consistency model

The application promises exactly one logical result per mutation scope and
idempotency key, not exactly one RPC attempt.

- The database transaction is the logical commit point.
- Outbox operation IDs and v2 event IDs are deterministic.
- Worker leases expire and can be safely reacquired.
- Every retry reads database intent and on-chain state before submission.
- A transaction signature is an attempt record until required confirmation is
  observed and the intended account state matches.
- Same idempotency key and same canonical request returns the original stable
  response.
- Same idempotency key and different canonical request returns `409`.
- A dead letter blocks affected publication/checkpoint completion and raises an
  operator alert; it never silently publishes.
- Reconciliation annotations are append-only.

## Public/private boundary

### Private classes

Private data includes:

- all submission content before publication;
- raw/original media and storage identifiers;
- tracking/intake tokens and keyed hashes;
- the operator-only approximate input point;
- moderation notes and rejected/redacted text;
- operator profiles, memberships, MFA state, and internal attribution;
- audit context, rate-limit identifiers, outbox payloads, diagnostics, and
  signer configuration;
- privacy requests and legal-hold data.

### Public classes

Public data may include only:

- opaque public issue and immutable version IDs;
- approved/redacted title and narrative;
- approved category, locality/ward label, and coarse public geometry;
- approved public derivative through same-origin media proxy;
- publication and lifecycle state;
- append-only public status, correction, removal, and qualified handoff events;
- provenance/freshness fields approved for publication;
- neutral aggregate signal count;
- versioned v1/v2 proof material and public explorer references;
- neutral tombstone for removed content.

Public DTOs do not have optional private fields. They are separate types.

Public provenance is versioned:

- `community_report`: public record kind, first-observed date supplied by the
  reporter when reviewed, platform received date, and last public recheck date;
  no reporter/session identity;
- `public_source`: publisher name, HTTPS source URL, source publication date,
  last successful content-check date, latest status-update date, next review
  date, and source status
  (`current`, `stale`, `unavailable`, or `superseded`).

Source status describes availability/freshness, not truth. Raw import
diagnostics and private source-review notes remain operator restricted.

## Location contract

- The browser collects a user-selected approximate point, not continuous
  background GPS.
- Public intake sends signed JSON-integer `latitudeE6`/`longitudeE6`, bounded to
  `-90000000..90000000` and `-180000000..180000000`; floating-point coordinate
  inputs are rejected. The server computes each stored E3 coordinate as
  `sign(e6) * floor((abs(e6) + 500) / 1000)`, with zero mapped to zero. This is
  exact half-away-from-zero rounding.
- The server rejects globally out-of-range coordinates, coordinates outside
  Nepal, coordinates outside the configured pilot boundary, unknown wards, and
  ward/polygon mismatch after rounding.
- The private review point is stored only as signed integer
  `latE3`/`lngE3`.
- The public version always uses `grid-0.01deg-v1`; there is no ward-centroid
  fallback.
- Cell derivation uses integer arithmetic only:
  `latIndex = floor((latE3 + 90000) / 10)` and
  `lngIndex = floor((lngE3 + 180000) / 10)`. Because the numerators are
  non-negative after global-range validation, ordinary non-negative integer
  division is the required floor operation. The resulting bounds are exactly
  `latIndex=0..17999` and `lngIndex=0..35999`; a rounded coordinate on an
  otherwise globally valid upper edge that would produce `18000` or `36000`
  is rejected before pilot/ward validation.
- Public center integers are
  `centerLatE6 = -90000000 + latIndex * 10000 + 5000` and
  `centerLngE6 = -180000000 + lngIndex * 10000 + 5000`.
- `coarseCellId` is the ASCII string
  `g1-{latIndex}-{lngIndex}` and `uncertaintyRadiusM` is exactly `800`.
- The canonical public location contains only `policyVersion`, `wardId`,
  `wardGeometryVersion`, `latIndex`, `lngIndex`, `coarseCellId`,
  `centerLatE6`, `centerLngE6`, and `uncertaintyRadiusM`.
- Approved `localityLabel` is metadata outside the location object and is not
  part of the location hash.
- The v2 location commitment hashes only the canonical public location. It
  never commits an exact/private point.
- A pilot without versioned boundary and ward geometry cannot enable intake.

Private review coordinates are deleted with private submission retention. They
are not copied into public versions, logs, analytics, audit metadata, or chain
payloads.

The validated private point must lie inside the configured ward polygon. The
public grid center need not lie inside that polygon because the cell may cross
a boundary; UI must display the 800 m uncertainty and validated ward label,
never imply point precision.

## Identity and authorization

Managed authentication supplies individual operator identity. The application
does not store password material.

Identity storage is normalized:

- `profiles` maps a managed-auth subject to application profile state;
- `organization_memberships` has one row per profile/organization and only
  active/revoked membership lifecycle;
- `organization_role_grants` has append-only grant/revocation rows for one
  exact organization role; a member may hold multiple explicit grants;
- `platform_role_grants` contains global `system_admin` grants;
- `service_identities` and their database policy are separate from humans.

Interactive roles:

| Role | Scope | Allowed capabilities |
|---|---|---|
| `moderator` | organization | Read assigned private intake/media; request changes; approve, reject, redact, or withdraw according to policy. |
| `steward` | organization | Operate approved issue lifecycle and official handoff records; view only the private fields required for that task. |
| `auditor` | organization | Read immutable audit/reconciliation evidence; no workflow mutation. |
| `privacy_reviewer` | organization | Verify and decide privacy requests, restrict access, create exports, and execute approved removal/tombstone actions. |
| `org_admin` | organization | Manage memberships, role grants, invitations, pilot policy, and preapproved evidence types; no civic-content decision without another grant. |
| `system_admin` | platform | Operate feature flags, dead letters, reconciliation, and incident controls; no implicit cross-role civic decision. |

Machine roles:

| Role | Scope | Allowed capabilities |
|---|---|---|
| `service_worker` | explicit deployment | Lease typed outbox jobs, call the bounded signer, reconcile, and apply retention jobs. |

All interactive privileged routes require a current managed-auth session and
MFA assurance level 2. Role, active membership, organization, resource scope,
expected version, and action policy are checked both in the service layer and
through database/RLS constraints where applicable.

Action matrix:

| Action family | moderator | steward | privacy_reviewer | auditor | org_admin | system_admin | service_worker |
|---|---:|---:|---:|---:|---:|---:|---:|
| private intake/media review | allow | deny | case-bound read only | redacted audit only | deny | deny | typed retention only |
| approve/reject/redact/correct/source recheck | allow | deny | request/assign only | deny | deny | deny | deny |
| emergency restrict/clear one issue | deny | deny | allow | deny | deny | global kill switch only | enforce typed purge job |
| final privacy decision/removal/export | deny | deny | allow | deny | deny | deny | typed retention/export job |
| lifecycle and handoff | deny | allow | deny | deny | deny | deny | typed checkpoint only |
| audit/reconciliation read | own-action subset | own-action subset | case subset | allow | membership subset | system subset | machine job subset |
| memberships/invitations/pilot/evidence policy | deny | deny | deny | deny | allow | deny | deny |
| platform system-admin grants | deny | deny | deny | read only | deny | allow | deny |
| feature kill switches/dead-letter operation | deny | deny | deny | read only | deny | allow | execute typed command only |

`emergency restrict` only removes public access and starts purge. It cannot
re-enable content or terminally decide a privacy request. Re-enable/removal
requires the frozen privacy/moderation workflow and an attributable authorized
decision.

Shared browser secrets are forbidden. Machine credentials never enter a client
bundle, browser request, public log, or public diagnostics response.

## Media contract

- Accepted inputs: single-frame JPEG, PNG, and WebP that successfully decode.
- Declared MIME/extension is untrusted; magic/decode format must be allowed and
  any declaration mismatch is rejected.
- Rejected inputs: SVG, PDF, GIF/animation, multipage images, malformed files,
  unsupported color formats, decompression bombs, and files exceeding limits.
- Default input limit: 10 MiB streamed; buffering before enforcement is
  forbidden.
- Default decoded-pixel limit: 25 megapixels.
- Private normalized maximum: 4096 pixels on the longest side; an approved
  public derivative is separately generated at no more than 1600 pixels on the
  longest side. Neither path enlarges.
- `image-v2` uses the release-pinned Sharp/libvips build, single-page decode,
  EXIF orientation application, sRGB conversion, Lanczos3 fit-inside resize,
  and no metadata/profile passthrough. A no-alpha result encodes as JPEG
  quality 82 with 4:2:0 chroma and progressive/optimized coding; an alpha
  result encodes as lossless WebP with effort 6. Encoder/runtime drift requires
  a normalization-version change unless every committed cross-platform fixture
  remains byte-identical.
- Default normalized-output limit: 6 MiB.
- The evidence hash names the exact stored normalized artifact, never the
  user's original file.
- A public derivative is separately versioned and hashed after any redaction.
- Redaction geometry is stored privately as an immutable integer-pixel
  transform manifest tied to the source hash; the public object contains only
  the rendered derivative bytes/hash/dimensions and never the redaction mask.
- A derivative is organization/issue scoped. It may be explicitly carried
  forward to a later immutable version of the same issue, but cannot be reused
  across issues or organizations.
- Human review is mandatory for privacy-sensitive visual content. Automated
  advisories cannot approve publication.

Attachment does not leave an accepted object under the staging-expiry prefix.
The submission/operator transaction changes the database media state to
`promotion_pending` and inserts a deterministic durable-private promotion
outbox operation. The worker copies exact bytes to an unguessable
organization-scoped durable-private key, verifies hash and length, then
transactionally changes the storage pointer/state to `quarantined`; only after
that commit may it delete the staging object. The proxy denies
`promotion_pending`, `promotion_failed`, and orphan destinations. A copy whose
DB finalization fails is immediately deleted and is also covered by a bounded
durable-orphan inventory sweep. Missing/expired staging input or exhausted
bounded retries produces `promotion_failed`, never an eligible review/public
record.

Every public candidate is created through the versioned
`public-derivative-v1` transform from an `approved_private` source. The
transform resizes fit-inside to at most 1600 pixels without enlargement, then
applies zero to 32 reviewed source-coordinate rectangles. For source rectangle
`(x,y,width,height)`, output coverage is
`left=floor(x*outWidth/srcWidth)`,
`top=floor(y*outHeight/srcHeight)`,
`right=ceil((x+width)*outWidth/srcWidth)`, and
`bottom=ceil((y+height)*outHeight/srcHeight)`, computed with integers and
clamped to output bounds. Each non-empty output rectangle is filled after
resize with opaque sRGB `(32,36,42,255)`. Rectangles are sorted by
`(y,x,height,width)`, must be wholly inside the source, and may overlap. The
result uses the frozen `image-v2` encoder. The private immutable manifest binds
source media ID/hash/dimensions, transform version, sorted rectangles, output
dimensions/hash, and actor/reason; it is never public.

The derivative is a distinct denied `redacted_derivative` row/object.
Moderator approval creates a one-time 24-hour `operator_media` binding receipt
whose exact purpose and target class are fixed in `api-contracts.md`; it does
not itself expose the bytes. The consuming publication/correction/status/
handoff transaction locks the receipt and derivative, changes the derivative
to `approved_public`, and binds it to the exact version/event atomically. A
receipt cannot bind across organization, issue, purpose, or target.

Access begins denied. A media object is served only when the database proves
one of:

1. it is an approved public derivative attached to a published or
   superseded-public immutable version; or
2. the caller has a valid bound private tracking capability or authorized
   operator role for its non-expired private state.

Denied and nonexistent objects return the same neutral response. Private
responses use `Cache-Control: no-store`. Public derivatives use bounded
revalidation (`max-age` no more than 60 seconds and shared-cache lifetime no
more than 300 seconds), never `immutable`. Removal revokes origin authorization
in the database transaction and initiates a provider cache purge that must
complete within five minutes and is monitored. Bytes already downloaded or
copied outside platform-controlled caches cannot be revoked. The proxy never
redirects to a raw storage URL.

## Retention defaults for the curated pilot

These are technical maximums for the pilot, pending Nepal-specific legal
approval:

| Data | Default |
|---|---|
| Unattached staged media | expire at 24 hours; deletion job within the next retention run |
| Received/changes-requested submission | expire after 90 days without valid activity/legal hold |
| Under-review submission | first entry sets a non-resettable 30-day deadline; alert overdue and expire at the deadline unless a scoped legal hold applies |
| Rejected, withdrawn, or expired private payload/media | origin access revoked in the decision transaction; delete within 30 days |
| Approved private original and private review point | delete within 90 days after approval/public-version freeze unless a documented legal hold applies; delayed/failed publication never resets the deadline |
| Approved public derivative | retain while published; on removal revoke origin access in the transaction, purge platform caches within five minutes, and delete after 30 days unless legal hold applies |
| Raw bearer token or cookie value | never stored server-side; returned only for its bounded purpose |
| Idempotency reservation and logical response | 30 days; the maximum documented client retry horizon is 24 hours |
| Consumed or expired invitation row/keyed verifier | 90 days after consumption or expiry |
| Pilot intake/signal capability keyed verifier | capability expiry or revocation plus 30 days |
| Terminal tracking access | mutation scope revoked immediately; read-only terminal access for at most 90 days, then verifier deletion within 30 days |
| Privacy-export capability keyed verifier | consumption/expiry/revocation plus 30 days |
| Encrypted privacy-export artifact | delete on successful consumption or 24-hour expiry/revocation; complete by the next deletion run and no later than 24 hours after cutoff |
| Submission/operator media receipt keyed verifier | consumption/expiry/revocation plus 30 days |
| Signal keyed value | while the issue is published; delete within 30 days after removal/retraction |
| Rate-limit keyed value | seven days |
| Application logs | 30 days |
| Security and audit-correlation logs | 90 days |
| Operator audit events | one year |
| Privacy requests and decision evidence | one year after closure |
| Outbox attempts and restricted diagnostics | one year after confirmation or administrative closure |
| Database/object backup | rolling 35 days |
| Recovery revocation/deletion ledger | one year and never shorter than the recoverable backup window |
| Restore-test evidence | one year |
| Legal-hold metadata | active hold plus one year after release |
| Approved public versions, tombstones, and proof bindings | durable; no silent deletion |
| Public-source fetched body | never persisted after bounded checksum/fetch; only checksum and restricted fetch metadata remain |

Legal hold applies only to the minimum erasure-controlled private data needed
for the authorized purpose. It does not extend bearer credentials,
idempotency records, rate-limit keys, or ordinary session data, and it never
restores public access. Public bindings remain durable; outbox diagnostics may
expire without changing them.

These values are typed policy maximums. Environment configuration may shorten
them. Extending one requires a versioned policy change, ADR review, and
Nepal-specific privacy/legal approval before deployment. The external review
remains a production gate.

Every private deletion, capability revocation, public/media removal, and
tombstone appends a non-content entry to an independently protected,
append-only recovery ledger. Restores remain isolated until entries newer than
the snapshot are replayed, object eligibility is reconciled, and privacy,
projection, proof, and RLS gates pass. No restored environment may serve
traffic before that replay.

## Handoff semantics

- `prepared`: internal draft; no transmission claim.
- `sent`: requires channel, recipient class, sent timestamp, and a reviewed
  dispatch reference and/or approved public derivative under the frozen
  evidence projection policy.
- `acknowledged`: requires an approved external official reference/receipt
  type and its immutable hash/reference. A platform-generated event is not
  sufficient.
- `closed`: closes the handoff process only. It does not set issue lifecycle to
  `resolved` or claim government action. Its frozen reason code is
  `delivery_cycle_complete`, `recipient_closed_process`, `superseded_process`,
  or `other_reviewed`.
- `action_recorded`: optional separate evidence-bearing event; wording must
  identify its source and must not imply independent verification.

Corrections append a superseding event relation and never become a handoff
aggregate state. The replacement uses the target event's semantic type and
cycle and cannot rewrite current aggregate state. Ordinary roles cannot update
or delete the historical event.

Every private handoff event increments an aggregate `sequence` and advances the
private aggregate `head` across cycles; concurrency preconditions use those
values plus the active cycle ID. Only one cycle is active. Initial prepare, or
prepare after a prior cycle is `closed`/`failed`, creates a server UUID copied
into every later event in that cycle. A
public-safe checkpoint event reserves
`publicHandoffSequence = projectedPublicHandoffSequence + 1` in the same
transaction that freezes canonical bytes and creates its FIFO outbox operation.
The reservation is gapless because
dead letters freeze descendants and cannot be skipped; it becomes visible only
after finalization. A prepared or failed event, and a supersession of an event
that was never public, remains private and creates no chain event. Superseding
an already-public event creates a new checkpointed public event; the prior
public event remains visible as superseded history after finalization.

Generic dispatch evidence types are `email_message_id`,
`registered_mail_receipt`, `portal_ticket_reference`,
`physical_receipt_scan`, and `other_reviewed_reference`. Generic
acknowledgment types are `official_email_reply`,
`portal_acknowledgment`, `signed_receipt`, `authority_ticket_status`, and
`other_reviewed_acknowledgment`. Partner policy may disable values but cannot
add a type without contract and validation review.

## Signal semantics

A signal means an invite-scoped, rate-limited browser context asked for
attention or indicated corroboration. The curated pilot does not issue signal
capabilities to unrestricted public traffic. A signal is:

- off-chain;
- keyed and unique only within an issue and signal-key version;
- not proof of a unique person, residence, truth, severity, or official action;
- unable to change lifecycle, publication, proof validity, or handoff state.

The server stores a versioned HMAC-derived signal key, never the raw browser
token. Signals have abuse limits and can be excluded from public display during
an incident without affecting issue integrity.

## v1/v2 boundary

- v1 program source, account meaning, program ID, and generated IDL are frozen
  historical artifacts.
- v1 reads and proof checks remain available and are labelled `legacy`.
- No production mutation endpoint invokes v1.
- Imported v1 records remain operator-read-only for correction, source recheck,
  lifecycle, and handoff; those v2 routes return `409 legacy_read_only`.
- Terminal privacy removal of an imported v1 record is a database/public
  tombstone, origin-media denial, retention, audit, and recovery-ledger
  operation only. It preserves the historical v1 proof, reports
  `not_applicable_v1_legacy` for the removal checkpoint, and performs no chain
  mutation.
- The service never creates an implicit v2 wrapper for a v1 record. A future
  reviewed migration, if ever approved, requires a separate explicit contract
  and cannot be inferred from an operator or privacy request.
- v2 has a distinct program ID, IDL, PDA namespace, account layouts, role
  model, and canonicalization version.
- v2 has no global issue counter, browser/session signer, verification PDA, or
  verification count.
- v2 issue and event PDAs use deterministic 32-byte keys/IDs.
- Proof responses declare version and independently report bytes, canonical
  metadata, chain binding, availability, and limitations. A valid commitment
  does not prove the real-world claim is true.
- Mainnet remains disabled until independent program audit and key-governance
  approval are recorded.

## Feature flags and fail-closed behavior

The only release profile in scope is
`curated_pilot_v2_non_mainnet`. Its validated static release configuration is:

```text
legacyRead=true
legacyMutations=false
publicRead=true
publicIntake=false
publicSignals=false
mainnetWrites=false
publicationRequiresFinalizedCommit=true
sampleData=false
```

The `false` values above and
`publicationRequiresFinalizedCommit=true` are profile invariants, not runtime
toggles. A release that violates one is invalid and readiness is false.
`legacyMutations=false` prohibits behavioral/domain mutation of imported v1
records and every retired legacy write route. Mandatory privacy enforcement on
the imported database projection is not a v1 protocol mutation: it can only
deny media/content and publish the frozen neutral tombstone under the v1/v2
boundary above.

Seven supported capabilities have a static deployment ceiling and
disable-only emergency control:

```text
publicReadEnabled
publicMediaEnabled
inviteIntakeEnabled
inviteSignalsEnabled
operatorMutationsEnabled
publicationEnabled
v2WritesEnabled
```

For this release artifact, every ceiling above is statically `true`; the
profile invariants still prohibit unrestricted intake/signals, legacy
mutations, mainnet writes, and pre-finality publication. Migrations create
every database kill-switch row with `disabled=true`. The provider-edge
public-read and public-media controls also begin with `edgeKillSwitch=true`.
Missing, duplicate,
malformed, stale-policy, or unreadable switch state is treated as disabled and
makes readiness false. Activation is an audited release step that clears only
the named switch after its dependency guards pass.

For intake, signals, operator mutations, publication, and v2 writes, effective
enablement is:

```text
staticReleaseEnable && !databaseKillSwitch
```

The database can disable a statically enabled capability but cannot enable one
that the release disabled. Kill-switch changes require an AAL2
`system_admin`, reason, idempotency, audit event, and immediate local/cache
invalidation.

Public reads and public media additionally require independent provider-edge
controls evaluated before cache lookup:

```text
staticReleaseEnable && !databaseKillSwitch && !edgeKillSwitch
```

Either disable blocks origin and edge delivery. A public-read/media emergency
action updates the database control, updates the provider edge control,
invalidates application configuration, purges relevant CDN caches, and records
both acknowledgments. Edge-control unavailability fails closed. The operation
is not reported complete until edge denial is verified; origin denial applies
immediately.

Dependency guards apply in addition to effective flags:

- `publicReadEnabled` requires the current public projection and no integrity
  incident requiring broad restriction;
- `publicMediaEnabled` requires public reads, private origin storage,
  row/version eligibility checks, the edge deny control, and purge health;
- `inviteIntakeEnabled` requires `EXT-003` for any real-person/private civic
  data, an active organization, invitation policy, pilot geometry, private
  media storage, database schema, and rate limiter;
- `inviteSignalsEnabled` requires an active invite-derived signal capability,
  signal key version, database schema, and rate limiter;
- `operatorMutationsEnabled` requires managed auth, AAL2, normalized active
  grants, current schema, and the named release profile;
- `v2WritesEnabled` requires the approved non-mainnet cluster/program/IDL,
  bounded signer, worker identity, current schema, reconciliation, and no
  integrity dead letter;
- `publicationEnabled` requires operator mutations, v2 writes, finalized exact
  binding, a healthy public projection, and no publication-related dead letter.

Retired legacy mutation routes return `410 legacy_mutation_retired`. A supported
mutation disabled by flag/guard returns `503
feature_temporarily_unavailable`. Disabled public reads return the same stable
`503` category. Responses reveal no private state or dependency detail.
`GET /api/v2/capabilities` exposes only the public-safe effective capability
snapshot with `Cache-Control: no-store`; UI visibility never substitutes for
server enforcement. The capability route remains a minimal edge allowlist
exception during public read/media shutdown and accesses no civic record.

The release manifest records the profile, every static invariant and ceiling,
the effective snapshot at verification time, and the kill-switch policy
version.

Startup or readiness is false when a production-like profile has:

- JSON workflow storage;
- a shared operator secret;
- missing/old migrations;
- missing pilot boundary;
- wrong cluster or program ID;
- a public storage container;
- missing signer policy;
- stale backup/restore evidence;
- incomplete post-snapshot revocation/deletion-ledger replay;
- a blocked or excessively old outbox;
- fewer than two healthy independent finalized confirmation providers;
- enabled legacy mutations.

## Failure and recovery boundaries

- DB unavailable: reject mutations before external side effects.
- Blob unavailable during staging: no media row may claim `staged`; return a
  stable retryable error.
- DB failure after Blob upload: immediate deletion is attempted; every private
  `staging/` object also has provider-enforced 24-hour expiry independent of
  the DB. The proxy denies objects without eligible rows, and an inventory
  sweeper removes/alerts on orphans, so DB-plus-delete failure remains denied
  and bounded.
- Media promotion copy succeeds but DB finalization fails: delete the durable
  destination immediately; the durable-prefix orphan sweep removes and alerts
  on any residue. The source remains `promotion_pending` and retry/reconcile
  rechecks both exact hashes before another copy.
- Media promotion source expires or retries exhaust: set
  `promotion_failed`, deny both source/destination, request a new upload, and
  prevent review/publication.
- Worker crash: lease expires; retry checks deterministic chain state.
- RPC timeout after submit: mark attempt unknown; reconcile by PDA/event ID
  before resubmitting.
- Chain rejection: preserve durable intent and diagnostic category; retry only
  when policy marks it retryable.
- Publication projection failure: binding remains recorded, publication stays
  non-public until transactionally repaired.
- Removal: revoke origin access transactionally, publish the neutral tombstone,
  start the monitored five-minute platform-cache purge, and append policy
  actions. Previously downloaded third-party copies remain a stated residual
  risk.

## Contract change control

The following require an ADR amendment before implementation changes:

- authoritative system or transaction ordering;
- public/private field membership;
- token or idempotency semantics;
- state-machine transitions;
- retention maximums;
- operator role capabilities or MFA policy;
- v1 compatibility or v2 PDA/account layout;
- public proof canonicalization;
- signer custody or network profile;
- release-label meaning.

Implementation may begin only after independent architecture and security
review finds no unresolved cross-system semantic ambiguity.

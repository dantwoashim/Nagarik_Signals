# Data Classification and Handling Contract

Status: frozen and accepted for implementation  
Policy version: `data-policy-v1`  
Applies to: curated pilot

## Principles

1. Collect the minimum data needed to review and publish a civic issue.
2. Private is the default. Publication is an explicit state transition.
3. Public and private records use separate database projections and TypeScript
   types.
4. Raw credentials, tracking tokens, session identifiers, and storage URLs are
   never persisted in application records or logs.
5. Coarsening and redaction happen before immutable public version creation.
6. A chain commitment cannot be deleted, so prohibited private data is never
   included directly or through a reversible encoding.
7. Retention is enforced by jobs and evidence, not policy text alone.
8. Nepal-specific legal review is required before a production claim.

## Classes

| Class | Meaning | Examples | Default access |
|---|---|---|---|
| `PUBLIC` | Explicitly approved immutable public projection | public issue ID, approved text, category, coarse location, public derivative, public events, proof hashes | unauthenticated read |
| `PRIVATE_CAPABILITY` | Private intake data accessible by a bounded bearer capability or assigned operator | submission text, private review point, staged media, safe tracking status | matching tracking capability or authorized operator |
| `OPERATOR_RESTRICTED` | Data required for moderation/operations but not citizen tracking | moderation notes, reviewer assignments, detailed media findings, official receipt internals | authorized organization role at AAL2 |
| `SECURITY_SENSITIVE` | Security, abuse, custody, and infrastructure material | keyed token hashes, rate-limit keys, outbox payloads, RPC diagnostics, signer policy, audit request context | narrow server/machine role; selected system admin/auditor |
| `SECRET` | Credential material that must not enter application data stores | service-role key, signer private key, webhook secret, cookie/HMAC key, raw tracking token | secret manager/runtime process only |
| `ERASURE_CONTROLLED` | Data whose access/removal is governed by privacy, legal hold, or immutable-history limits | original media, private narratives, privacy requests, tombstones, audit records | policy-specific |

`PUBLIC` is the only class available to anonymous routes, static generation,
search indexing, public analytics, or immutable CDN caching.

## Field inventory

| Data | Class | Persisted form | Public form | Prohibited locations |
|---|---|---|---|---|
| Public issue ID | `PUBLIC` | random opaque ID | same | none |
| Submission ID | `PRIVATE_CAPABILITY` | random opaque ID | never | public URL/index |
| Pilot invitation | `SECRET` in transit | one-time keyed hash, scope, expiry, consumption | never | URL/log/analytics |
| Tracking token | `SECRET` in transit | never; only versioned HMAC hash | never | logs, query string, DB, analytics |
| Intake/session token | `SECRET` in transit | never; only versioned HMAC hash | never | localStorage, logs, DB |
| Operator auth token | `SECRET` | managed auth/session mechanism | never | application DB/logs/client props |
| Title/narrative before review | `PRIVATE_CAPABILITY` | immutable private revision | approved/redacted copy only | public views/cache/search |
| Rejected/redacted text | `OPERATOR_RESTRICTED` | immutable moderation/revision record | never | public audit/tombstone |
| User-selected approximate point | `PRIVATE_CAPABILITY` | rounded to three decimals; bounded retention | never | chain, analytics, public DTO |
| Ward/locality selection | `PRIVATE_CAPABILITY` until validated | validated ID and geometry version | approved label/ID | unvalidated public output |
| Coarse public geometry | `PUBLIC` after approval | versioned cell/centroid | same | none |
| Raw/original upload | `ERASURE_CONTROLLED` | private object key and exact-byte hash | never | public bucket/raw URL |
| Normalized private evidence | `PRIVATE_CAPABILITY` | private object and metadata | never directly | public cache |
| Approved derivative | `PUBLIC` only when published | private storage object; opaque media ID | same-origin proxy bytes | raw storage URL |
| Storage key/Blob URL | `SECURITY_SENSITIVE` | server-side media row | never | API/HTML/log/chain |
| Moderation note | `OPERATOR_RESTRICTED` | append-only event | optional separately authored public reason | public DTO by omission |
| Operator user/profile ID | `OPERATOR_RESTRICTED` | managed auth reference/profile | public actor class only when policy permits | public event by default |
| Membership/MFA state | `SECURITY_SENSITIVE` | identity/membership tables | never | client bundle/public diagnostics |
| Idempotency key | `SECURITY_SENSITIVE` | keyed or scoped hash where practical | never | public response after processing |
| Canonical request hash | `SECURITY_SENSITIVE` | SHA-256 of redacted canonical semantics | never | public proof unless separately defined |
| Signal browser token | `SECRET` in transit | never; keyed issue-scoped signal hash only | never | DB/log/query |
| Signal count | `PUBLIC` | aggregate | neutral count | personhood wording |
| Official handoff receipt/reference | `OPERATOR_RESTRICTED` by default | normalized value/hash and type | approved display reference or hash only | chain raw text |
| Chain signature/account/hash | `PUBLIC` after binding | binding tables | versioned proof | private payload |
| Outbox payload | `SECURITY_SENSITIVE` | typed allowlisted canonical payload | never | public diagnostics |
| RPC/DB/Blob error detail | `SECURITY_SENSITIVE` | redacted structured diagnostics | stable category/request ID only | public error |
| Audit event | `SECURITY_SENSITIVE` | append-only actor/action/context | selected public event authored separately | public route by default |
| Privacy request | `ERASURE_CONTROLLED` | private workflow | neutral removal/correction outcome only | public details |
| Legal hold | `SECURITY_SENSITIVE` | restricted policy row | never | public response |

## Token and pseudonym rules

### Tracking capability

- Use only the exact purpose discriminants, token grammar, UUID byte order,
  HMAC domains, key-version encoding, derivation input, and verifier input in
  `api-contracts.md`.
- Generate the 256-bit secret from organization, capability, subject, and
  idempotency UUIDs with the dedicated derivation key; store only the
  separately keyed 32-byte verifier.
- Tracking tokens use prefix `nsc`; the prefix/purpose must match.
- Return the raw token once over TLS.
- Parse canonical grammar strictly and compare the complete verifier in
  constant time.
- Bind to a single submission and permitted actions.
- Revoke write scope on withdrawal; retain bounded read-only tracking for at
  most 90 days after terminal outcome; fully revoke on terminal retention,
  compromise, or replacement.
- Do not accept it in a query parameter. Use an authorization header or
  short-lived secure HttpOnly exchange cookie.

### Pilot invitation

- Use only database-backed 256-bit single-use invitation secrets generated by
  the deterministic protected capability derivation. Signed or multi-use
  alternatives are outside `data-policy-v1`.
- Bind to organization, pilot/geometry policy, scope (`intake`, `signal`, or
  both), seven-day maximum issuance expiry, and exactly one consumption.
- Provision through an AAL2 org-admin endpoint; return the raw invitation only
  to that authorized replay context for out-of-band distribution.
- Consume transactionally and issue a separate revocable pilot capability
  cookie with a maximum seven-day lifetime.
- If signal scope exists, issue a distinct signal-context cookie with a
  separate secret/key/purpose and the same or earlier expiry.
- Store keyed verifiers, capability IDs, scope, expiry, consumption/revocation,
  and audit only. Never reuse invitation, pilot, signal, tracking, or media
  secrets across purposes.

### Intake/media receipt

- Bind to intake capability, media ID, exact normalized hash, purpose,
  expiration, and one-time nonce.
- Persist consumption in the same transaction as submission creation.
- A replay, wrong purpose, wrong capability, changed media row, or expiry
  returns a neutral stable error.

### Public signal

- In the curated pilot, a browser receives a dedicated signal-context token in
  a secure same-site cookie only when a single-use invitation with signal scope
  is consumed.
- Store only a versioned HMAC derived with issue ID and token.
- Use a separate key from tracking, logs, rate limits, and analytics to prevent
  cross-dataset correlation.
- Verification/derivation key versions remain available until dependent
  capabilities expire, so ordinary rotation does not create a duplicate
  signal. A new invitation after expiry may signal again; UI and metrics must
  never interpret the count as unique people.

### Logging identity

Request IDs are random and public-safe. Security correlation identifiers are
rotating HMACs with a dedicated key and limited retention. No log line stores
raw cookies, authorization headers, idempotency keys, request bodies, precise
coordinates, filenames supplied by users, or storage URLs.

## Public projection allowlist

The public database view and `PublicIssue` DTO may contain:

```text
public_id
current_version_id
record_kind (production-eligible values only)
approved_title
approved_narrative
category
ward_id
ward_label
locality_label
coarse_location_policy_version
coarse_cell_id
center_lat_e6
center_lng_e6
uncertainty_radius_m
approved_public_media_id
source/provenance public fields
publication_state
lifecycle_state
published_at
updated_at
signal_count
current timeline/handoff commitment heads
versioned chain binding public fields
public correction/removal/tombstone fields
```

This is an allowlist. A column added to a private table does not appear
publicly until a migration, DTO, contract, privacy review, and leak test add it
explicitly.

## Media and cache handling

- Private object containers are non-public.
- Same-origin media proxy resolves opaque IDs; never user-controlled storage
  paths.
- Private and denied responses set `Cache-Control: no-store`.
- Public derivative URLs include immutable media/version identity but use
  bounded revalidation: browser `max-age` at most 60 seconds and shared-cache
  lifetime at most 300 seconds. `immutable` is prohibited.
- Removal revokes origin authorization transactionally and triggers a
  monitored provider purge that must complete within five minutes. Previously
  downloaded or externally copied bytes cannot be revoked; product/privacy
  policy must state this residual limit.
- Service responses set `X-Content-Type-Options: nosniff`, an approved exact
  `Content-Type`, restrictive `Content-Disposition`, and no reflected filename.
- Range requests, if implemented, are bounded and share the same authorization
  decision.

## Location handling

1. Require bounded signed JSON-integer `latitudeE6`/`longitudeE6`; reject
   floating-point coordinate inputs.
2. Apply the exact half-away-from-zero E6-to-E3 integer formula in
   `architecture-contract.md`.
3. Validate the rounded point against a reviewed Nepal boundary dataset
   version.
4. Validate against configured pilot polygon and ward geometry version, then
   store only integer `latE3`/`lngE3`.
5. Derive `grid-0.01deg-v1` exactly as specified in
   `architecture-contract.md`: origin `(-90,-180)`, 0.01-degree indices, cell
   center in integer E6 units, `g1-{latIndex}-{lngIndex}`, and fixed 800 m
   uncertainty. There is no centroid fallback.
6. Hash only the canonical public location object for v2.
7. Delete the private point under submission retention.

No endpoint, log, analytics event, source map, error object, chain instruction,
or public media metadata may expose the private point.

## Retention and deletion

Pilot technical defaults:

| Record | Access cutoff | Deletion target |
|---|---|---|
| Unattached staged media | at 24 hours | next successful retention run |
| Failed/orphan durable media promotion | always denied | immediate cleanup plus bounded inventory sweep, no later than 24 hours |
| Received/changes-requested submission | at 90 days without valid activity/legal hold | expire, revoke capability, then apply private-data deletion policy |
| Under-review submission | 30 days after first entry to review; deadline never resets | expire unless an individually scoped legal hold applies |
| Rejected/withdrawn/expired media and private payload | origin access revoked in decision transaction | within 30 days |
| Approved private original and private review point | at policy deadline or earlier privacy action | within 90 days after approval/public-version freeze; delayed/failed publication never resets it |
| Removed public derivative | origin access revoked in removal transaction; platform cache purge within five minutes | within 30 days |
| Raw bearer tokens | never persisted | not applicable |
| Idempotency reservation/logical response | after the 24-hour maximum client retry horizon | 30 days after reservation |
| Consumed/expired invitation row and keyed verifier | immediately unusable | 90 days after consumption/expiry |
| Pilot intake/signal capability keyed verifier | on expiry/revocation | within 30 days |
| Tracking capability after terminal outcome | mutation scope revoked immediately; read-only status only | access ends within 90 days; verifier deleted within 30 days after that |
| Privacy-export capability keyed verifier | on consumption/expiry/revocation | within 30 days |
| Encrypted privacy-export artifact | on successful consumption or 24-hour expiry/revocation | next successful deletion run, no later than 24 hours after cutoff |
| Submission/operator media receipt keyed verifier | on consumption/expiry/revocation | within 30 days |
| Signal keyed value | on issue removal/retraction | within 30 days |
| Rate-limit keyed value | at TTL | seven days |
| Application log | not a data-access mechanism | 30 days |
| Security/audit-correlation log | restricted | 90 days |
| Operator audit event | restricted and append-only | one year |
| Privacy request/decision evidence | restricted | one year after closure |
| Outbox attempt/restricted diagnostic | restricted | one year after confirmation or administrative closure |
| Database/object backup | isolated recovery access | rolling 35 days |
| Recovery revocation/deletion ledger | isolated recovery control only | one year; never shorter than the recoverable backup window |
| Restore-test evidence | restricted | one year |
| Legal-hold metadata | restricted | active hold plus one year after release |
| Public immutable version/tombstone/proof binding | public under correction/removal policy | durable; no silent deletion |
| Public-source fetched body | never persisted after bounded checksum/fetch | discard before request completion; retain only checksum and restricted fetch metadata |

Removal cannot erase public Solana account addresses, category/lifecycle
discriminants, chain timestamps, service-signer keys, or historical compact
hashes/heads that were already committed. Public product responses stop serving
the removed text, media, and location, and explain this residual chain boundary.

Legal hold can pause deletion but must:

- be individually authorized and audited;
- never restore public access;
- record scope and review date;
- remain invisible to public routes;
- be included in retention monitoring;
- retain only the minimum erasure-controlled private data needed;
- never extend bearer credentials, idempotency rows, rate-limit keys, or
  ordinary session material.

Every revocation, media removal, private deletion, and public tombstone appends
a non-content recovery-ledger entry to an independently protected append-only
store. A restore remains isolated and cannot serve traffic until all entries
after the restored snapshot are replayed, object-storage eligibility is
reconciled, and the privacy/RLS/public-projection suites pass. A ledger entry
contains opaque record IDs, action, timestamp, policy version, and integrity
hash only; it does not recreate deleted content.

The final audit/privacy/legal retention schedule is an external human gate.
Until `EXT-003` passes, every deployment must disable live invite intake and
must use synthetic fixtures only in isolated non-public test namespaces. A
"pilot" or "non-production" label never permits real-person or private civic
collection. Typed environment values may shorten the technical maximums. An
extension requires a versioned policy change, ADR review, and Nepal-specific
privacy/legal approval before deployment.

## Analytics, observability, and support

Public analytics must not receive:

- private routes or page contents;
- precise/private coordinates;
- tracking/submission/media identifiers;
- operator user IDs;
- request bodies or error detail.

Monitoring uses numeric counts, latencies, stable error categories, release
ID, schema version, and bounded pseudonymous correlation only. High-cardinality
or sensitive labels are forbidden.

Support instructions must ask for a public issue ID or request ID only. They
must not ask users to send tracking tokens, cookies, secret headers, private
media URLs, or identity documents through public issue trackers.

## Deployment artifact rules

Production bundles, containers, source maps, build caches, and release evidence
must exclude:

- `.env*` except a non-secret example;
- `.anchor`, wallet/keypair files, and session-keypair directories;
- local Supabase data and database dumps;
- private/test uploads and Playwright artifacts;
- local read models containing sessions or private records;
- local automation event logs containing repository diagnostics if not
  explicitly reviewed;
- penetration-test exploit detail;
- raw backup artifacts.

Secret scanning and an allowlist-based bundle inventory are release gates.

## Verification

Required tests include:

- static forbidden-field scans across client bundles and serialized props;
- RLS role matrix for unauthenticated, tracking, moderator, steward, privacy
  reviewer, auditor, org admin, system admin, and service worker contexts;
- exact-ID enumeration of pending/rejected/removed rows;
- cross-capability and cross-organization access;
- cache isolation and post-removal access;
- logs/errors/analytics capture with sentinel private strings;
- object storage and raw URL denial;
- retention job idempotency and legal-hold behavior;
- staging-to-durable promotion crash/failure and durable-orphan cleanup;
- deployment archive and source-map secret/private-data scan;
- DB restore followed by the same privacy access matrix.

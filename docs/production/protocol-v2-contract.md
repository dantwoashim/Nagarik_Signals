# Solana v2 Protocol Contract

Status: frozen and accepted for implementation  
Protocol version: `2`  
Canonical metadata version: `nagarik-public-metadata-v2`  
Canonical event version: `nagarik-public-event-v2`

This file is authoritative for Rust, TypeScript, database outbox payloads,
generated IDL validation, proof verification, and cross-runtime vectors.
Changing a field, discriminant, seed, domain string, bound, or canonical schema
requires an amendment to ADR 0005.

## Encoding rules

- Anchor account discriminator: 8 bytes.
- Account fields: Borsh in the listed order.
- Integers: little-endian.
- `Pubkey`: 32 bytes.
- `bool`: one byte (`0` or `1`).
- enums: explicit `u8` discriminants below.
- hashes/keys/heads/event IDs: exactly 32 bytes.
- reserved bytes: initialized to zero and immutable in v2.
- all hash domain strings include the displayed trailing NUL byte.
- SHA-256 is the only protocol hash algorithm in v2.

## PDA seeds

```text
ProtocolConfig:
  [b"protocol", b"v2"]

RoleGrant:
  [b"role", protocol_config_pubkey, subject_pubkey]

IssueCommitment:
  [b"issue", protocol_config_pubkey, issue_key]

CommitmentEvent:
  [b"event", issue_commitment_pubkey, event_id]
```

## Stable enum values

### Category

```text
0 road
1 waste
2 water
3 electricity_lighting
4 public_facility
5 public_safety_hazard
6 other_public_infrastructure
```

### Lifecycle

```text
0 open
1 in_progress
2 resolved
3 closed
4 disputed
```

### Commitment event and outbox operation

The event discriminant and issue-operation discriminant are identical:

```text
0 issue_created
1 metadata_version_committed
2 lifecycle_changed
3 handoff_checkpointed
4 publication_removed
```

Administrative instructions are not issue outbox operations and do not consume
these discriminants.

### Role bits

```text
0x0001 issue_issuer
0x0002 lifecycle_writer
0x0004 handoff_writer
0x0008 removal_writer
```

Unknown category, lifecycle, event, operation, or role bits are rejected in
v2. A future value requires a protocol-version decision.

## Fixed account layouts

`LEN` includes the 8-byte Anchor discriminator.

### `ProtocolConfig`

| Field | Type | Bytes |
|---|---|---:|
| discriminator | `[u8; 8]` | 8 |
| version | `u8` (`2`) | 1 |
| authority | `Pubkey` | 32 |
| pending_authority | `Option<Pubkey>` | 33 |
| paused | `bool` | 1 |
| revision | `u64` | 8 |
| bump | `u8` | 1 |
| reserved | `[u8; 56]` | 56 |

`LEN = 140`.

Initialization sets `paused=true`, `pending_authority=None`, `revision=1`, and
reserved bytes to zero. The authority is the compile-time
`GENESIS_AUTHORITY`, whose exact public key is committed in source, generated
IDL metadata, and the release manifest before a deployable build. Only that
signer can initialize the unique PDA. A default, runtime-supplied, payer-derived,
or first-caller authority is forbidden.

### `RoleGrant`

| Field | Type | Bytes |
|---|---|---:|
| discriminator | `[u8; 8]` | 8 |
| protocol | `Pubkey` | 32 |
| subject | `Pubkey` | 32 |
| role_bits | `u16` | 2 |
| active | `bool` | 1 |
| granted_at | `i64` | 8 |
| revoked_at | `i64` (`0` while active) | 8 |
| revision | `u64` | 8 |
| bump | `u8` | 1 |
| reserved | `[u8; 24]` | 24 |

`LEN = 124`.

Initial activation sets revision `1`. Every effective role change increments
both grant and protocol revision. Revocation sets `active=false` and a non-zero
chain-clock `revoked_at`. Reactivation sets a reviewed non-zero role mask,
`active=true`, a new `granted_at`, `revoked_at=0`, and increments revision. A
grant account is not closed or reused for another subject.

### `IssueCommitment`

| Field | Type | Bytes |
|---|---|---:|
| discriminator | `[u8; 8]` | 8 |
| protocol | `Pubkey` | 32 |
| issue_key | `[u8; 32]` | 32 |
| issuer | `Pubkey` | 32 |
| category | `u8` | 1 |
| lifecycle | `u8` | 1 |
| publication_removed | `bool` | 1 |
| metadata_hash | `[u8; 32]` | 32 |
| evidence_hash | `[u8; 32]` | 32 |
| location_hash | `[u8; 32]` | 32 |
| timeline_head | `[u8; 32]` | 32 |
| handoff_head | `[u8; 32]` | 32 |
| update_count | `u64` | 8 |
| created_at | `i64` | 8 |
| updated_at | `i64` | 8 |
| bump | `u8` | 1 |
| reserved | `[u8; 32]` | 32 |

`LEN = 324`.

At creation lifecycle is `open`, `publication_removed=false`,
`handoff_head=[0;32]`, and `update_count=1` because the creation event has
sequence 1.

### `CommitmentEvent`

| Field | Type | Bytes |
|---|---|---:|
| discriminator | `[u8; 8]` | 8 |
| issue | `Pubkey` | 32 |
| event_id | `[u8; 32]` | 32 |
| event_type | `u8` | 1 |
| category | `u8` | 1 |
| sequence | `u64` | 8 |
| previous_head | `[u8; 32]` | 32 |
| new_head | `[u8; 32]` | 32 |
| payload_hash | `[u8; 32]` | 32 |
| metadata_hash | `[u8; 32]` | 32 |
| issue_evidence_hash | `[u8; 32]` | 32 |
| location_hash | `[u8; 32]` | 32 |
| lifecycle | `u8` | 1 |
| publication_removed | `bool` | 1 |
| occurred_at | `i64` | 8 |
| actor | `Pubkey` | 32 |
| bump | `u8` | 1 |
| reserved | `[u8; 15]` | 15 |

`LEN = 332`.

`issue_evidence_hash` is always the issue's approved public-derivative hash
snapshot after this event, never a separate event attachment hash.
`category` is likewise the post-event issue category snapshot.
`occurred_at` is the Solana clock time. Human-observed/database event time is
inside the canonical payload hash when applicable. `actor` is the bounded
service signer, not a human operator; human identity remains in private
database audit.

For event types 0, 1, 2, and 4, `previous_head`/`new_head` refer to
`timeline_head`. For type 3 they refer to `handoff_head`.

## IDs and hashes

Native v2 public issue, version, and database event IDs are canonical lowercase
UUIDv4 strings. Convert UUIDs to their 16 network-order bytes.

```text
issue_key =
  SHA-256("nagarik:v2:issue\0" || public_issue_uuid_bytes)

event_id =
  SHA-256(
    "nagarik:v2:event\0"
    || issue_key
    || event_uuid_bytes
    || event_type_u8
  )

operation_id =
  SHA-256(
    "nagarik:v2:operation\0"
    || issue_key
    || event_id
    || operation_type_u8
  )
```

An event record hash is:

```text
event_record_hash =
  SHA-256(
    "nagarik:v2:event-record\0"
    || issue_key
    || event_id
    || event_type_u8
    || category_u8
    || sequence_le_u64
    || payload_hash
    || metadata_hash
    || issue_evidence_hash
    || location_hash
    || lifecycle_u8
    || publication_removed_u8
  )
```

Timeline or handoff head:

```text
new_head =
  SHA-256(
    "nagarik:v2:timeline\0" or "nagarik:v2:handoff\0"
    || previous_head
    || event_id
    || event_type_u8
    || event_record_hash
  )
```

The unused head is unchanged. Initial heads are 32 zero bytes.

## Canonical JSON

All canonical JSON:

- follows RFC 8785 JSON Canonicalization Scheme;
- normalizes every string to Unicode NFC before schema validation;
- uses canonical lowercase UUID strings;
- uses UTC RFC 3339 timestamps with exactly millisecond precision;
- uses lowercase 64-character hex for JSON hash values;
- rejects unknown fields;
- includes every schema field; nullable fields use JSON `null`; `undefined` and
  omission are invalid;
- sorts set-like arrays by canonical identifier before serialization;
- contains no non-finite or floating-point location value.

Text uses the frozen `nagarik-text-v1` preprocessing profile before bounds and
schema validation:

- decode as valid UTF-8 and normalize to Unicode NFC;
- reject NUL, Unicode noncharacters, bidi embedding/override/isolate controls
  `U+202A..U+202E` and `U+2066..U+2069`, and C0/C1 controls except the line
  inputs HT, LF, CR, and NEL (`U+0085`) handled below; ZWJ/ZWNJ remain allowed
  for script shaping;
- single-line fields replace every Unicode `White_Space` run (including line
  separators and tab) with one ASCII space, then trim ASCII space;
- multiline `narrative` converts CRLF/CR/Unicode line separators to LF,
  converts other Unicode whitespace runs within each line to one ASCII space,
  trims each line, removes leading/trailing empty lines, and collapses more
  than two consecutive LF characters to two;
- code-point bounds are evaluated after this profile.

Titles, labels, publisher names, public notes, reference titles, and reason text
use the single-line profile. Only `narrative` uses the multiline profile. Any
change requires a metadata/event schema-version amendment and new vectors.

### Public metadata object

Exact top-level schema:

```json
{
  "schemaVersion": "nagarik-public-metadata-v2",
  "canonicalization": "RFC8785",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "versionId": "50cedad4-9610-4bee-a826-0257f4f3a8dc",
  "versionNumber": 1,
  "versionCreatedAt": "2026-07-31T12:00:00.000Z",
  "recordKind": "community_report",
  "title": "Approved title",
  "narrative": "Approved public narrative.",
  "category": "water",
  "ward": {
    "id": "configured-ward-id",
    "label": "Approved ward label",
    "geometryVersion": "pilot-boundary-2026-01"
  },
  "localityLabel": null,
  "location": {
    "policyVersion": "grid-0.01deg-v1",
    "wardId": "configured-ward-id",
    "wardGeometryVersion": "pilot-boundary-2026-01",
    "latIndex": 11770,
    "lngIndex": 26531,
    "coarseCellId": "g1-11770-26531",
    "centerLatE6": 27705000,
    "centerLngE6": 85315000,
    "uncertaintyRadiusM": 800
  },
  "media": {
    "mediaId": "med_public_opaque_id",
    "sha256": "<64 lowercase hex>",
    "mimeType": "image/webp",
    "width": 1600,
    "height": 1200,
    "normalizationVersion": "image-v2"
  },
  "provenance": {
    "kind": "community_report",
    "firstObservedOn": "2026-07-30",
    "receivedAt": "2026-07-31T11:30:00.000Z",
    "lastCheckedAt": "2026-07-31T12:00:00.000Z"
  }
}
```

`localityLabel` is required and is either an approved 1-80 code-point string or
`null`. `recordKind` is `community_report` or `public_source`.

For `public_source`, provenance is exactly:

```json
{
  "kind": "public_source",
  "publisher": "Approved publisher name",
  "sourceUrl": "https://public.example/source",
  "sourceIdentity": "<64 lowercase hex>",
  "contentSha256": "<64 lowercase hex>",
  "sourcePublishedAt": "2026-07-30T06:00:00.000Z",
  "contentCheckedAt": "2026-07-31T12:00:00.000Z",
  "statusUpdatedAt": "2026-07-31T12:00:00.000Z",
  "nextReviewAt": "2026-08-31T12:00:00.000Z",
  "status": "current"
}
```

`status` is `current`, `stale`, `unavailable`, or `superseded`.
`sourceUrl`, `sourceIdentity`, and `contentSha256` are the canonical final URL,
domain-separated identity, and decoded-body checksum produced by the exact
algorithm in `api-contracts.md`; input/intermediate URLs are forbidden.
`publishedAt` is intentionally absent because it is assigned only after
finalized commitment. Storage URLs, private coordinates, reporter/operator
identity, moderation notes, tracking material, and raw receipt values are
forbidden.

All metadata fields are required. `localityLabel` may be JSON `null`;
public-source `sourcePublishedAt` may be null when the reviewed source exposes
no publication time. There are no optional/omitted fields. Bounds are:

| Field | Exact type/bound |
|---|---|
| `publicIssueId`, `versionId` | canonical lowercase UUID |
| `versionNumber` | JSON integer `1..4294967295` |
| `versionCreatedAt` | canonical timestamp |
| `recordKind` | `community_report` or `public_source` |
| `title` | NFC string, 8-120 code points |
| `narrative` | NFC string, 20-2000 code points |
| `category` | exact Category string enum |
| ward/location IDs and versions | NFC ASCII-safe identifier, 1-80 bytes, pattern `[A-Za-z0-9._:-]+` |
| ward label | NFC string, 1-120 code points |
| locality label | NFC string, 1-80 code points, or `null` |
| `latIndex` | integer `0..17999` |
| `lngIndex` | integer `0..35999` |
| `centerLatE6` | integer `-89995000..89995000` |
| `centerLngE6` | integer `-179995000..179995000` |
| `coarseCellId` | exact `g1-{latIndex}-{lngIndex}` |
| `uncertaintyRadiusM` | integer exactly `800` |
| public `mediaId` | ASCII opaque identifier, 1-128 bytes, pattern `[A-Za-z0-9_-]+` |
| media MIME/version | MIME is exactly `image/jpeg` or `image/webp`; version is exactly `image-v2` |
| media width/height | JSON integers `1..1600` |
| date-only value | Gregorian `YYYY-MM-DD` |
| publisher | NFC normalized per API, 1-120 code points |
| canonical source URL | UTF-8 HTTPS URL, at most 2048 bytes |

Community provenance has exactly `kind`, `firstObservedOn`, `receivedAt`, and
`lastCheckedAt`; timestamps are ordered and the observed date is not later than
the Kathmandu date of receipt. Public-source provenance has exactly the ten
fields displayed above;
`contentCheckedAt <= statusUpdatedAt < nextReviewAt`, and a non-null
`sourcePublishedAt` must be no later than `contentCheckedAt`. On a failed
recheck, the last successful `contentSha256`/`contentCheckedAt` remain unchanged
while `statusUpdatedAt` advances and status becomes `unavailable`.

```text
metadata_hash = SHA-256(RFC8785(public_metadata))
location_hash = SHA-256(RFC8785(public_metadata.location))
evidence_hash = SHA-256(exact approved public derivative bytes)
```

The media SHA-256 inside metadata must equal `evidence_hash`.
`IssueCommitment.evidence_hash` changes only on `issue_created` or
`metadata_version_committed` when the approved issue derivative changes.
Lifecycle, handoff, and removal preserve it. Each `CommitmentEvent` stores that
post-event value as `issue_evidence_hash`. Event-specific observation, media,
reference, or withheld evidence is committed only through the exact canonical
event object and `payload_hash`; it is never substituted into the account
snapshot field. No zero sentinel is used for an issue that has required public
media.

## Canonical issue event payloads

Every event object has exactly these common required fields:

| Field | Exact type/bound |
|---|---|
| `schemaVersion` | constant `nagarik-public-event-v2` |
| `eventId` | canonical lowercase database-event UUIDv4 |
| `publicIssueId` | canonical lowercase public-issue UUID |
| `eventType` | exact event string below |
| `chainSequence` | JSON integer `1..9007199254740991`; equals reserved `CommitmentEvent.sequence` |
| `createdAt` | immutable canonical database transaction timestamp |

Every displayed field is required. A field marked nullable is encoded as JSON
`null`, never omitted. Text is NFC; hashes are lowercase hex; unknown values or
fields fail before outbox creation.

### Issue created

Exact object:

```json
{
  "schemaVersion": "nagarik-public-event-v2",
  "eventId": "2ef9af1c-e62e-4d37-8e09-f576de2033d5",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "eventType": "issue_created",
  "chainSequence": 1,
  "createdAt": "2026-07-31T12:00:00.000Z",
  "versionId": "50cedad4-9610-4bee-a826-0257f4f3a8dc",
  "versionNumber": 1,
  "versionCreatedAt": "2026-07-31T12:00:00.000Z",
  "category": "water",
  "metadataHash": "<64 lowercase hex>",
  "issueEvidenceHash": "<64 lowercase hex>",
  "locationHash": "<64 lowercase hex>"
}
```

`versionNumber`, `chainSequence`, and the resulting account update count are
all exactly `1`; `versionCreatedAt <= createdAt`.

### Metadata version committed

Exact object:

```json
{
  "schemaVersion": "nagarik-public-event-v2",
  "eventId": "f2638f49-ea43-424f-a9df-f6be4f6de320",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "eventType": "metadata_version_committed",
  "chainSequence": 2,
  "createdAt": "2026-08-01T12:00:00.000Z",
  "fromVersionId": "50cedad4-9610-4bee-a826-0257f4f3a8dc",
  "toVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "toVersionNumber": 2,
  "reasonCategory": "correction",
  "versionCreatedAt": "2026-08-01T12:00:00.000Z",
  "category": "water",
  "metadataHash": "<64 lowercase hex>",
  "issueEvidenceHash": "<64 lowercase hex>",
  "locationHash": "<64 lowercase hex>"
}
```

`reasonCategory` is `correction`, `source_recheck`, `media_redaction`,
`location_policy_update`, or `other_reviewed`. `category` is the exact Category
string encoded into the post-event account snapshot. IDs differ, the version
number is exactly current plus one, and `versionCreatedAt <= createdAt`.

### Lifecycle changed

Exact object:

```json
{
  "schemaVersion": "nagarik-public-event-v2",
  "eventId": "b646416d-57a1-4807-ad8a-c5ea2a49c80a",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "eventType": "lifecycle_changed",
  "chainSequence": 3,
  "createdAt": "2026-08-02T12:00:00.000Z",
  "issueVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "from": "open",
  "to": "in_progress",
  "reasonCode": "work_started",
  "publicNote": "A steward recorded that work has started.",
  "evidence": {
    "type": "operator_observation"
  },
  "observedAt": "2026-08-02T11:55:00.000Z",
  "disputedEventId": null,
  "disputeResolutionEventId": null,
  "closureDisposition": null
}
```

`from`/`to` use the Lifecycle strings and must be an allowed transition.
`reasonCode` is exactly one of `work_started`, `progress_observed`,
`resolution_evidence_reviewed`, `administrative_closure`, `duplicate_record`,
`outside_pilot_scope`, `superseded_record`, `safety_restriction`,
`dispute_opened`, `dispute_resolved`, or `other_reviewed`. `publicNote` is
`null` or 1-500 code points. `observedAt` is `null` or a canonical timestamp
not after `createdAt + 5 minutes` and not before first publication.

`evidence` is exactly one of:

```json
{"type":"operator_observation"}
```

```json
{
  "type": "approved_public_media",
  "publicMediaId": "med_public_opaque_id",
  "sha256": "<64 lowercase hex>"
}
```

```json
{
  "type": "reviewed_external_reference",
  "url": "https://public.example/reference",
  "publisher": "Approved publisher",
  "title": "Reference title",
  "checkedAt": "2026-08-02T12:00:00.000Z",
  "contentSha256": "<64 lowercase hex>"
}
```

The external-reference URL uses the exact final-URL normalization and bounded
fetch rules in `api-contracts.md`; publisher is 1-120 code points, title is
1-200, and `checkedAt <= createdAt`. The private request's operator media
receipt transforms to public media ID/hash; its raw value is never canonical.

`disputedEventId` is non-null only when `to="disputed"` and identifies the
finalized event under dispute. `disputeResolutionEventId` is non-null only when
`from="disputed"` and identifies the current dispute event. Both are otherwise
`null`. `closureDisposition` is non-null only when `to="closed"` and is
`resolved_then_closed`, `administrative_unresolved`, `duplicate`,
`outside_scope`, or `superseded`; it is otherwise `null`.

### Handoff checkpointed

The common `eventId` is also the handoff domain event UUID. There is no second
`handoffEventId`. Exact object:

```json
{
  "schemaVersion": "nagarik-public-event-v2",
  "eventId": "aef54240-bbf9-471f-97b2-80f653a37147",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "eventType": "handoff_checkpointed",
  "chainSequence": 4,
  "createdAt": "2026-08-03T12:00:00.000Z",
  "issueVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "handoffCycleId": "95b4bf41-66bd-432e-a58c-57e11ded4377",
  "publicHandoffSequence": 1,
  "handoffType": "sent",
  "recipientClass": "municipal_department",
  "channel": "portal",
  "publicEvidence": {
    "type": "portal_ticket_reference",
    "publicReference": "KMC-2026-123",
    "referenceWithheld": false,
    "publicMediaId": null,
    "sha256": null,
    "evidencePolicyVersion": null
  },
  "publicNote": "The issue record was sent through the configured portal.",
  "occurredAt": "2026-08-03T11:55:00.000Z",
  "reasonCode": null,
  "supersededEventId": null,
  "correctionReasonCategory": null
}
```

`publicHandoffSequence` is reserved transactionally before hashing, is
`1..9007199254740991`, and is distinct from private aggregate sequence and
global `chainSequence`. FIFO dead-letter freeze prevents gaps.

`handoffType` is `sent`, `acknowledged`, `closed`, or `action_recorded`; a
superseding replacement uses its actual replacement type and a non-null
`supersededEventId`. `recipientClass` is `municipal_department`,
`ward_office`, `public_utility`, `road_authority`, or
`other_reviewed_public_body`. `channel` is `email`, `portal`,
`registered_mail`, `physical_delivery`, or `other_reviewed`. `publicNote` is
`null` or 1-500 code points. `occurredAt <= createdAt + 5 minutes`.
`issueVersionId` is the current published version UUID whose metadata hash is
snapshotted by the event account. `handoffCycleId` is the server-generated
canonical UUID for the private prepared/sent/acknowledged/closed cycle and is
copied unchanged into every public event in that cycle. `reasonCode` is
non-null only for
`handoffType="closed"` and is `delivery_cycle_complete`,
`recipient_closed_process`, `superseded_process`, or `other_reviewed`; it is
otherwise `null`. For `closed` and `action_recorded`, recipient class and
channel are copied from the current handoff aggregate, not supplied as
alternate history.

For `sent`, evidence type is `email_message_id`, `registered_mail_receipt`,
`portal_ticket_reference`, `physical_receipt_scan`, or
`other_reviewed_reference`. For `acknowledged`, it is
`official_email_reply`, `portal_acknowledgment`, `signed_receipt`,
`authority_ticket_status`, or `other_reviewed_acknowledgment`. For
`action_recorded`, it is `operator_observation`, `approved_public_media`, or
`reviewed_external_reference`. For `closed`, `publicEvidence` is JSON `null`.

For a non-null evidence object, all six displayed fields are required.
Variant rules are:

| Variant | Required values |
|---|---|
| dispatch/acknowledgment reference types | `publicReference` is `null` or 1-160 code points; `referenceWithheld` is true exactly when null; public media ID/hash are both null or both valid |
| `operator_observation` | reference/media/hash/policy all null; `referenceWithheld=false` |
| `approved_public_media` | reference null, `referenceWithheld=false`, valid public media ID and exact byte hash, policy null |
| `reviewed_external_reference` | canonical final URL in `publicReference`, `referenceWithheld=false`, media ID null, decoded-body `contentSha256` in `sha256`, policy null |

An `other_reviewed_*` type requires a 1-80 byte active
`evidencePolicyVersion`; all other reference types require it to be null. Raw
private references/receipts and low-entropy private-reference hashes are
forbidden.

`supersededEventId` and `correctionReasonCategory` are either both null or both
non-null. The event ID must identify a prior finalized public handoff event;
the replacement must use the target's `handoffType` and `handoffCycleId`, and
it cannot rewrite current private aggregate state. The reason is
`incorrect_reference`, `incorrect_recipient`,
`incorrect_channel`, `incorrect_time`, or `other_reviewed`. Prepared/failed
events and their supersessions remain private and have no canonical payload.

### Publication removed

Canonical tombstone metadata is exactly:

```json
{
  "schemaVersion": "nagarik-public-tombstone-v1",
  "canonicalization": "RFC8785",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "removedVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "removedAt": "2026-08-04T12:00:00.000Z",
  "reasonCategory": "privacy_safety",
  "notice": "This issue is no longer publicly available."
}
```

`notice` is the displayed constant. `reasonCategory` is `privacy_safety`,
`legal_requirement`, `outside_scope`, `duplicate`, `source_retracted`,
`policy_violation`, or `other_reviewed`. No removed title, narrative, location,
media, source, requester, operator, or private reason is present.

```text
tombstone_metadata_hash =
  SHA-256(RFC8785(canonical_tombstone_metadata))
```

The canonical removal event is exactly:

```json
{
  "schemaVersion": "nagarik-public-event-v2",
  "eventId": "94297c73-7a13-4465-8cdf-05627647d0d4",
  "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
  "eventType": "publication_removed",
  "chainSequence": 5,
  "createdAt": "2026-08-04T12:00:00.000Z",
  "removedVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "reasonCategory": "privacy_safety",
  "removedAt": "2026-08-04T12:00:00.000Z",
  "tombstoneVersion": "nagarik-public-tombstone-v1",
  "tombstoneMetadataHash": "<64 lowercase hex>"
}
```

`createdAt` equals `removedAt`; event/tombstone IDs, times, reason, version, and
hash must match. The event payload maps directly to
`mark_publication_removed`; no caller-supplied alternate tombstone bytes are
accepted.

```text
payload_hash = SHA-256(RFC8785(canonical_issue_event_payload))
```

## Issue instruction contract

All issue instructions require:

- protocol version `2`;
- `paused=false`;
- active `RoleGrant` for the exact signer and required bit;
- exact protocol/issue/event PDAs;
- unique event PDA;
- valid known enum values;
- expected update count and both prior heads for every non-create operation;
- non-zero payload/metadata/evidence/location hashes where required;
- chain clock and terminal-state rules;
- `update_count < 9007199254740991` before a non-create append, so every
  resulting sequence remains exactly representable by the canonical JSON
  contract.

`expected_update_count` is the database-reserved issue-global FIFO sequence
minus one. `expected_timeline_head` and `expected_handoff_head` are both
validated against `IssueCommitment`, including when one remains unchanged.
Only the event stream selected by the discriminant derives a new head. This
serializes cross-stream operations and makes `CommitmentEvent.sequence`
gapless. A worker submits only the next confirmed sequence.

### `create_issue`

Required role: `issue_issuer`.

Inputs:

```text
issue_key
event_id
category
payload_hash
metadata_hash
evidence_hash
location_hash
```

Creates `IssueCommitment` and sequence-1 `CommitmentEvent`. It sets lifecycle
`open`, removed `false`, update count `1`, timeline head to the derived head,
and handoff head to zero.

### `commit_metadata_version`

Required role: `issue_issuer`.

Inputs:

```text
event_id
expected_update_count
expected_timeline_head
expected_handoff_head
expected_category
new_category
payload_hash
new_metadata_hash
new_evidence_hash
new_location_hash
```

Rejected when removed. Existing category must equal `expected_category`;
`new_category` is known and must match canonical metadata/event payload. The
instruction updates category, the three current hashes, timeline head, update
count, and time. Lifecycle is unchanged.

### `append_lifecycle`

Required role: `lifecycle_writer`.

Inputs:

```text
event_id
expected_update_count
expected_timeline_head
expected_handoff_head
expected_lifecycle
new_lifecycle
payload_hash
```

The transition must be one allowed edge in `state-machines.md`.
Metadata/location hashes are unchanged. The event snapshot uses the issue's
current metadata/location/issue-evidence hashes and new lifecycle. Event-specific
public evidence exists only inside the canonical payload committed by
`payload_hash`.

### `checkpoint_handoff`

Required role: `handoff_writer`.

Inputs:

```text
event_id
expected_update_count
expected_timeline_head
expected_handoff_head
payload_hash
```

Metadata/location/lifecycle/removed state is unchanged. It updates handoff
head, update count, and time. Event-specific public evidence exists only inside
the canonical payload; `issue_evidence_hash` snapshots the unchanged current
issue derivative hash.

### `mark_publication_removed`

Required role: `removal_writer`.

Inputs:

```text
event_id
expected_update_count
expected_timeline_head
expected_handoff_head
payload_hash
tombstone_metadata_hash
```

Requires `publication_removed=false`, then sets it true, replaces the current
metadata hash with the neutral tombstone hash, preserves evidence/location
hashes for historical commitment, updates timeline head/count/time, and
creates the event. Category/lifecycle discriminants, prior immutable event
accounts, service-signer keys, timestamps, and compact hashes/heads remain
public chain history. No instruction restores a removed issue in v2.

## Administrative instruction contract

Administrative instructions do not create `CommitmentEvent` accounts and do
not use issue-event discriminants. They mutate only the exact config/grant PDA
and emit the frozen Anchor events below. Solana transaction history plus
monotonic account revisions is the public administrative audit surface.

### `initialize_protocol`

Arguments: none.

| Account | Rule |
|---|---|
| `payer` | mutable signer funding the config account |
| `genesis_authority` | read-only signer; key equals compile-time `GENESIS_AUTHORITY` |
| `protocol_config` | mutable `init`; exact `[b"protocol", b"v2"]` PDA |
| `system_program` | exact System Program |

The instruction rejects a default/mismatched genesis key and any existing
config. It stores the compiled genesis authority, `paused=true`,
`pending_authority=None`, `revision=1`, exact bump, and zero reserved bytes.

### `set_role`

Arguments in Borsh order:

```text
expected_config_revision: u64
expected_grant_revision: u64
role_bits: u16
active: bool
```

| Account | Rule |
|---|---|
| `authority` | mutable signer and payer; equals config authority |
| `protocol_config` | mutable exact protocol PDA and expected revision |
| `subject` | read-only non-default unchecked public key |
| `role_grant` | mutable `init_if_needed`; exact subject grant PDA |
| `system_program` | exact System Program |

For a missing grant, `expected_grant_revision=0`, `active=true`, and known
non-zero `role_bits` are required; revision becomes `1`. Existing changes
require exact grant revision and a state/role change. Active grants may update
known non-zero bits. Revocation requires `active=false`, preserves role bits,
sets chain-clock `revoked_at`, and never closes the account. Reactivation
requires known non-zero bits and resets timestamps as defined above. Unknown
bits, no-op changes, overflow, or grant/protocol mismatch fail. While paused,
activation, reactivation, and active role-bit changes are allowed so the
protocol can be configured before unpause. While unpaused, only
active-to-inactive revocation is allowed; activation/expansion first requires a
separate successful pause transaction. Every success increments config revision
once.

### `set_pause`

Arguments:

```text
expected_config_revision: u64
paused: bool
```

Accounts are signer `authority` and mutable exact `protocol_config`. Authority
and revision must match; target must differ from current state; revision
increments once. Unpause additionally requires
`pending_authority=None`; an unresolved transfer cannot coexist with issue
writes.

### `propose_authority`

Arguments:

```text
expected_config_revision: u64
new_authority: Pubkey
```

Accounts are signer current `authority` and mutable exact `protocol_config`.
The protocol must be paused and pending authority must currently be absent. New
authority is non-default and different from current; revision increments.

### `cancel_authority_proposal`

Argument: `expected_config_revision: u64`.

Accounts are signer current `authority` and mutable exact `protocol_config`.
The protocol must be paused and pending authority must exist. It is cleared and
revision increments.

### `accept_authority`

Argument: `expected_config_revision: u64`.

Accounts are signer `pending_authority` and mutable exact `protocol_config`.
The protocol must be paused. The signer must equal the stored pending authority
and revision must match. Authority changes atomically, pending authority
clears, and revision increments.

Issue operations are rejected while paused. Role activation/expansion and
authority proposal/cancellation/acceptance require paused state. Role revocation
and pause changes remain available in either state for recovery.

### Administrative Anchor events

Fields are emitted in listed order:

```text
ProtocolInitialized {
  protocol: Pubkey,
  authority: Pubkey,
  config_revision: u64
}

RoleGrantChanged {
  protocol: Pubkey,
  authority: Pubkey,
  subject: Pubkey,
  role_bits: u16,
  active: bool,
  grant_revision: u64,
  config_revision: u64
}

PauseChanged {
  protocol: Pubkey,
  authority: Pubkey,
  paused: bool,
  config_revision: u64
}

AuthorityProposed {
  protocol: Pubkey,
  current_authority: Pubkey,
  pending_authority: Pubkey,
  config_revision: u64
}

AuthorityProposalCancelled {
  protocol: Pubkey,
  authority: Pubkey,
  cancelled_pending_authority: Pubkey,
  config_revision: u64
}

AuthorityAccepted {
  protocol: Pubkey,
  previous_authority: Pubkey,
  new_authority: Pubkey,
  config_revision: u64
}
```

## Required vectors and tests

Committed fixtures must include:

- UUID string-to-bytes;
- issue/event/operation IDs;
- every PDA and bump;
- metadata/location/evidence hashes;
- every canonical event payload hash;
- canonical tombstone bytes/hash and removed-event mapping;
- timeline and handoff head progression;
- interleaved issue-global FIFO timeline/handoff sequences and both-head guards;
- all account serialized lengths and rent;
- every enum discriminant and role bit;
- genesis capture rejection, config/grant revision races, every administrative
  instruction account/argument transition, and Anchor event bytes;
- v1 fixture proving no v2 reinterpretation.

Rust and TypeScript produce byte-for-byte identical vectors. Generated IDL
field order, types, program ID, and account sizes must match this contract.

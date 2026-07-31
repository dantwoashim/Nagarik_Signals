# ADR 0005: v1/v2 Protocol and Proof Versioning

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture and Solana v2

The exact account layouts, bounds, instruction inputs, enum values, canonical
objects, hash domains, and operation mapping are frozen in
`docs/production/protocol-v2-contract.md`. That file is part of this decision.

## Context

The deployed v1 prototype uses a global issue counter, browser/session-funded
signers, verification PDAs/counts, and lifecycle semantics that conflict with
the production workflow. Retrofitting those accounts would reinterpret
historical records and create compatibility and trust ambiguity.

## Decision

v1 is checksum-frozen historical read/proof. Production mutation code never
invokes it. Existing v1 `verified` behavior is labelled
`legacy_signal_threshold_reached`; it is not mapped to a v2 lifecycle state or
unique-person verification.

Native-v2 correction, source recheck, lifecycle, and handoff routes return
`409 legacy_read_only` for an imported v1 ID and never synthesize a v2 wrapper.
An authorized terminal privacy removal may deny the imported public projection
and media and publish a neutral database tombstone, but it never invokes v1,
creates a v2 account, or claims an on-chain removal. Historical v1 proof remains
available with removed content marked unavailable.

The frozen v1 program ID is
`76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY`; the baseline IDL SHA-256 is
`776832A82DB6C76B8165614327D866C182E60FC2D121C9536410D016C032A61A`.
The exact compatibility route/DTO matrix in
`docs/production/api-contracts.md` is part of this decision.

v2 is a distinct Anchor program with:

- new program ID and generated IDL;
- no global issue counter;
- no browser/session signer or funding;
- no verification account/count/instruction;
- protocol config, role grants, issue commitments, and immutable commitment
  events;
- compile-time genesis authority plus monotonic config/grant revisions;
- issue-global FIFO sequence and expected state/both-head/update-count checks;
- pause and paused-only two-step authority transfer;
- compact hashes only.

### Identifier derivation

- Native v2 public issue ID: server-generated UUIDv4.
- Imported v1 public ID: UUIDv5 namespace
  `029aa1f6-cf8c-41d0-b778-a0eff42ba87d`, name
  `nagarik-signal:v1:{numericIssueId}`.
- Public version and database event IDs: server-generated UUIDv4.
- `issue_key`:
  `SHA-256("nagarik:v2:issue\0" || public_issue_uuid_bytes)`.
- `event_id`:
  `SHA-256("nagarik:v2:event\0" || issue_key || event_uuid_bytes ||
  event_type_byte)`.
- operation IDs use a distinct `nagarik:v2:operation\0` domain.

UUID strings are canonical lowercase with hyphens before conversion to 16 raw
bytes. Cross-runtime fixtures are mandatory.

### PDA seeds

```text
ProtocolConfig:
  ["protocol", "v2"]

RoleGrant:
  ["role", protocol_config_pubkey, subject_pubkey]

IssueCommitment:
  ["issue", protocol_config_pubkey, issue_key]

CommitmentEvent:
  ["event", issue_commitment_pubkey, event_id]
```

All seed byte strings are ASCII. The program verifies the configured protocol
version, role, pause state, expected update count, both prior heads/state, event
uniqueness, and terminal rules. Timeline and handoff operations share one
gapless issue-global sequence; a dead letter cannot be skipped or rebased.

### Stable protocol enums

Category values are frozen:

```text
0 road
1 waste
2 water
3 electricity_lighting
4 public_facility
5 public_safety_hazard
6 other_public_infrastructure
```

Lifecycle values are frozen:

```text
0 open
1 in_progress
2 resolved
3 closed
4 disputed
```

Commitment event types are frozen:

```text
0 issue_created
1 metadata_version_committed
2 lifecycle_changed
3 handoff_checkpointed
4 publication_removed
```

Role bits are frozen:

```text
0x0001 issue_issuer
0x0002 lifecycle_writer
0x0004 handoff_writer
0x0008 removal_writer
```

The protocol authority manages grants, pause, and authority transfer. Human
operator identity stays in the database audit; the on-chain actor is the
bounded service signer whose role authorized that typed operation.

The unique config can be initialized only by the public key compiled as
`GENESIS_AUTHORITY` and recorded in source/IDL/release manifest. Administrative
mutations require exact monotonic revisions and use the complete accounts,
arguments, transitions, and Anchor events in the protocol contract.

The duplicated summary above is informational. If it differs from
`protocol-v2-contract.md`, implementation stops and this ADR must be amended;
the detailed protocol contract is authoritative.

### Canonical public proof

Canonical JSON uses RFC 8785 JSON Canonicalization Scheme under an explicit
version. The v2 metadata object includes approved immutable public fields only:

- schema/canonicalization version;
- public issue UUID and immutable version UUID;
- approved title/narrative/category;
- versioned coarse public location;
- approved derivative opaque ID and exact SHA-256;
- approved public provenance/freshness fields;
- immutable public-version creation timestamp and version number.

It excludes reporter/operator identity, private coordinates/text, moderation
notes, storage URLs/keys, tokens, receipts, and evidence bytes.

`publishedAt` is set only after finalized chain reconciliation and is not part
of the pre-commit metadata hash. The committed timestamp is
`versionCreatedAt`, assigned in the approval/version-freeze transaction.

Before canonicalization:

- strings are Unicode NFC;
- UUIDs are canonical lowercase with hyphens;
- timestamps are UTC RFC 3339 with exactly millisecond precision;
- hashes are 32-byte values represented as lowercase 64-character hex in JSON;
- canonical public location is exactly:
  `{"policyVersion":"grid-0.01deg-v1","wardId":string,
  "wardGeometryVersion":string,"latIndex":integer,"lngIndex":integer,
  "coarseCellId":"g1-{latIndex}-{lngIndex}","centerLatE6":integer,
  "centerLngE6":integer,"uncertaintyRadiusM":800}` with keys serialized by
  RFC 8785; it does not contain `localityLabel` or floating-point coordinates;
- every schema field is present; contract-nullable values use JSON `null`, and
  omission/`undefined` is invalid;
- arrays preserve contract-defined order and set-like collections are sorted
  by canonical identifier before serialization.

The program stores separate metadata, evidence, and location hashes plus
timeline/handoff commitment heads. Event/head hashes use domain-separated
canonical bytes and expected prior head.

Timeline and handoff heads start as 32 zero bytes. A new head is:

```text
SHA-256(
  "nagarik:v2:timeline\0" or "nagarik:v2:handoff\0"
  || previous_head
  || event_id
  || event_type_byte
  || event_record_hash
)
```

The deterministic outbox operation ID is:

```text
SHA-256(
  "nagarik:v2:operation\0"
  || issue_key
  || event_id
  || operation_type_byte
)
```

Proof responses independently report:

- delivered approved bytes;
- canonical metadata;
- canonical public location;
- chain account/event binding;
- public evidence availability;
- explicit limitation that integrity does not prove real-world truth.

RPC error/timeout is not account absence. v1 and v2 proof readers, types, IDLs,
program IDs, and fixtures are namespaced.

## Network and custody

The curated pilot uses an explicitly configured approved non-mainnet cluster
and requires finalized commitment before publication. Mainnet write
configuration fails startup until independent audit and key-governance
evidence is approved.

## Invariants

- v1 source/account layout/IDL/program meaning is unchanged.
- v1 and v2 program IDs are distinct.
- generated IDLs are never hand-edited and drift fails CI.
- TypeScript and Rust PDA/hash vectors match.
- v2 stores no title, narrative, URL, exact location, personal data, official
  receipt, or evidence bytes.
- deterministic event IDs make retry discovery possible.
- no signal changes v2 state.

## Rejected alternatives

- **Upgrade v1 semantics in place:** corrupts historical meaning and deployed
  account assumptions.
- **Keep verification count but relabel UI:** protocol still encodes the wrong
  behavior.
- **Use sequential issue counter:** creates contention and unnecessary public
  sequencing.
- **Commit storage URLs:** mutable/private infrastructure leaks into immutable
  proof.
- **Treat transaction signature as proof success:** does not verify account
  content or finality.

## Verification

- v1 checksum and historical fixture;
- v2 generated IDL/program-ID drift;
- Rust format/clippy/test and Anchor positive/negative tests;
- account-size/rent tests;
- unauthorized/paused/wrong-PDA/stale-head/replay/terminal/concurrency tests;
- TypeScript/Rust UUID/key/PDA/canonicalization/hash vectors;
- RPC timeout/error and finalized reconciliation tests.

## Rollback

Disable v2 writes/publication and retain v1 reads. Confirmed v2 commitments are
corrected by append-only events. Program pause/role revoke/key incident
procedures require approved custody governance.

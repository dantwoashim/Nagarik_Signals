# ADR 0004: Idempotency, Outbox, and Reconciliation

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture, database, workflow

## Context

HTTP retries, browser double-submit, worker crashes, RPC timeouts, and database
failures can repeat a mutation or leave the chain/database uncertain. The
prototype has route-specific best-effort behavior and performs chain writes
before durable local intent.

## Decision

Every external mutation requires a caller-generated UUIDv4
`Idempotency-Key`. The database reserves:

- API/contract version;
- operation scope;
- actor/capability and organization scope;
- resource identity;
- canonical semantic request hash;
- lifecycle status;
- stable logical response.

Same key/same request returns the stored logical status/data. A fresh request
ID is added per attempt. Same key/different request returns conflict.

Raw capabilities and `Set-Cookie` headers are not stored in the idempotency
row. Capability rows store a non-secret reference, purpose, subject, expiry,
idempotency UUID, key version, and keyed verifier. The raw token is
deterministically re-derived with a dedicated capability-derivation key for an
authorized exact replay. Expiry/revocation is never extended by replay.

Chain work is inserted as a typed outbox row in the same transaction as the
domain event. Each operation has a deterministic 32-byte operation ID and
immutable payload. Workers:

1. lease bounded batches with row locks and lease expiry;
2. validate operation allowlist, environment, expected state, and signer policy;
3. read deterministic on-chain state before submission;
4. simulate when policy requires;
5. append an attempt and submit;
6. confirm at the configured commitment level;
7. reconcile exact account/event content;
8. mark confirmed, retry with backoff, or dead-letter.

All operations for one issue use a single database-reserved FIFO. The
reservation transaction locks the issue checkpoint row, allocates the next
global sequence, snapshots both projected heads, records the predecessor, and
advances only the projected head for the event stream. The worker submits only
the next sequence after its predecessor confirms. A dead letter freezes every
descendant; no API may skip/rebase/cancel it or alter immutable inputs.

RPC timeout/error is `unknown`, never `absent`. Reconciliation happens before
resubmission. An exact existing event confirms the logical job; a conflicting
event is an integrity incident and dead letter.

## Canonicalization

Request hashes include method, route template, contract version, organization,
resource, semantic body, receipt/media IDs, and concurrency preconditions.
Transport headers, request ID, raw bearer tokens, and non-semantic formatting
are excluded.

Outbox operation payloads are typed, versioned, canonical, and immutable.
Worker APIs never accept an arbitrary caller-supplied transaction, PDA, signer,
program ID, hash, or batch query.
External operator APIs supply only their named database domain aggregate
version/head/state. The server locks the checkpoint row and derives/reserves
chain sequence, expected update count, both chain heads, event/operation IDs,
canonical payload, and hashes; those fields are rejected if supplied by a
caller.

## Invariants

- Domain event, idempotency reservation, audit, and outbox intent commit
  atomically.
- One logical operation may have multiple attempts but at most one matching
  deterministic chain event/account transition.
- `CommitmentEvent.sequence` is the gapless issue-global reserved sequence;
  every instruction validates expected count plus both timeline/handoff heads.
- Lease expiry never erases an attempt.
- `confirmed` is terminal except append-only reconciliation annotations.
- Dead-letter replay requires AAL2 system-admin authorization and does not
  mutate the original payload.
- Publication/checkpoint state cannot advance while required work is unknown,
  retrying, mismatched, or dead-lettered.
- The documented client retry horizon is at most 24 hours. Idempotency rows
  and their logical responses have a 30-day pilot maximum. Configuration may
  shorten it only while remaining above the retry horizon.
- Outbox attempts and restricted diagnostics are retained for one year after
  confirmation or administrative closure. Their expiry never removes or
  changes a durable public binding.

## Rejected alternatives

- **Client retry suppression only:** crashes and network ambiguity remain.
- **In-memory locks:** do not survive processes/deployments.
- **Queue without same-transaction outbox:** domain and side-effect intent can
  diverge.
- **Resubmit after timeout without reading chain:** duplicates or conflicts.
- **Generate idempotency key server-side when absent:** cannot identify a
  repeated client intent.

## Verification

- simultaneous same/different-payload request races;
- failures before/after reservation/domain/outbox commit;
- worker crash at lease/simulate/submit/ack/confirm boundaries;
- timeout-after-submit with one deterministic on-chain result;
- lease expiry and competing workers;
- retry/backoff/attempt limits and dead-letter replay;
- conflicting on-chain state incident;
- metrics for oldest pending/submitted, retries, leases, and dead letters.

## Rollback

Pause worker/v2-write/publication flags. Durable pending intent remains in
Postgres for review or later replay. Never delete attempts to make a rollback
look clean.

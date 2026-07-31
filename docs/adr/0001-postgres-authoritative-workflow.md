# ADR 0001: Postgres-Authoritative Workflow

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture and integration  
External approval: not applicable to this internal architecture decision

## Context

The prototype creates and updates Solana state before it durably records local
workflow intent. It also uses a shared JSON object model for public, private,
session, and operational data. Chain success followed by application failure
cannot be rolled back, while in-memory/JSON scans cannot enforce transactional,
authorization, or global correctness invariants.

## Decision

Postgres is the sole authority for workflow state. Solana v2 is a public
commitment/checkpoint layer driven only by durable typed outbox intent.

Every logical mutation:

1. authenticates or validates its bounded capability;
2. authorizes organization/resource/action;
3. validates schema, state, expected version/head, and idempotency;
4. commits the domain change, audit event, and any outbox intent in one
   database transaction;
5. returns a stable logical result;
6. allows a bounded worker to perform an approved external operation;
7. reconciles external state back into Postgres before a dependent projection
   becomes visible.

Public and private access use separate views, repository methods, and DTOs. A
public type has no private fields.

## Invariants

- No public or operator HTTP route directly invokes a chain mutation.
- A DB failure before commit produces no external side effect.
- A required v2 commitment is finalized and hash-matched before publication.
- Worker/RPC failure cannot make an unapproved version public.
- Duplicate and timeout retries converge to one logical operation/event.
- JSON storage is legacy-import input only and cannot satisfy production
  readiness.
- Public aggregate and dedupe queries use indexed SQL over the complete
  eligible set.

## Consequences

- The application needs migrations, RLS, narrow repositories, domain services,
  idempotency, outbox, attempt history, and reconciliation.
- User-visible submission becomes asynchronous and private.
- Chain latency does not hold a browser transaction open.
- Postgres backup/restore and availability become explicit integrity
  requirements in addition to chain commitments.

## Rejected alternatives

- **Chain first, then best-effort DB write:** irreversible orphan/divergence
  remains.
- **Dual-write JSON and Postgres:** creates two workflow authorities and
  indefinite reconciliation complexity.
- **Solana as full workflow database:** exposes private state and cannot support
  moderation/removal/retention requirements.
- **Route-specific field omission:** does not enforce a public/private boundary.

## Verification

- static test forbids chain mutation imports in route modules;
- transaction fault tests at every boundary;
- concurrent idempotency tests;
- chain timeout-after-submit and worker-crash tests;
- RLS/public projection leak matrix;
- restore and reconciliation test from actual backup artifacts.

## Rollback

Code can roll back through feature flags and a prior immutable release. Schema
changes use expand/migrate/contract compatibility. Confirmed chain commitments
are never rolled back; a correction/superseding event is appended.

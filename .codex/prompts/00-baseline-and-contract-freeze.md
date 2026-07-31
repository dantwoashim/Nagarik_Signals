# Wave 00: Baseline and Contract Freeze

## Objective

Produce an evidence-backed prototype baseline and freeze the semantic contracts
required by every later wave. Do not implement the production workflow yet.

## Required read-only agents

- `architecture_guard`
- `security_red_team`
- `test_reliability_engineer`
- `repository_inventory`

## Required artifacts

- `docs/production/baseline-audit.md`
- `docs/production/threat-model.md`
- `docs/production/architecture-contract.md`
- `docs/production/state-machines.md`
- `docs/production/api-contracts.md`
- `docs/production/release-criteria.md`
- `docs/production/execution-log.md`
- accepted ADRs for workflow authority, publication ordering, public/private
  projections, idempotency/outbox, v1/v2 protocol boundary, and operator
  identity/roles, plus the exact curated-pilot release profile and kill
  switches

## Contract decisions to freeze

- authoritative store and failure ordering;
- private submission and media lifecycle;
- moderation, version freeze, commitment, publication, correction, and removal;
- public and private DTO/projection boundaries;
- idempotency scope and duplicate-payload behavior;
- outbox leases, retries, dead letters, and reconciliation;
- v1 historical read compatibility and v2 production write semantics;
- operator identity, organization scope, roles, MFA policy, and audit context;
- proof component statuses and truth/availability boundaries;
- release labels and external human blockers.

## Gate

Wave 00 passes only when every later workstream can implement without inventing
a cross-system semantic decision. Confirmed defects must include evidence and a
planned regression test. Missing external review remains an explicit blocker.
Wave 00 acceptance means the contracts may be implemented; it does not change
the overall release decision from `NO_GO`.

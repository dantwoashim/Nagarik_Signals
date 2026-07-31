# Security Model

Nagarik Signal protects private civic intake, reviewed public evidence,
operator actions, and the consistency boundary between Postgres, object
storage, and Solana.

## Trust Boundaries

| Boundary                           | Security rule                                                             |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Browser to public API              | bounded reads, stable public DTOs, no private columns                     |
| Capability holder to private route | exact purpose, subject, organization, action, expiry, and keyed verifier  |
| Operator to workflow               | managed identity, AAL2, active membership, role and resource scope, audit |
| Application to Postgres            | transaction, expected version, idempotency, RLS, append-only invariants   |
| Application to object storage      | private objects, opaque IDs, purpose-bound proxy, reviewed derivative     |
| Worker to Solana                   | machine auth, bounded signer, frozen program and cluster, durable outbox  |
| Public proof to chain              | exact finalized account observation and canonical hash comparison         |

## Primary Controls

| Risk                               | Control                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cross-site mutation                | exact trusted origin and host policy, CSRF checks where applicable                                      |
| Token replay or enumeration        | random capabilities, separate purposes, keyed storage, one-time consumption, neutral misses             |
| Cross-organization access          | service authorization plus forced RLS on private tables                                                 |
| Submission published before review | private state machine and confirmation-gated public projection                                          |
| Source media exposed               | private storage and distinct approved derivative identity                                               |
| Image parser or metadata abuse     | decode, pixel and byte bounds, rotation, resize, re-encode, metadata removal                            |
| Duplicate or lost external writes  | transactional idempotency, durable FIFO outbox, lease and observation reconciliation                    |
| False proof success                | unavailable or mismatched bytes, fields, program, account, sequence, or hash fail closed                |
| History rewrite                    | immutable versions, append-only events, expected head and sequence checks                               |
| Signer misuse                      | no browser signer, non-mainnet ceiling, machine-only custody adapter, protocol roles and pause controls |
| Unsafe removal or restore          | immediate deny, tombstone, revocation/deletion ledger, isolated restore gate                            |
| Build or dependency leak           | exact runtime, locked installs, SAST, artifact and secret scan, audit, SBOM                             |

## Secret Separation

Capability derivation, capability verification, security correlation, cookies,
CSRF, worker authentication, database roles, object storage, managed auth, and
signer custody use separate credentials. Production validation rejects weak,
equal, placeholder, browser-exposed, filesystem, and legacy shared-secret
configurations.

## Residual Risk

- Human review can miss visible personal or harmful content.
- A capability can be shared by its holder until it expires or is revoked.
- A public commitment proves integrity and order, not real-world truth.
- Provider outages can delay media, database, auth, RPC, or worker operations.
- Safe operation depends on tested backup, restore, alerting, key governance,
  privacy/legal review, and named operators outside the codebase.
- Immutable public-chain commitments remain visible after application-level
  removal, so chain payload design must remain free of personal data.

The detailed abuse cases and verification requirements are in
[`production/threat-model.md`](production/threat-model.md) and
[`production/release-criteria.md`](production/release-criteria.md). Report
vulnerabilities through [`../SECURITY.md`](../SECURITY.md).

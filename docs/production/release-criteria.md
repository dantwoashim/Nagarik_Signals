# Production Release Criteria

Status: active gate specification  
Current decision: `NO_GO`  
Target profile: `curated_pilot_v2_non_mainnet`

## Decision rule

A release is `GO` only for the exact profile whose required criteria have
current, reviewable evidence. Missing, stale, failed, or unverifiable evidence
is a failed criterion.

Possible decisions:

- `GO`: every applicable automated and human gate passed for the named scope;
- `CONDITIONAL_NON_PRODUCTION`: explicitly limited pilot/demo profile with all
  unavailable production claims and risky features disabled;
- `NO_GO`: a required control failed, evidence is missing, or configuration
  exceeds the approved scope.

No report may use "zero issues." The defensible target is zero **known**
release defects after the defined review and test process.

## Release profiles

| Capability            | Prototype                                   | Curated pilot                       | Public beta              | Production                        |
| --------------------- | ------------------------------------------- | ----------------------------------- | ------------------------ | --------------------------------- |
| public approved reads | allowed with prototype/legacy labels        | allowed                             | allowed                  | allowed                           |
| intake                | dev/test only                               | invite capability only              | reviewed public intake   | approved scope                    |
| signals               | prototype label                             | invite capability only              | abuse-reviewed public    | approved scope                    |
| operator actions      | prototype shared-secret path not production | named AAL2 roles                    | named AAL2 roles         | named AAL2 roles                  |
| chain writes          | v1 devnet demonstration                     | v2 approved non-mainnet             | audited approved profile | audited approved profile          |
| mainnet               | prohibited                                  | prohibited                          | separate gate            | only if audit/governance approved |
| institutional claim   | prohibited                                  | named partner-approved wording only | legal/partner approved   | approved scope only               |
| sample/QA data        | clearly labelled                            | disabled in production namespace    | disabled                 | disabled                          |

The `curated_pilot_v2_non_mainnet` release has these validated static
invariants:

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

They are not runtime toggles. The seven supported capability ceilings are:

```text
publicReadEnabled
publicMediaEnabled
inviteIntakeEnabled
inviteSignalsEnabled
operatorMutationsEnabled
publicationEnabled
v2WritesEnabled
```

All seven static ceiling values are `true` in this release artifact. Every
database kill-switch row is initially `disabled=true`, and both provider-edge
public controls initially have `edgeKillSwitch=true`. Missing, unreadable,
duplicate, malformed, or wrong-policy switch
state means disabled and readiness false. Switches are cleared individually
only after their dependency gates pass.

Each capability is effective only when its static release ceiling is enabled,
its database kill switch is clear, and every dependency guard in
`architecture-contract.md` passes. A database setting can disable but cannot
enable beyond the static release. Kill-switch changes require an AAL2
`system_admin`, reason, idempotency, audit, and immediate cache invalidation.
Public reads/media additionally require a clear provider-edge disable switch;
either layer blocks delivery before cache lookup and triggers a verified CDN
purge.

Retired legacy mutation routes return `410 legacy_mutation_retired`. Temporarily
disabled supported mutations and disabled public reads return `503
feature_temporarily_unavailable` without private or dependency details. The
release manifest must contain the exact profile, static invariants/ceilings,
effective snapshot, and kill-switch policy version.

## Defect gate

| Criterion | Requirement                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `DEF-001` | Open P0 defects = 0                                                                                        |
| `DEF-002` | Open P1 defects = 0                                                                                        |
| `DEF-003` | Open P2 defects = 0                                                                                        |
| `DEF-004` | Open P3 defects affecting correctness, privacy, security, accessibility, operability, or public claims = 0 |
| `DEF-005` | Every confirmed defect has severity, owner, regression test, fix commit, and verification result           |
| `DEF-006` | Deferred work is an explicit non-defect enhancement and does not contradict release claims                 |

The baseline findings `B-001` through `B-017` in `threat-model.md` are open
until replacement behavior and regression evidence exist.

## Correctness and consistency gate

| ID        | Required evidence                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COR-001` | Every external mutation requires and persists scoped idempotency.                                                                                                                        |
| `COR-002` | Concurrent same-key requests create one logical result; changed payload conflicts.                                                                                                       |
| `COR-003` | No HTTP route or UI path writes to Solana before durable DB intent.                                                                                                                      |
| `COR-004` | DB failure, Blob failure, RPC failure, worker crash, and timeout-after-submit converge safely.                                                                                           |
| `COR-005` | Deterministic outbox/event IDs prevent duplicate logical chain events.                                                                                                                   |
| `COR-006` | Public projection and chain binding reconcile exactly.                                                                                                                                   |
| `COR-007` | Moderation, issue versions, status, handoff, audit, outbox attempts, and corrections are append-only for ordinary roles.                                                                 |
| `COR-008` | Dedupe and aggregates remain exact with a fixture well above prior 100-row limits.                                                                                                       |
| `COR-009` | Cursor pagination is stable under concurrent publication.                                                                                                                                |
| `COR-010` | No limited list query is reused for global correctness.                                                                                                                                  |
| `COR-011` | Stale version/head and invalid state transitions fail deterministically.                                                                                                                 |
| `COR-012` | Legacy import is repeatable, dry-runnable, checksum-reconciled, and cannot publish samples/QA/private rows.                                                                              |
| `COR-013` | Issue-global FIFO reservation is gapless across timeline/handoff; both heads and count are guarded; a dead letter freezes descendants and cannot be skipped/rebased/cancelled.           |
| `COR-014` | External callers supply only named database aggregate concurrency tokens; chain sequence/count/heads/IDs/payloads/hashes are reserved and derived server-side under the checkpoint lock. |

## Privacy, media, and authorization gate

| ID        | Required evidence                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRI-001` | Pending/rejected/withdrawn/expired/private content and all removed content fields are absent from public API, HTML, RSC payloads, caches, search, analytics, and source maps; a previously published removed ID exposes only the contracted neutral tombstone. |
| `PRI-002` | Orphan/rejected/expired/removed/wrong-capability/cross-org media is denied with neutral behavior.                                                                                                                                                              |
| `PRI-003` | Storage container is private and raw storage URLs never leave server infrastructure.                                                                                                                                                                           |
| `PRI-004` | Image stream/pixel/dimension/output limits, orientation, resize, deterministic re-encoding, metadata removal, and exact-byte hashing pass adversarial fixtures.                                                                                                |
| `PRI-005` | Private point never appears in public/chain/log/artifact; public geometry meets policy/property tests.                                                                                                                                                         |
| `PRI-006` | Raw tracking/intake/signal/auth tokens and raw session identifiers are absent from DB/logs/analytics/build artifacts.                                                                                                                                          |
| `PRI-007` | Managed individual operator auth, active organization scope, exact role checks, revocation, and AAL2 are enforced.                                                                                                                                             |
| `PRI-008` | RLS matrix passes for unauthenticated, tracking, moderator, steward, privacy reviewer, auditor, org admin, system admin, and service worker contexts.                                                                                                          |
| `PRI-009` | Old shared-secret headers/UI and session-wallet paths cannot authorize production actions.                                                                                                                                                                     |
| `PRI-010` | Retention jobs are bounded/idempotent; legal hold, deletion retry, and evidence pass.                                                                                                                                                                          |
| `PRI-011` | Withdrawal, correction, removal/tombstone, export/privacy-request, and urgent restriction runbooks are exercised.                                                                                                                                              |
| `PRI-012` | Deployment archive/container/source maps pass secret and private-data scans.                                                                                                                                                                                   |
| `PRI-013` | Private normalized media can never be directly public; a distinct derivative identity and explicit public-display decision are required even for equal bytes.                                                                                                  |
| `PRI-014` | Provider staging expiry, exact-hash durable promotion, staging/durable orphan inventory cleanup, and copy/DB/delete failure tests keep untracked or failed objects denied and bounded.                                                                         |

## Smart-contract and proof gate

| ID        | Required evidence                                                                                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOL-001` | v1 source, program ID, account meaning, and generated IDL are checksum-frozen and read-only.                                                                                                                                                                                                    |
| `SOL-002` | v2 has a distinct program ID and generated IDL.                                                                                                                                                                                                                                                 |
| `SOL-003` | v2 has no global issue counter, browser/session signer/funding, verification PDA/count, title, narrative, URL, exact location, personal data, receipt, or evidence bytes.                                                                                                                       |
| `SOL-004` | Compiled genesis authority, monotonic config/grant revisions, exact admin accounts/arguments/events, role/pause/two-step transfer, expected state/both-heads/count, terminal, and PDA constraints pass positive/negative tests.                                                                 |
| `SOL-005` | Replay, stale state, wrong PDA/program/authority, unauthorized, paused, terminal, and concurrency tests pass.                                                                                                                                                                                   |
| `SOL-006` | Account size/rent and compact bounds are asserted.                                                                                                                                                                                                                                              |
| `SOL-007` | Rust format, clippy with denied warnings, unit tests, and Anchor tests pass from a clean checkout.                                                                                                                                                                                              |
| `SOL-008` | TypeScript/Rust UUID/key/PDA/canonicalization/hash vectors match.                                                                                                                                                                                                                               |
| `SOL-009` | Generated IDL/program ID drift gate passes; no manual IDL copy is accepted as generation evidence.                                                                                                                                                                                              |
| `SOL-010` | Proof reports bytes, metadata, public location, chain, and availability independently and states the truth limitation.                                                                                                                                                                          |
| `SOL-011` | RPC errors/timeouts are not treated as absence; finalized reconciliation is proven.                                                                                                                                                                                                             |
| `SOL-012` | Mainnet configuration remains blocked without external audit and key-governance approval.                                                                                                                                                                                                       |
| `SOL-013` | At least two independently operated RPC providers agree on pinned genesis, finalized signature, expected program ownership, byte-identical immutable binding-event account, and the reported finalized current issue-account snapshot; disagreement or partial availability blocks publication. |

## API and workflow gate

| ID        | Required evidence                                                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API-001` | Versioned schemas, stable error envelope, body/content/origin limits, request IDs, and redacted errors are tested.                                                                                                                                       |
| `API-002` | Private submission returns `202` tracking; creates no public issue/chain intent.                                                                                                                                                                         |
| `API-003` | Approval freezes immutable version and outbox atomically; publication waits for finalized exact binding.                                                                                                                                                 |
| `API-004` | Public list/detail query public projection only and do not enumerate private states.                                                                                                                                                                     |
| `API-005` | Signals are invite-scoped/off-chain and cannot change lifecycle/proof/handoff/publication.                                                                                                                                                               |
| `API-006` | Native-v2 status/handoff and all removal decisions are AAL2, role-scoped, idempotent, expected-state, server-canonical, append-only, and audited.                                                                                                        |
| `API-007` | Handoff cycle, private/public sequence, sent/acknowledged evidence, append-only supersession, and non-resolution semantics pass.                                                                                                                         |
| `API-008` | Retired legacy routes return `410`; native-v2 operator routes targeting imported v1 return `409 legacy_read_only`; neither invokes v1 or creates an implicit v2 wrapper.                                                                                 |
| `API-009` | Worker/reconcile/retention routes require narrow machine identity and accept no arbitrary transaction/job/hash/signer input.                                                                                                                             |
| `API-010` | Public health/live/ready disclose no sensitive dependency details.                                                                                                                                                                                       |
| `API-011` | Membership/grant/policy/feature/dead-letter APIs and offline bootstrap/recovery enforce AAL2, exact scope/version/idempotency, no-last-admin, audit, and no arbitrary payload mutation.                                                                  |
| `API-012` | Privacy target organization binding and one-time export receipt issuance/lease/interrupted-stream/replay/expiry semantics pass.                                                                                                                          |
| `API-013` | Removal request, immediate denial, neutral tombstone, removed DTO/proof, and no-restore behavior pass for both native v2 and imported v1; v2 event/hash/FIFO mapping passes, while v1 reports `not_applicable_v1_legacy` and performs no chain mutation. |
| `API-014` | Public-source final-URL normalization, SSRF-safe redirect fetch, identity/checksum, duplicate/conflict/revision behavior, and committed provenance vectors pass.                                                                                         |
| `API-015` | Capability issuance/replay uses the exact grammar, domain/purpose/key-version/UUID formula, independent derivation/verifier keys, constant-time checks, bounded key retention, and cross-purpose/org/subject negative tests.                             |
| `API-016` | Proof identifies immutable version-binding and current issue accounts separately; selected superseded versions, provider disagreement, partial dimensions, and removal-safe responses pass.                                                              |

## UX and accessibility gate

| ID       | Required evidence                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `UX-001` | Intake says `Submit for review`, returns private tracking, and never implies instant publication.                                          |
| `UX-002` | `Signal` wording never implies unique citizen, identity, verification, truth, priority, or lifecycle.                                      |
| `UX-003` | UI distinguishes provenance, freshness, moderation, publication, lifecycle, handoff, official receipt, integrity, availability, and truth. |
| `UX-004` | Operator UI is authenticated, role-specific, split by task, and has no secret/manual hash input.                                           |
| `UX-005` | Pending, partial failure, retry, stale tab, offline, empty, correction, removal/tombstone, and unavailable-proof states work.              |
| `UX-006` | Keyboard, focus order, labels, errors, reduced motion, reflow, contrast, touch targets, and mobile flows meet WCAG 2.2 AA target.          |
| `UX-007` | Automated accessibility passes and manual keyboard/screen-reader checklist has named reviewer evidence.                                    |
| `UX-008` | No client props/bundle contains private/server-only fields.                                                                                |
| `UX-009` | English copy is localization-ready and critical safety meaning is not encoded only by color/icon/motion.                                   |

## Operations, recovery, and security gate

| ID        | Required evidence                                                                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-001` | Structured redacted logs use request/trace IDs and no forbidden fields.                                                                                                                                                                                                            |
| `OPS-002` | Metrics cover intake, moderation, publication, media, proof mismatch, auth/RLS, rate limits, outbox, RPC/DB/Blob, retention, backup/restore, and operator actions.                                                                                                                 |
| `OPS-003` | Alert delivery is tested, acknowledged, and owned.                                                                                                                                                                                                                                 |
| `OPS-004` | Minimal live/ready and authenticated diagnostics behave correctly for every unsafe configuration.                                                                                                                                                                                  |
| `OPS-005` | Database backup and approved evidence backup/export exist, are non-empty, checksummed, and restored in isolation.                                                                                                                                                                  |
| `OPS-006` | Restored environment remains isolated until every post-snapshot revocation/removal/deletion/tombstone ledger entry is replayed, storage is reconciled, and privacy, public projection, proof, binding, and RLS checks pass.                                                        |
| `OPS-007` | Code rollback, feature flags, expand/migrate/contract compatibility, chain correction, media removal, and key incident procedures are exercised.                                                                                                                                   |
| `OPS-008` | CSP, HSTS, content/security headers, cache policy, SSRF controls, and deployment bundle pass tests.                                                                                                                                                                                |
| `OPS-009` | Load smoke meets approved latency/error/backlog thresholds without correctness loss.                                                                                                                                                                                               |
| `OPS-010` | Dependency audit has zero critical/high/moderate findings under the approved policy, license review passes, and SBOM exists.                                                                                                                                                       |
| `OPS-011` | SAST, secret scan, lock/runtime/action pin checks, and least-privilege CI pass.                                                                                                                                                                                                    |
| `OPS-012` | Named humans own moderation, follow-up, security, privacy, recovery, and release decisions.                                                                                                                                                                                        |
| `OPS-013` | Static profile invariants, capability ceilings, database disable-only kill switches, independent public-read/media edge switches, dependency guards, verified cache purge, disabled-route semantics, and public-safe capability snapshot pass configuration and stale-cache tests. |

## Required clean CI matrix

Evidence must come from clean, deterministic jobs:

- exact Node runtime and `npm ci`;
- typecheck, lint, format, discovered unit/property tests;
- Postgres/Supabase empty migration, upgrade migration, constraints, RLS, query
  plan, and legacy import;
- API/media/DB/outbox/fault integration;
- Rust format, clippy, unit, Anchor v1/v2, account/PDA/hash vectors, and IDL
  drift;
- build plus client/deployment artifact scans;
- Playwright public/tracking/operator flows;
- automated accessibility plus manual checklist artifact;
- SAST, dependency/license audit, secret scan, SBOM;
- load smoke;
- backup/restore and rollback verification;
- release manifest verification;
- final clean worktree/generated-artifact drift assertion.

Retries may diagnose external flakiness but cannot hide a deterministic defect.
Tests do not target live civic data or mutate a shared production/devnet record.

## External human gate

Automation cannot mark these passed:

| ID        | Required evidence                                                       | Curated pilot                                                                                          | Production/mainnet               |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `EXT-001` | independent web/API penetration test and remediation                    | required before production claim                                                                       | required                         |
| `EXT-002` | independent Anchor audit                                                | `not-mainnet` may defer only for explicitly non-production low-stakes pilot                            | required                         |
| `EXT-003` | Nepal-specific privacy/legal review                                     | required before any real-person/private civic intake, including a pilot, and before a production claim | required                         |
| `EXT-004` | signer and upgrade/key custody governance                               | required for any operational v2 signer profile                                                         | required, independently reviewed |
| `EXT-005` | named operator partner acceptance and incident/privacy/restore tabletop | required for partner-operated pilot claim                                                              | required                         |

Exploit details and private legal material are referenced by restricted artifact
ID, not copied into the public release manifest.

## Canary and rollback thresholds

Exact thresholds are set from staging/load evidence before canary. A threshold
cannot be invented at release time. At minimum, automatic stop/rollback occurs
for:

- any private-data or authorization leak;
- any proof/chain/database mismatch;
- any duplicate logical event;
- any unknown signer operation or spend-policy breach;
- any dead letter affecting publication;
- failed alert delivery;
- failed restore/rollback evidence;
- schema/program/release-ID mismatch;
- error, latency, or backlog above the approved canary envelope.

Rollback disables intake, operator mutation, publication, and v2 writes
independently before redeploying a prior immutable code release.

## Release evidence manifest

`scripts/verify-release.ts` must produce a non-secret machine-readable manifest
containing:

- immutable release ID and 40-character Git commit;
- migration version/checksum;
- web build checksum;
- v1/v2 program IDs, clusters, IDL checksums, mode, and audit reference/status;
- results/artifact references for every test category;
- vulnerability counts;
- known defect counts;
- external gate references/status;
- exact feature flags;
- backup/restore and rollback evidence;
- final `GO`, `CONDITIONAL_NON_PRODUCTION`, or `NO_GO` decision.

The verifier fails on an absent criterion or artifact. It never converts
`blocked`, `not run`, `stale`, or `not applicable` without an approved profile
rule into `pass`.

## Current evaluation

| Gate                         | Status                                     | Evidence                                                                                                                                               |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| defect                       | blocked                                    | replacement behavior and regressions exist, but the independent known-defect review artifact is absent                                                 |
| correctness/consistency      | automated pass; hosted evidence pending    | transactional workflow, outbox, replay, reconciliation, projection, and database suites pass in clean CI                                               |
| privacy/authorization        | automated pass; external review blocked    | private-first intake, RLS, AAL2 roles, derivatives, immediate restriction, and terminal removal tests pass; `EXT-003` is absent                        |
| smart contract               | automated pass; audit/custody blocked      | v2 Rust tests and generated-IDL drift pass; independent audit, approved signer custody, and deployed-program evidence are absent                       |
| API/workflow                 | automated pass; hosted integration pending | v2 route, service, browser, and database integration suites pass; managed Supabase, Auth, Blob, RPC, and worker evidence is absent                     |
| UX/accessibility             | automated pass; manual review pending      | 26 desktop/mobile browser and accessibility checks pass; named manual keyboard and screen-reader evidence is absent                                    |
| operations/recovery/security | partial                                    | clean CI, source/dependency scans, SBOM, load/recovery tools, and runbooks exist; real load, restore, rollback, alert, and tabletop evidence is absent |
| external human               | blocked                                    | no approved penetration-test, legal, custody, audit, or operator evidence supplied                                                                     |

Evidence snapshot: [production execution log](execution-log.md), including
[Release CI run 30635040244](https://github.com/dantwoashim/Nagarik_Signals/actions/runs/30635040244).

Decision: `NO_GO` for production or a partner-operated pilot. The code-level
candidate is substantially implemented, but automation cannot supply the
missing operational and external approvals.

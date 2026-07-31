# Production Readiness Execution Log

This log records commands, evidence, decisions, blockers, and rollback impact.
An absent command result is not a passing result.

## 2026-07-31 - Baseline preservation and Wave 0 start

### Repository state

- Baseline commit:
  `237e8cd1c9c0b9ed3e504e52040a0f10e9a15d48`
- Baseline tag: `prototype-baseline`
- Working branch: `production-readiness`
- Original product plan checksum:
  `6E34DC321C7B23BCBCF0C9BAC29520A18AD1D66C750C189C3AF982F4F1550018`
- Production plan checksum:
  `66E499C606D76E9FE3E09315DD624A53E6D01456EFEC28A576DA829CA9818EEF`

The original checkout became read-only during local execution. The Git history,
branch, tag, tracked source, and Wave 0 uncommitted files were copied to an
isolated writable checkout. Local `.env*`, build output, `.anchor`, Playwright
output, and generated session keypairs are not part of the working source.
Fifteen copied ignored session-keypair files were deleted from the isolated
checkout before staging.

### Baseline commands

| Command                                                 | Result                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| `npm ci`                                                | exit 0; 488 packages installed                  |
| `npm audit --omit=dev --audit-level=moderate`           | failed; two high production dependency findings |
| full `npm audit`                                        | failed; eleven high findings, zero critical     |
| `npm run typecheck`                                     | exit 0                                          |
| `npm run lint`                                          | exit 0                                          |
| `npm run test:unit`                                     | exit 0; 30 tests passed                         |
| `npm run verify:data`                                   | exit 0                                          |
| `npm run build`                                         | exit 0                                          |
| `npm run test:e2e`                                      | exit 0; 10 tests passed                         |
| `cargo fmt --all -- --check`                            | failed on frozen-v1 formatting                  |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit 0                                          |
| `cargo test --workspace --all-targets --all-features`   | failed in Anchor program-path safety expansion  |
| `cargo test --workspace`                                | exit 0; 2 tests passed                          |

See `baseline-audit.md` for why passing prototype checks do not satisfy the
production risk matrix.

### Contract review

The initial read-only review covered architecture, security, testing, and
repository inventory. Confirmed findings were consolidated in
`baseline-audit.md` before the contracts were frozen. This is implementation
acceptance only; it is not an external security, legal, program-audit, or
production-release approval.

Direct validation passed for all fenced JSON examples, all 13 automation TOML
files, relative documentation links, v1 program/IDL identity, protocol account
size arithmetic, stale markers, immutable plan checksums, and diff hygiene.

### Decisions frozen in this step

- curated invite-only pilot is the first target profile;
- Postgres is authoritative for workflow;
- moderation, immutable version, and required chain confirmation precede public
  visibility;
- public/private projections are separate types and database paths;
- every external mutation reserves durable idempotency and side-effect intent;
- v1 is frozen historical read/proof; v2 is a separate program;
- individual managed-auth operators and AAL2 replace shared secrets;
- browser/session wallets and relayer funding are absent from v2;
- signals are off-chain and cannot change lifecycle;
- media access begins denied and raw storage URLs are never public.
- attached media uses durable-private promotion before review;
- every public media artifact is a distinct reviewed derivative bound by a
  one-time purpose/target receipt;
- imported v1 records remain read-only except database-only terminal privacy
  tombstoning with no chain mutation or implicit v2 wrapper.

### Current blockers

- Dependency audit is not green.
- Production database/auth/media/v2/worker paths do not exist.
- All production test, recovery, and operations evidence remains absent.
- All external human gates remain unresolved.

### Rollback impact

Wave 0 adds documentation and orchestration only. It changes no runtime
behavior. Rollback is removal of the Wave 0 commit; the
`prototype-baseline` tag remains the immutable source reference.

## 2026-07-31 - Wave 1 runtime and configuration foundation

### Changes

- pinned Node `22.23.1`, npm compatibility, and Rust `1.94.0`;
- upgraded Next/ESLint to patched current releases and replaced the vulnerable
  preset dependency chain with official flat plugins;
- added strict server/client environment schemas, production startup
  validation, independent-secret checks, frozen profile invariants, and legacy
  secret rejection;
- added private Supabase client factories and a local Supabase configuration;
- changed unit tests from a hard-coded list to repository discovery;
- added scoped deterministic formatting and complete dependency audit scripts.

### Verified evidence

The official Node `22.23.1` Windows archive was downloaded from `nodejs.org`
and matched SHA-256
`7DF0BC9375723F4A86B3AA1B7CC73342423D9677A8DF4538ACA31A049E309C29`.
Under that exact runtime:

| Command                            | Result                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `npm ci`                           | exit 0; 332 packages installed                       |
| `npm run format:check`             | exit 0                                               |
| `npm run typecheck`                | exit 0                                               |
| `npm run lint`                     | exit 0                                               |
| `npm run test:unit`                | exit 0; 37 tests passed                              |
| `npm audit --audit-level=moderate` | exit 0; zero vulnerabilities                         |
| `npm run build`                    | exit 0; Next 16.2.12 production build                |
| `npx supabase --version`           | exit 0; 2.110.0                                      |
| `npx supabase status`              | blocked before startup; Docker and Podman are absent |

The seven new environment tests prove exact-profile acceptance and rejection
of missing production dependencies, shared legacy secrets, duplicate secret
material, default public Solana clusters, and real civic data without an
`EXT-003` evidence reference.

### Remaining boundary

The Supabase configuration parses, but local empty/upgrade migration and RLS
execution require a Postgres runtime. No database gate is represented as
passing until that runtime exists and the Wave 2 tests execute.

## 2026-07-31 - Wave 2 database and operator authorization foundation

### Changes

- added ordered legacy-archive, production-core, and access/transaction
  migrations;
- added 33 private workflow tables, three public projection tables, constraints,
  indexes, immutable triggers, seven fail-closed capability switches, and RLS;
- added atomic idempotency reservation/completion, one-time capability
  consumption, FIFO outbox leasing, and no-last-admin protection;
- added managed Supabase cookie sessions and explicit AAL2 operator-role checks;
- added a production proxy that returns `410` for every legacy mutation route;
- removed the unused browser-local pseudo-session and made the remaining
  legacy development session unavailable in production;
- added server-only Postgres access and separate public, submission, and outbox
  repositories;
- added a deterministic, transaction-only legacy importer with dry-run default,
  canonical checksums, explicit organization binding, and no-op reruns.

### Verified evidence

All commands below ran under the pinned Node `22.23.1` runtime.

| Command                                                                 | Result                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run db:test`                                                       | exit 0; 10 migration, RLS, transaction, plan, and import tests passed |
| `npm run legacy:import -- --source=data/read-model/nagarik-signal.json` | exit 0; dry-run only                                                  |
| `npm run typecheck`                                                     | exit 0                                                                |
| `npm run lint`                                                          | exit 0                                                                |
| `npm run test:unit`                                                     | exit 0; 38 tests passed                                               |
| `npm audit --audit-level=moderate`                                      | exit 0; zero vulnerabilities                                          |
| `npm run build`                                                         | exit 0; Next 16.2.12 production build                                 |

The import dry-run read 41 legacy records. Four `public_source` records are
eligible; seven `qa_fixture` and 30 `illustrative_sample` records are excluded.
Its canonical source SHA-256 is
`2a661ea7ed10d9d78e242c8fdb0a6e0bbae2807e68a27540647407e86de33538`;
the deterministic eligible issue-set SHA-256 is
`3ee266004d7d49ff709f7980727f3a84d00bb2d4fd40e19b7a423fb773dff487`.
No import was committed to an external database.

The database suite executes the exact numbered SQL migrations in PGlite's
PostgreSQL runtime. It proves clean install, prototype-table upgrade/archive,
all switches initially disabled, anonymous fail-closed projection access,
private table denial, append-only revisions, idempotency conflict behavior,
single-use capabilities, last-admin protection, per-issue FIFO outbox claims,
cross-organization/role RLS, deterministic import/no-op rerun, and index-backed
public pagination.

### Remaining boundary

Docker and Podman are still absent, so Supabase CLI reset, Supabase Auth network
integration, and hosted Postgres execution have not run locally. PGlite evidence
does not replace those release gates. Legacy JSON read routes remain available
for frozen v1 compatibility; their mutations are blocked in production and
will be replaced by v2 services in later waves.

## 2026-07-31 - Wave 3 private intake and media boundary

### Changes

- added strict streamed body limits and deterministic `image-v2` JPEG/WebP
  normalization with decode, pixel, dimension, output, animation, MIME, and
  metadata controls;
- added purpose-bound intake, upload-receipt, and private-tracking capabilities
  whose raw token material is never persisted;
- added idempotent private upload and submission services with pilot/ward
  validation, Nepal civic-date validation, exact-to-coarse location handling,
  one-time receipt consumption, and zero public or chain writes at intake;
- added durable-private media promotion through the leased outbox, with source
  and destination integrity verification, bounded retries, dead-letter state,
  and staging cleanup;
- replaced production filename media access with opaque media IDs, fail-closed
  publication checks, bound tracking or AAL2 operator authorization, safe
  content headers, and neutral denial;
- added bounded, authenticated media-retention cleanup and audit events;
- serialized first-use idempotency reservations with a transaction advisory
  lock.

### Verified evidence

All commands below ran under the pinned Node `22.23.1` runtime.

| Command                    | Result                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| `npm run verify`           | exit 0; formatting, typecheck, lint, and 56 unit tests passed         |
| `npm run db:test`          | exit 0; 10 migration, RLS, transaction, plan, and import tests passed |
| `npm run audit:production` | exit 0; zero vulnerabilities                                          |
| `npm run build`            | exit 0; Next 16.2.12 production build                                 |
| `git diff --check`         | exit 0                                                                |

The integration tests prove deterministic upload replay, changed-payload
conflict, one-time media receipt consumption, private-only submission, no raw
capability persistence, zero public issue/projection rows, durable promotion
with byte-level verification, staging deletion, negative media access states,
and idempotent retention with an audit trail.

Both governing documents remain unchanged. Their SHA-256 values are
`66E499C606D76E9FE3E09315DD624A53E6D01456EFEC28A576DA829CA9818EEF`
and
`6E34DC321C7B23BCBCF0C9BAC29520A18AD1D66C750C189C3AF982F4F1550018`.

### Remaining boundary

The local database proof uses PGlite. Supabase CLI reset, managed Auth
integration, real private Blob behavior, and concurrent multi-connection
Postgres execution still require an external runtime. Human moderation and
public derivative creation are implemented in the later workflow wave; until
then all new submissions remain private.

## 2026-07-31 - Wave 4 Solana v2 write path and durable chain outbox

### Changes

- added the frozen v2 Anchor state and instruction set for issue creation,
  metadata versions, lifecycle changes, handoff checkpoints, and publication
  removal;
- added deterministic operation/event IDs, PDA vectors, optimistic sequence and
  head checks, terminal publication rules, and replay-safe event accounts;
- added the typed chain-job envelope, bounded signer interface, exact
  observation matching, leased FIFO outbox worker, submitted-unknown recovery,
  dead-letter handling, and reconciliation;
- added durable issue-chain bindings with cluster, genesis hash, program,
  accounts, signature, finalized slot, and account checksum;
- separated the frozen v1 read profile from v2 writes and added generated-IDL
  drift verification.

### Verified evidence

| Command                                                 | Result                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run verify`                                        | exit 0; 66 unit tests passed                                 |
| `npm run db:test`                                       | exit 0; 10 database tests passed                             |
| `cargo fmt --all -- --check`                            | exit 0                                                       |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit 0                                                       |
| `cargo test --workspace`                                | exit 0; 9 Rust tests passed                                  |
| `npm run anchor:idl:check`                              | exit 0; generated v2 IDL matched the committed profile       |
| local validator v1/v2 transport suite                   | exit 0; both profiles and bounded finalized transport passed |

The validator was stopped after the bounded transport run. The production
custody adapter still fails closed with
`chain_custody_adapter_unconfigured`; no local key fallback is permitted in
the production profile.

## 2026-07-31 - Wave 5 moderated publication and invited civic workflow

### Changes

- added explicit submission, lifecycle, and handoff state machines;
- added AAL2 organization-scoped operator routes and transactional,
  idempotent, append-only services for moderation, lifecycle, handoff,
  correction, removal, and public signals;
- replaced legacy shared-secret mutation routes with stable `410` responses;
- added distinct `approved_private` source and `redacted_derivative` child
  media handling, deterministic `public-derivative-v1` rendering, bounded
  reviewed redaction rectangles, one-time purpose-bound media receipts, and
  receipt consumption during approval;
- added confirmation-gated public issue, media, event, and proof projections;
  pending content remains private and removal produces a neutral tombstone;
- made a finalized publication recoverable while the publication kill switch
  is disabled instead of leaving a confirmed outbox job stranded;
- added curated pilot invitation issuance and one-time consumption into
  separate intake and signal capabilities without storing raw tokens;
- added off-chain attention signal creation, retraction, reactivation, and
  aggregate updates without changing lifecycle, proof, or chain state;
- added cursor-based public issue list/detail, versioned proof, signal, and
  intake-session APIs;
- removed caller-selected media hashes from correction and handoff paths.
  Corrections currently retain the approved derivative; handoff delivery and
  acknowledgment use reviewed external references.

### Verified evidence

These Wave 5 commands ran under the machine's current Node `25.2.1` runtime.
The exact Node `22.23.1` release gate remains separate and pending.

| Command            | Result                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| `npm run verify`   | exit 0; formatting, typecheck, lint, and 73 unit tests passed               |
| `npm run db:test`  | exit 0; 10 migration, RLS, import, transaction, and query-plan tests passed |
| `git diff --check` | exit 0                                                                      |

The workflow integration uses the real Sharp transform and PGlite migrations.
It proves private-source preservation, distinct derivative identity and hash,
one-time receipt consumption, no public row before exact finalized binding,
kill-switch defer/recovery, lifecycle ordering, neutral signal semantics,
handoff independence, immutable correction, and removal tombstoning. The
invitation integration proves deterministic authorized replay, separate
purpose tokens, single consumption, expiry binding, and no raw token
persistence.

Both governing documents remain unchanged. Their SHA-256 values are
`66E499C606D76E9FE3E09315DD624A53E6D01456EFEC28A576DA829CA9818EEF`
and
`6E34DC321C7B23BCBCF0C9BAC29520A18AD1D66C750C189C3AF982F4F1550018`.

### Remaining boundary

PGlite does not replace hosted Postgres, Supabase Auth, private Vercel Blob, or
concurrent multi-connection execution. The proof API recomputes canonical
metadata, location, and delivered-media hashes and reports the recorded exact
finalized binding; a fresh independent RPC account read is still a release
gate. Operator-media receipts currently cover initial publication. New media
for correction, status, or handoff remains denied until its separate upload
and purpose-bound receipt flow is implemented.

## 2026-07-31 - Waves 6 and 7 release controls and recovery evidence

### Changes

- expanded clean-source CI to cover the exact Node runtime, formatting,
  typecheck, lint, unit and operational tests, database migrations and RLS,
  browser integration and accessibility, production build, dependency and
  source scans, SBOM generation, Rust format/clippy/tests, and generated-IDL
  drift;
- corrected readiness to read the authoritative capability switch table and
  added an AAL2, versioned, idempotent, audited system-admin switch endpoint;
- made privacy removal deny public record, proof, and media access immediately,
  with finalized v2 tombstoning and terminal database-only handling for frozen
  v1 imports;
- added a measured read-only load-smoke runner and fail-closed backup/restore
  and rollback evidence verifiers;
- added incident, privacy, signer-key, dependency-outage, backup/restore,
  release-rollback, and operator-tabletop runbooks.

### Verified evidence

GitHub [Release CI run 30635040244](https://github.com/dantwoashim/Nagarik_Signals/actions/runs/30635040244)
completed successfully at commit
`16562034257f167a4b06c1728d1d512f9f49129b`. GitHub
[Security run 30635041177](https://github.com/dantwoashim/Nagarik_Signals/actions/runs/30635041177)
also completed successfully.

| Gate                                              | Result                                 |
| ------------------------------------------------- | -------------------------------------- |
| exact runtime, format, typecheck, lint            | passed under Node `22.23.1`            |
| unit tests                                        | 76 passed, 0 failed                    |
| operational verifier tests                        | 5 passed, 0 failed                     |
| database migration/RLS/integration tests          | 11 passed, 0 failed                    |
| browser integration and accessibility             | 26 passed, 0 failed                    |
| production build and tracked/client artifact scan | passed                                 |
| production dependency audit and CycloneDX SBOM    | passed; zero production audit findings |
| Rust format, clippy, and tests                    | passed; 9 Rust tests                   |
| generated v2 IDL drift                            | passed                                 |

The two governing plans remain unchanged. Their SHA-256 values are
`66E499C606D76E9FE3E09315DD624A53E6D01456EFEC28A576DA829CA9818EEF`
and
`6E34DC321C7B23BCBCF0C9BAC29520A18AD1D66C750C189C3AF982F4F1550018`.

### Evidence boundary and decision

The load runner and recovery verifiers pass their automated tests. A real
staging load run with approved thresholds, isolated backup/restore drill, and
release rollback drill have not been performed, so their release artifacts are
absent. The known-defect review artifact and every external human gate also
remain absent. The release manifest therefore remains `NO_GO`; test success is
not represented as operational or production approval.

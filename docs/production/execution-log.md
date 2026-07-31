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

The original checkout became read-only under the execution sandbox. The Git
history, branch, tag, tracked source, and Wave 0 uncommitted files were copied
to an isolated writable checkout. Local `.env*`, build output, `.anchor`,
Playwright output, and generated session keypairs are not part of the working
source. Fifteen copied ignored session-keypair files were deleted from the
isolated checkout before staging.

### Baseline commands

| Command | Result |
|---|---|
| `npm ci` | exit 0; 488 packages installed |
| `npm audit --omit=dev --audit-level=moderate` | failed; two high production dependency findings |
| full `npm audit` | failed; eleven high findings, zero critical |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run test:unit` | exit 0; 30 tests passed |
| `npm run verify:data` | exit 0 |
| `npm run build` | exit 0 |
| `npm run test:e2e` | exit 0; 10 tests passed |
| `cargo fmt --all -- --check` | failed on frozen-v1 formatting |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit 0 |
| `cargo test --workspace --all-targets --all-features` | failed in Anchor program-path safety expansion |
| `cargo test --workspace` | exit 0; 2 tests passed |

See `baseline-audit.md` for why passing prototype checks do not satisfy the
production risk matrix.

### Read-only audit workstreams

Four initial read-only workstreams reviewed architecture, security, testing,
and repository inventory. Their confirmed findings were converged into
`baseline-audit.md`; no implementation was delegated before contract freeze.

A second read-only review round was started against the written contracts and
then stopped before a final verdict at the user's request to proceed without
subagents. The integration owner completed the contract consistency pass
directly. This is Wave 0 implementation acceptance only; it is not an external
security, legal, program-audit, or production-release approval.

Direct validation passed for all fenced JSON examples, all 13 agent TOML
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

| Command | Result |
|---|---|
| `npm ci` | exit 0; 332 packages installed |
| `npm run format:check` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run test:unit` | exit 0; 37 tests passed |
| `npm audit --audit-level=moderate` | exit 0; zero vulnerabilities |
| `npm run build` | exit 0; Next 16.2.12 production build |
| `npx supabase --version` | exit 0; 2.110.0 |
| `npx supabase status` | blocked before startup; Docker and Podman are absent |

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

| Command | Result |
|---|---|
| `npm run db:test` | exit 0; 10 migration, RLS, transaction, plan, and import tests passed |
| `npm run legacy:import -- --source=data/read-model/nagarik-signal.json` | exit 0; dry-run only |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run test:unit` | exit 0; 38 tests passed |
| `npm audit --audit-level=moderate` | exit 0; zero vulnerabilities |
| `npm run build` | exit 0; Next 16.2.12 production build |

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

| Command | Result |
|---|---|
| `npm run verify` | exit 0; formatting, typecheck, lint, and 56 unit tests passed |
| `npm run db:test` | exit 0; 10 migration, RLS, transaction, plan, and import tests passed |
| `npm run audit:production` | exit 0; zero vulnerabilities |
| `npm run build` | exit 0; Next 16.2.12 production build |
| `git diff --check` | exit 0 |

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

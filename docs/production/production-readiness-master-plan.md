# Nagarik Signal — Production-Readiness Master Plan

**Repository reviewed:** `Nagarik_Signals-main`  
**Plan type:** engineering, security, privacy, operations, migration, release, and Codex multi-agent execution program  
**Target:** zero **known** release defects under explicit acceptance criteria, plus independent human review gates

---

## 1. The first honest decision

A literal guarantee of “zero issues” is not available in software. Any person or agent claiming otherwise is selling confidence, not engineering. The defensible target is:

> **Zero known release defects at release decision time, after the agreed tests, threat-model review, independent penetration test, independent smart-contract audit for mainnet, legal/privacy review, recovery drill, and controlled canary evidence.**

“Production ready” must also describe a particular operating profile. The fastest credible profile for Nagarik Signal is **a curated, partner-operated release with moderated intake**, not unrestricted anonymous nationwide reporting. Open public intake, mainnet writes, and institutional claims remain disabled until their additional gates pass.

### What can be presented immediately

The current system can be presented as a strong **devnet prototype with unusually good integrity boundaries**. It cannot honestly be presented tomorrow as a complete production system. Do not hide this. Show the working proof, state the production architecture, and explain that the release program deliberately replaces the unsafe parts instead of polishing them.

### Release labels

| Label | Meaning | Allowed claims |
|---|---|---|
| Prototype | Existing devnet demonstration and legacy records | Working proof-of-concept; not production; no official workflow claim |
| Curated pilot | Named organization, individual operators, moderation before publication, non-mainnet or audited network profile | Controlled operational pilot under stated scope |
| Public beta | Public intake with privacy/legal review, mature moderation, incident ownership, recovery and abuse controls | Public beta; explicit limitations and SLOs |
| Production | All release gates, independent audits, key governance, recovery, monitoring, named operators, legal approval | Production for the specifically approved scope only |

---

## 2. Critical-path architecture

The production architecture should be deliberately boring around the blockchain:

```text
Citizen/browser
    |
    | private staged upload + validated submission
    v
Next.js API / domain services
    |
    | one database transaction
    v
Postgres/Supabase
  - private submission
  - media lifecycle
  - moderation/audit
  - immutable public versions
  - idempotency
  - chain outbox
    |
    | approved worker lease
    v
Bounded signing/chain worker ----> Solana v2 commitment program
    |                                  |
    | confirmation/reconciliation      | compact hashes/events only
    v                                  v
Published public projection <---- proof verifier
    |
    +--> approved private Blob media through same-origin authorization proxy
```

### Architectural rules

1. **Postgres is authoritative for workflow.** Solana is a public independent commitment/checkpoint layer.
2. **Moderation precedes publication.** Submission is private; approval freezes a public version; chain confirmation precedes public visibility when a commitment is required.
3. **Every side effect begins with durable intent.** Reserve idempotency and write outbox state in the same database transaction as the requested transition.
4. **Public and private projections are separate.** Public code cannot accidentally query a full private row.
5. **Media is deny-by-default.** A storage object is never public merely because its URL is known.
6. **Signals are not verification.** They remain off-chain attention/corroboration signals and never change lifecycle state.
7. **v1 is historical. v2 carries production semantics.** Do not mutate the meaning of the deployed v1 program or its IDL.
8. **The platform never funds anonymous session wallets.** Only a bounded service signing path performs approved v2 protocol operations.
9. **Proof is versioned.** v1 proof remains verifiable; v2 canonical metadata removes storage URLs and uses immutable version IDs.
10. **Availability and integrity are separate.** Backups, retention, exports, and restore tests are required in addition to chain hashes.

---

## 3. Production definition of done

The release decision is `GO` only when every item below has evidence.

### 3.1 Defect gate

- Open P0 defects: **0**.
- Open P1 defects: **0**.
- Open P2 defects: **0**.
- Open P3 defects affecting correctness, privacy, accessibility, operability, or public claims: **0**.
- Feature ideas and explicitly deferred non-defect enhancements may remain, but must not be disguised defects.
- Every discovered defect has a regression test and a linked fix commit.

### 3.2 Correctness and consistency gate

- Every external mutation is idempotent.
- Chain timeout-after-submit, worker crash, DB outage, Blob outage, and RPC outage converge safely.
- No chain-first route remains.
- No limited-list query is reused for global correctness or aggregate results.
- Public projection and chain binding are reconcilable.
- Status, handoff, moderation, issue versions, and audit history are append-only under ordinary roles.

### 3.3 Privacy and authorization gate

- No pending/rejected/removed/private text, media, exact location, moderator note, operator secret, raw session, raw tracking token, service key, or raw Blob URL is available through public API, HTML, source map, logs, analytics, error response, cache, or deployment artifact.
- Individual operator authentication and role checks are active.
- Privileged roles have an enforced MFA policy.
- RLS tests pass for unauthenticated, tracking capability, moderator, steward, auditor, organization admin, and service roles.
- Takedown, correction, withdrawal, and privacy-request runbooks are tested.

### 3.4 Smart-contract gate

- v1 remains read-only and accurately labelled legacy.
- v2 has a distinct program ID and generated IDL.
- No global issue counter; no browser-session verification; no citizen funding.
- Deterministic event identifiers and expected-state checks make retries safe.
- Rust format, clippy with warnings denied, unit tests, Anchor positive/negative tests, account-size/rent checks, IDL drift checks, and TypeScript/Rust PDA vectors pass.
- Mainnet remains `NO-GO` until independent human audit and key-governance approval exist.

### 3.5 Operational gate

- Structured logs and request/trace IDs are redacted.
- Monitoring covers submission, moderation, publication, media, proof mismatch, outbox age/retries/dead letters, RPC, DB, Blob, rate limits, auth failures, and operator actions.
- Alert delivery is tested.
- Database restore and evidence restore/export are tested from actual backup artifacts.
- Rollback is tested.
- A named human owns moderation, official follow-up, security incidents, privacy requests, and release decisions.

### 3.6 External human gate

Codex and automated tests cannot satisfy these:

- independent web/API penetration test;
- independent Anchor program audit for mainnet or high-stakes deployment;
- Nepal-specific privacy/legal review of collection, publication, storage, retention, removal, government sharing, and blockchain use;
- key custody and upgrade-authority governance review;
- operating partner acceptance and incident tabletop.

---

## 4. State machines to freeze before coding

### 4.1 Submission state

```text
received -> under_review -> changes_requested -> under_review
                       \-> approved
                       \-> rejected
received/under_review/changes_requested -> withdrawn
received/changes_requested -> expired
```

A submission is private in every state. `approved` means moderation approved the material; it does not yet mean publicly committed or published.

### 4.2 Media state

```text
staged -> quarantined -> approved_private -> approved_public
      \-> rejected
      \-> expired -> deleted
approved_private -> redacted_derivative -> approved_public
approved_public -> removed -> deleted/retained_per_policy
```

An object without a valid DB record is denied. A staged object is visible only to the bound tracking capability or an authorized operator. A public issue references an approved public derivative, not the raw original.

### 4.3 Publication state

```text
not_published -> commit_pending -> published -> superseded
                            \-> commit_failed/retry
published -> removed
```

Public visibility requires an approved current public version and, for commitment-required records, a confirmed v2 binding. Removal produces a neutral tombstone and immutable removal/correction history without exposing the removed content.

### 4.4 Lifecycle state

```text
open -> in_progress -> resolved -> closed
open/in_progress/resolved -> disputed
 disputed -> open | in_progress | resolved | closed
open/in_progress -> closed
```

Rejection is not a lifecycle state; it is a moderation/submission outcome. Public signals never transition this state.

### 4.5 Handoff state

```text
prepared -> sent -> acknowledged -> closed
action may be recorded separately without equating it to issue resolution
prepared/sent -> failed
sent/acknowledged -> superseded by a new append-only event if corrected
```

`Acknowledged` requires the configured official reference or receipt. A platform-generated event cannot manufacture official receipt.

### 4.6 Outbox state

```text
pending -> leased -> submitted -> confirmed
    |        |          |
    +------> retry <----+
retry -> pending | dead_letter
confirmed is terminal except explicit reconciliation annotation
```

Leases expire safely. A retry first checks whether the deterministic on-chain account/event already contains the intended commitment.

---

## 5. Exact execution order

The program is ordered by dependency gates, not optimistic calendar estimates.

### Wave 0 — freeze facts and contracts

1. Initialize Git if the ZIP has no `.git` directory.
2. Commit the untouched source and tag `prototype-baseline`.
3. Add root and nested `AGENTS.md`, `.codex` custom agents, structured report schema, and prompts.
4. Run four read-only agents: architecture, security, testing, inventory.
5. Reproduce/document every known blocker and look for additional ones.
6. Write ADRs, threat model, state machines, API contracts, data classification, and release criteria.
7. Do not permit implementation until public/private projections, ordering, idempotency, v1/v2 boundary, and operator roles are signed off.

**Gate:** all workstreams can implement without inventing a cross-system semantic decision.

### Wave 1 — dependency, toolchain, environment, and test skeleton

1. Assign one dependency custodian.
2. Pin Node and Rust toolchains.
3. Add only required DB/auth/validation/testing/observability dependencies.
4. Create complete scripts and clean-install gate.
5. Create strict environment schema and production-fail-closed tests.
6. Add Supabase local skeleton and CI service definitions.
7. Do not combine broad framework upgrades with product migration.

**Gate:** clean install and existing baseline checks run; unsafe production configuration fails before serving requests.

### Wave 2 — database and individual operator authorization

1. Implement numbered migrations, constraints, indexes, RLS, immutable triggers, and transactional functions.
2. Split repositories by aggregate and public/private projection.
3. Create deterministic legacy import with dry-run and checksums.
4. Integrate managed operator auth, organization membership, roles, and MFA policy.
5. Eliminate durable raw session IDs and shared-secret browser administration.
6. Run empty DB, upgrade DB, RLS role matrix, query-plan, and import tests.

**Gate:** the database can safely hold all new workflow state and public users cannot read any private class.

### Wave 3 — media and private submission

1. Replace raw upload URL flow with staged media rows and opaque IDs.
2. Stream-limit uploads; decode, rotate, actually resize, re-encode, strip metadata, hash, and record dimensions.
3. Add one-time, purpose/session-bound receipt consumption.
4. Deny orphan/rejected/expired/wrong-session media.
5. Add human moderation/redaction states and retention cleanup.
6. Change report POST to private submission returning `202` plus tracking capability.
7. Strictly validate category, Nepal/pilot bounds, ward, ward-point relationship, and public coarse location.
8. Run adversarial media and idempotency tests.

**Gate:** a malicious or accidental submission cannot become publicly readable, and abandoned uploads cannot be retrieved by URL possession alone.

### Wave 4 — Solana v2 and chain outbox

1. Freeze v1 code and IDL for historical read/proof.
2. Create separate v2 program and new ID.
3. Remove global issue counter and verification accounts/status logic.
4. Derive issues/events from deterministic 32-byte keys/event IDs.
5. Add protocol config, role controls, pause, authority transfer, expected-state checks, immutable events, and compact commitments.
6. Implement DB outbox worker, bounded signer, confirmation, timeout-after-submit detection, dead-letter, and reconciliation.
7. Remove session wallet funding and sweep runtime.
8. Run local-validator, replay, stale-state, wrong-PDA, unauthorized, terminal-state, crash, and retry tests.

**Gate:** every chain mutation starts as durable DB intent and converges to exactly one logical on-chain event.

### Wave 5 — moderation, publication, status, handoff, signals, proof, and public APIs

1. Implement domain services before routes.
2. Approval freezes immutable public version and schedules v2 commit.
3. Publish only after confirmed binding.
4. Add neutral tombstone/removal and correction history.
5. Replace verification endpoint with off-chain signal endpoint.
6. Make proof explicitly versioned and independently report bytes, metadata, chain, availability, and truth limitation.
7. Make status/handoff operator-only, server-canonical, append-only, idempotent, and checkpointed.
8. Replace dashboard/list scans with exact indexed aggregates and cursor pagination.
9. Disable unsafe legacy mutations.

**Gate:** public API exposes only approved projection; every operator mutation is authenticated, authorized, transactional, idempotent, auditable, and recoverable.

### Wave 6 — production UX and accessibility

1. Change `Publish report` to `Submit for review`.
2. Provide private tracking instead of immediate public issue link.
3. Replace `Verify`/`Verified` with `Signal` and integrity language.
4. Build authenticated operator queues and split the monolithic steward console.
5. Remove secret and manual hash inputs.
6. Display precise distinctions among provenance, source freshness, lifecycle, handoff, official receipt, integrity, and truth.
7. Add tombstone, correction, partial-failure, offline, empty, retry, and stale-data states.
8. Meet WCAG 2.2 AA target and localization readiness.

**Gate:** no UI text overclaims; all critical flows work with keyboard/mobile/screen reader and do not serialize private fields.

### Wave 7 — hardening, tests, operations, and red-team loop

1. Split health/live/ready/private diagnostics.
2. Add structured redacted telemetry, metrics, alerts, runbooks, retention jobs, and bounded workers.
3. Harden CSP/HSTS/security headers and deployment bundles.
4. Add DB/Blob backup and actual restore tests.
5. Expand CI across Node, Postgres, Rust, Anchor, SAST, secret scan, dependency audits, SBOM, integration, Playwright, accessibility, load smoke, and release verification.
6. Run independent Codex red-team review; fix every confirmed release defect and add regression tests.
7. Repeat review after fixes.

**Gate:** automated evidence shows zero known release defects under the defined scope; missing human gates remain explicit blockers.

### Wave 8 — migration, canary, external review, and release decision

1. Dry-run and import legacy JSON; compare counts/checksums/proof bindings.
2. Preserve v1 records as legacy and never reinterpret their status as unique-person verification.
3. Reconcile media availability and chain bindings.
4. Exercise full staging path and failure/recovery paths.
5. Deploy behind feature flags with legacy mutations off and public intake restricted.
6. Run canary against predefined error/rollback thresholds.
7. Complete human penetration test, contract audit where applicable, legal/privacy review, key governance review, restore drill, and operator tabletop.
8. Generate immutable release evidence manifest.
9. `GO` only if every required gate passes; otherwise issue an honest `NO-GO` or explicitly non-production conditional pilot profile.

---

## 6. Fast parallelism without quality loss

### Safe parallel work

- Read-only architecture/security/test/inventory audits.
- Database migrations/repositories and Solana v2 program after commitment contracts freeze.
- Auth and media implementations after DB interfaces freeze, with disjoint ownership.
- Frontend components and reliability tests after API types freeze, with test fixtures owned separately.
- Operations and reliability suites with separate workflow/test ownership.

### Unsafe parallel work

- Multiple agents editing `package-lock.json` or `Cargo.lock`.
- Multiple migration writers using the same sequence.
- UI and API agents independently inventing request/response contracts.
- Program and TypeScript agents independently inventing PDA seeds/account layouts.
- Multiple agents editing `types.ts`, `Anchor.toml`, generated IDLs, CI, or the same route.
- A write-heavy swarm on one branch.

### Merge train

```text
prototype-baseline
  -> contracts
  -> foundation
  -> database
  -> auth
  -> media
  -> solana-v2
  -> submissions/outbox/API
  -> frontend
  -> reliability
  -> operations
  -> red-team fixes
  -> integration/release evidence
```

After each merge, rerun affected tests. The integrator resolves conflicts from the frozen contract, never by accepting whichever version compiles.

---

## 7. Detailed critical-file implementation instructions

### `apps/web/app/api/reports/route.ts`

Replace the current mixed public-list/direct-chain-write route with two explicit contracts:

- legacy `GET` compatibility backed by the public DB projection;
- v2 private submission endpoint in a versioned path.

The submission transaction must:

1. validate JSON schema and stable idempotency key;
2. validate/consume one-time staged media receipt;
3. validate category and pilot scope;
4. validate finite/global/Nepal/pilot coordinates and ward relationship;
5. derive coarse public geometry without publishing it yet;
6. reserve idempotency and insert private submission atomically;
7. store only keyed session/tracking hashes;
8. emit audit event;
9. return `202` and a tracking capability;
10. perform no Solana mutation and create no public issue.

Tests must force DB failures before and after idempotency reservation, simultaneous duplicate requests, receipt replay, duplicate evidence beyond 100 rows, invalid ward/coordinates, storage object mismatch, and untrusted origin.

### `apps/web/app/api/media/[file]/route.ts`

The authorization decision must begin with `deny`. Resolve an opaque media ID to a DB row. Permit access only when:

- the row is an approved public derivative attached to a published current/superseded-public version; or
- the caller presents the valid bound private tracking/operator identity for a non-expired permitted private state.

Never infer permission from “not linked to an issue.” Never return or redirect to the Blob URL. Use safe content headers, bounded ranges if supported, immutable cache only for public versioned media, `no-store` for private media, and a neutral 404 for denied objects.

### `apps/web/lib/storage/sanitizeImage.ts`

Return a typed normalization result:

```ts
{
  bytes: Buffer;
  sha256: Hash256;
  mimeType: 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  byteLength: number;
  normalizationVersion: 'image-v2';
}
```

Reject animated/multipage inputs and malformed metadata. Enforce input stream limit, decoded pixel limit, maximum dimensions, actual resize, orientation normalization, color-space policy, metadata removal, bounded output, and deterministic encoding settings. Hash the exact stored public artifact. Do not call it the original-file hash.

### `apps/web/lib/db/queries.ts` and `jsonStore.ts`

Do not incrementally patch the 818-line array repository. Replace it with narrow repositories and transaction services. Keep a read-only legacy importer isolated from runtime. Global dedupe must query an indexed `sha256` column. Dashboard aggregates use SQL. Public listing uses a stable cursor such as `(published_at, id)`. Outbox dequeue uses leases and row locking. Every repository method makes public/private type distinctions visible in its signature.

### `apps/web/app/api/reports/[id]/verify/route.ts` and `programs/.../verify_issue.rs`

Do not “fix” this only with copy. Existing v1 behavior remains historical. New production writes must not invoke it. Create an off-chain signals table/endpoint with abuse bounds and neutral semantics. Signals do not affect lifecycle, proof, or official state. The v2 program contains no verification instruction or count.

### `apps/web/app/api/reports/[id]/status/route.ts`

Remove manual proof-hash authority. The server constructs canonical proof metadata from the immutable issue version/status event and computes the hash. In one DB transaction: authorize, validate transition, reserve idempotency, append status event, update current lifecycle projection, append audit, and insert deterministic outbox job. A retry with the same key/payload returns the existing event; same key/different payload returns conflict. Public response never returns raw RPC/DB errors.

### `apps/web/lib/solana/server.ts`

Delete session signer derivation and top-ups from the production path. Introduce a narrow `ChainSigner` interface that accepts only an already authorized typed protocol job. Enforce cluster, program ID, operation allowlist, expected authority, bounded compute/fee/spend, simulation policy, confirmation policy, and telemetry. The private key implementation is a replaceable custody adapter; production approval requires a human-reviewed key-management setup.

### `programs/nagarik_signal_v2`

Use a new program ID. Suggested account model:

```text
ProtocolConfig
  version, authority, pending_authority, paused, bump

RoleGrant
  protocol, subject, role_bits, active, granted_at, revoked_at, bump

IssueCommitment
  protocol, issue_key[32], issuer, category, lifecycle,
  metadata_hash[32], evidence_hash[32], location_hash[32],
  timeline_head[32], handoff_head[32], update_count,
  created_at, updated_at, bump

CommitmentEvent
  issue, event_id[32], event_type, previous_head[32], new_head[32],
  metadata_hash[32], evidence_hash[32], occurred_at, actor, bump
```

Every instruction checks protocol/version/paused state, role, PDA, expected update count, expected prior head/state, and terminal rules. Event ID uniqueness makes a retry discoverable. The program stores no title, narrative, URL, exact location, personal data, receipt, or evidence bytes.

### `apps/web/components/StewardConsole.tsx`

Retire the secret-driven monolith. Replace it with authenticated pages and small components:

- moderation queue;
- submission review/private evidence viewer;
- redaction/public preview;
- publication/commit state;
- issue status action;
- handoff action with official receipt requirements;
- privacy request/removal;
- dead-letter/reconciliation view for system admins;
- audit timeline.

Every action includes current version/head to detect stale tabs. Destructive/semantic actions require confirmation and return a stable result. Never expose a proof-hash text box.

### `apps/web/lib/ops/readiness.ts` and health routes

Public liveness says only that the process responds. Readiness gives a minimal boolean/status/release ID and no sensitive dependency details. Authenticated diagnostics can show schema version, DB/Blob/RPC status, v1/v2 program/IDL checks, worker oldest pending age, dead-letter count, and signer/circuit-breaker status. Production readiness must be false if the app is on JSON storage, uses shared secrets, has wrong cluster/program, lacks required migrations, has expired backup-restore evidence, or has blocked worker state.

---

## 8. Database contract

### Core tables

| Table | Purpose | Critical constraints |
|---|---|---|
| `organizations` | Operating partner boundary | unique slug, active state |
| `profiles` | Operator profile linked to managed auth | no custom password material |
| `organization_memberships` | Roles and organization scope | unique member/org; role enum; active/revoked |
| `submissions` | Private citizen intake | no public grant; tracking token hash only; idempotency |
| `media_objects` | Opaque storage object lifecycle | unique storage key/hash metadata; deny state by default |
| `moderation_events` | Append-only review decisions | actor, reason, previous state, immutable |
| `issues` | Current public/workflow projection | opaque public ID; publication/lifecycle separate |
| `issue_versions` | Immutable public canonical versions | unique issue/version; canonical JSON and hashes |
| `public_signals` | Attention/corroboration signals | unique issue + privacy-preserving signal key; no personhood |
| `status_events` | Append-only lifecycle history | sequence/head/idempotency/state constraints |
| `authority_handoffs` | Append-only official follow-up history | sequence/previous hash/evidence basis/idempotency |
| `handoff_checkpoints` | External/on-chain head commitments | deterministic checkpoint and chain binding |
| `idempotency_keys` | Exactly-once logical mutation reservation | scope/key/request hash/response; unique |
| `chain_outbox` | Durable requested chain operations | deterministic operation ID, lease, retries, dead letter |
| `chain_transactions` | Attempts and confirmations | signature/cluster/program/result/diagnostic metadata |
| `issue_chain_bindings` | DB issue/version to v1/v2 accounts | versioned and unique |
| `audit_events` | Privileged and sensitive action history | append-only, actor/request context |
| `privacy_requests` | Access/removal/correction workflow | private and role-restricted |
| `rate_limit_buckets` | Bounded abuse control if DB-backed | keyed hashes, TTL, atomic update |

### Public views/projections

Create explicit public views or repository projections. A public query must not have columns for precise coordinates, private descriptions, raw submission media, tracking hashes, moderation notes, internal operator metadata, rate-limit identifiers, outbox payloads, or audit internals. This prevents “forgot to omit a field” defects.

### Transaction boundaries

Use one transaction for each logical mutation:

- consume upload receipt + create submission;
- moderation decision + audit;
- approve/freeze version + issue projection + outbox;
- status event + projection + audit + outbox;
- handoff append + head + audit + optional checkpoint outbox;
- removal/tombstone + public projection + audit + media policy action;
- outbox lease/attempt state transitions.

---

## 9. Test matrix

| Risk | Required test |
|---|---|
| Pending/rejected direct-page disclosure | API and Playwright request exact known ID; assert neutral result and no original strings/media |
| Orphan upload bearer access | Stage upload, do not submit, attempt same/wrong/no session and leaked route; assert denial/expiry |
| Chain succeeds, DB acknowledgment fails | Inject failure after submit; retry; verify one PDA/event and reconciled DB signature |
| Duplicate request race | Submit same idempotency/media receipt concurrently; exactly one logical submission/event |
| Signal Sybil semantics | Create many anonymous sessions; lifecycle remains unchanged and UI says signals, not people |
| 100-record truncation | Seed well above limit; dedupe, dashboard, list, categories, and proof selection remain exact |
| Invalid geography | NaN, infinity, global out-of-range, outside Nepal/pilot, invalid ward, polygon mismatch |
| PII/media safety | Metadata, face/plate/text advisory fixtures, malformed/animated/bomb/oversized images; mandatory human decision |
| Shared-secret bypass | Old header/secret inputs fail; individual role auth required |
| Manual proof hash mismatch | Caller cannot supply it or mismatch is rejected; server vector matches stored/chain value |
| Raw session/token persistence | Static grep plus DB assertions and log capture contain only keyed hashes |
| Handoff rewrite | UPDATE/DELETE blocked; hash/sequence/checkpoint detects tampering |
| Data availability | Restore DB and approved evidence to isolated environment; proofs and pages recover |
| RPC false absence | RPC timeout/error never initializes/recreates protocol account |
| Global counter contention | v2 concurrent issue creation uses independent keys and succeeds |
| Wrong environment | production config with devnet/wrong program/staging DB/public Blob fails readiness/startup |
| Authorization | role and cross-org matrix for every operator route/repository |
| Cache leak | private/rejected responses are no-store and not retrievable after another session |
| SSRF | proof/evidence fetch cannot access arbitrary host, redirect, internal IP, or raw Blob URL |
| Accessibility | WCAG 2.2 AA automated + keyboard/focus/mobile/manual screen-reader checklist |
| Recovery | worker lease expiry, crash at every boundary, dead-letter replay, deployment rollback |

---

## 10. Deployment and release strategy

1. Keep current prototype deployment frozen for the meetup; do not patch architecture under presentation pressure.
2. Build new production path behind feature flags and separate environment/database/storage namespace.
3. Never point development or test jobs at live civic data.
4. Import legacy data into staging first; verify checksums and public eligibility.
5. Run dual-read comparison only if useful; do not dual-write old JSON and new DB indefinitely.
6. Disable old mutations before enabling new operator writes.
7. Restrict new intake to named/invite-only pilot users until abuse/privacy/legal gates pass.
8. Keep v2 on an approved non-mainnet cluster until audit and key governance pass.
9. Use canary operators/records and predefined rollback thresholds.
10. Expand only after release evidence remains green; a failed threshold returns the system to the previous safe feature-flag state.

### Rollback design

- Code rollback: redeploy prior immutable release ID.
- Database: use backward-compatible expand/migrate/contract steps; do not require destructive rollback for normal release.
- Feature flags: disable submissions, publication, v2 writes, or operator mutations independently.
- Chain: cannot roll back confirmed commitments; publish a correcting/superseding append-only version and preserve evidence.
- Media: removal changes access/public projection; preserve or delete originals only according to approved policy and legal hold.
- Keys: pause v2 program where possible, revoke role, rotate service credentials, and invoke custody incident plan.

---

## 11. Codex swarm operating instructions

Codex subagents are useful for parallel exploration, tests, and bounded implementation, but write-heavy parallelism creates conflicts. Use the included swarm pack.

### Repository bootstrap

```bash
cd Nagarik_Signals-main

git init
git add .
git commit -m "chore: preserve prototype baseline"
git tag prototype-baseline
git switch -c production-readiness

# Copy the swarm pack into the repository root, preserving hidden directories.
cp -R /path/to/nagarik_codex_swarm_pack/. .
git add AGENTS.md apps/web/AGENTS.md programs/nagarik_signal/AGENTS.md \
  programs/nagarik_signal_v2/AGENTS.md supabase/AGENTS.md .codex .github/codex
git commit -m "chore: add production Codex orchestration"
```

### Parent-thread prompt

Use `.codex/prompts/master-orchestrator.md`, then one wave prompt. Tell Codex to spawn the named subagents, wait for all, and return structured reports. Read-only agents should never receive workspace-write merely for convenience.

### Worktrees

Create worktrees only after prerequisite contracts are merged:

```bash
git worktree add ../nagarik-db -b prod/database production-readiness
git worktree add ../nagarik-auth -b prod/authz production-readiness
git worktree add ../nagarik-media -b prod/media production-readiness
git worktree add ../nagarik-solana-v2 -b prod/solana-v2 production-readiness
```

Each writer commits to its branch and reports the SHA. The integrator reviews/cherry-picks/merges one commit at a time. Never share a mutable `.env`, database schema branch, wallet/key file, or lockfile edits across worktrees.

### Structured non-interactive run

```bash
mkdir -p artifacts/codex/wave-00
cat .codex/prompts/00-baseline-and-contract-freeze.md | \
  codex exec --sandbox workspace-write \
    --output-schema .codex/schemas/agent-report.schema.json \
    -o artifacts/codex/wave-00/final.json -
```

Use `--json` for a JSONL event log when desired. Keep API credentials scoped to the single Codex invocation or use the official GitHub action pattern; never expose them to untrusted build scripts. Codex-generated GitHub review should be read-only and must not auto-merge or auto-deploy.

### Agent handoff contract

Every agent must return:

```json
{
  "agent": "database_engineer",
  "task_id": "DB-001",
  "status": "complete|blocked|failed|review_only",
  "summary": "...",
  "changed_files": ["..."],
  "commands": [{"command":"...","exit_code":0,"result":"..."}],
  "tests_added": ["..."],
  "risks": ["..."],
  "contract_changes": ["..."],
  "rollback_impact": "...",
  "commit_sha": "..."
}
```

A missing test result, migration impact, or contract change is a failed handoff—not clerical cleanup.

---

## 12. Current file-by-file plan

The table below accounts for every file in the uploaded repository. “Retain” does not mean “ignore”; it means preserve after the stated verification. New files follow in the next section.

| Current file | Action | Wave | Primary owner | Exact instruction | Acceptance |
|---|---|---:|---|---|---|
| `.dockerignore` | MODIFY | 7 | `devops_observability_engineer` | Exclude secrets, local Supabase state, test artifacts, Codex session data, evidence fixtures not needed at runtime, and build caches; include only files needed for the selected deployment path. | A container context audit contains no secret, local DB, raw evidence, or irrelevant test output. |
| `.editorconfig` | MODIFY | 1 | `dependency_custodian` | Add consistent rules for SQL, TOML, Rust, YAML, and Markdown while preserving existing line-ending policy. | Formatter output is stable across Node, Rust, SQL, and workflow files. |
| `.env.example` | REWRITE | 1 | `dependency_custodian` | Replace JSON/read-model and shared-steward settings with validated DB, auth, Blob, worker, v1/v2 RPC/program, signer, observability, retention, and feature-flag variables. Mark public vs server-only values and forbid duplicate secrets. | Environment schema tests reject placeholders, unsafe cross-environment IDs, devnet in production, and absent mandatory secrets. |
| `.gitattributes` | MODIFY | 1 | `dependency_custodian` | Mark generated IDLs and lockfiles appropriately, normalize text files, and avoid misleading diffs for binary evidence. | Git diff behavior is deterministic and generated artifacts are clearly identified. |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | REWRITE | 7 | `devops_observability_engineer` | Capture environment, release ID, privacy/security impact, reproduction, expected/actual behavior, request ID, and whether public data is exposed; direct sensitive reports to SECURITY.md. | Template supports severity triage without soliciting secrets or personal data. |
| `.github/ISSUE_TEMPLATE/config.yml` | MODIFY | 7 | `devops_observability_engineer` | Disable unsafe blank issues, link security/private reporting and support channels, and avoid sending privacy incidents to public issues. | Security/privacy reports have a private route. |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | MODIFY | 7 | `devops_observability_engineer` | Add product-boundary, privacy, moderation, legal, data-retention, chain-necessity, and operational-owner questions. | Feature requests cannot bypass the architecture/release criteria. |
| `.github/dependabot.yml` | REWRITE | 7 | `dependency_custodian` | Cover npm, Cargo, and GitHub Actions; group low-risk updates, isolate majors, set review ownership, and avoid automatic merging. | Dependency PRs are scoped and all ecosystems are monitored. |
| `.github/pull_request_template.md` | REWRITE | 7 | `integration_owner` | Add contract impact, threat-model change, migration, RLS, privacy, idempotency, chain compatibility, tests, observability, rollback, screenshots, and generated-artifact checks. | Every release-relevant PR carries enough evidence for independent review. |
| `.github/workflows/ci.yml` | REWRITE | 7 | `devops_observability_engineer` | Create least-privilege jobs for clean install, formatting, TS/lint, unit, Postgres migration/RLS, integration, Rust fmt/clippy/test, Anchor v1/v2, generated IDL drift, security scans, Playwright/a11y, build, and artifact manifests. | No job has unnecessary write permission; all required gates run from clean state and publish evidence. |
| `.github/workflows/production-smoke.yml` | REWRITE | 7/8 | `devops_observability_engineer` | Use safe read-only synthetic checks, minimal health, proof validation, canary release ID, alerting, and no mutation of real civic records. | Smoke detects wrong deployment/DB/program/IDL and cannot leak or mutate production data. |
| `.gitignore` | MODIFY | 1 | `dependency_custodian` | Ignore environment files, Supabase local data, coverage, Playwright output, release evidence secrets, Codex rollouts, worktrees, local keys, test wallets, and generated temp media. | Secret scan and clean-status tests confirm local sensitive artifacts are excluded. |
| `.vercelignore` | REWRITE | 7 | `devops_observability_engineer` | Exclude local data, tests, docs assets not used at runtime, Rust target, keys, Codex files if desired, and legacy JSON while retaining required generated runtime artifacts. | Deployment bundle contains no private fixtures, local state, or key material. |
| `ARCHITECTURE.md` | REWRITE | 0/8 | `architecture_guard` | Describe Postgres-authoritative workflow, private media staging, moderation-before-publication, outbox/reconciliation, v1 read compatibility, v2 commitments, auth/RBAC, and availability boundaries. | Diagram and failure-ordering match implementation and recovery tests. |
| `Anchor.toml` | MODIFY | 4 | `solana_v2_engineer` | Register v1 and v2 separately, use explicit cluster profiles, new v2 program ID, test scripts, and no production key paths. | Local tests build both; environment mismatch fails closed; no mainnet deployment command runs implicitly. |
| `CHANGELOG.md` | REWRITE | 8 | `integration_owner` | Add an unreleased production migration section, breaking API/program/schema changes, security/privacy fixes, migration notes, and v1 legacy compatibility. | Release entry matches manifest and commit/tag. |
| `CODE_OF_CONDUCT.md` | RETAIN/REVIEW | 8 | `integration_owner` | Retain unless contact or reporting channels are stale; ensure safety reporting does not expose complainants. | Contact paths are current and private where needed. |
| `CONTRIBUTING.md` | REWRITE | 7 | `integration_owner` | Document local Supabase/validator setup, wave ownership, migrations, tests, threat-model updates, generated IDL policy, evidence fixtures, and no-secrets rules. | A new contributor can reproduce all checks without hidden state. |
| `Cargo.lock` | REGENERATE ONLY | 1/4 | `dependency_custodian` | Only the dependency custodian regenerates after reviewed workspace/program dependency changes. Never hand-edit. | Clean Cargo resolution is reproducible and audits pass. |
| `Cargo.toml` | MODIFY | 1/4 | `dependency_custodian` | Add the v2 program to the workspace while preserving v1; pin reviewed dependencies and release profiles. | Both programs build under the pinned toolchain without warnings. |
| `Dockerfile` | REWRITE OR REMOVE | 7 | `devops_observability_engineer` | If container deployment is supported, use multi-stage minimal non-root runtime, healthcheck, immutable install, no source/test/private data, and runtime env validation. Otherwise remove it and document Vercel-only deployment. | Image scan has no high/critical findings and process runs non-root, or no misleading unsupported image remains. |
| `LICENSE` | RETAIN | 8 | `integration_owner` | Retain and verify all new dependencies/assets are compatible. | SBOM/license review has no incompatible component. |
| `README.md` | REWRITE | 8 | `architecture_guard` | Lead with the independent evidence/follow-up layer, current release profile, exact integrity boundary, moderated workflow, deployment status, and reproducible setup. Remove nationwide/production/mainnet implications unsupported by evidence. | Every headline claim is testable and release-profile accurate. |
| `ROADMAP.md` | REWRITE | 0 | `architecture_guard` | Replace feature wishlist with gated maturity levels: demo, curated pilot, public beta, production; tie each to release criteria and named external gates. | No milestone is based solely on feature count or chain transactions. |
| `SAFETY.md` | REWRITE | 0/6 | `architecture_guard` | Define intake exclusions, moderation queue, redaction, appeals, retention, precise/public location, emergency messaging, official-routing semantics, and operator escalation. | Safety states and public behavior match state-machine tests. |
| `SECURITY.md` | REWRITE | 7 | `security_red_team` | Document supported versions, private disclosure route, response ownership, threat boundaries, v1/v2 status, no-bounty claims unless real, and key/incident handling. | Reporters have a safe private path and no false certification language exists. |
| `SUPPORT.md` | UPDATE | 8 | `integration_owner` | Separate user support, operator incidents, security reports, privacy/takedown requests, and emergencies; do not promise emergency response. | Each request class has a clear safe channel and SLA owner if one exists. |
| `apps/web/app/about/page.tsx` | REWRITE | 6/8 | `frontend_a11y_engineer` | Explain integrity vs truth, official-system relationship, governance, privacy, v1 legacy/v2 current profile, and correction/removal. | No ambiguous verification/personhood/official-response claim remains. |
| `apps/web/app/api/dashboard/route.ts` | REWRITE | 5 | `api_workflow_engineer` | Use DB aggregate repository and public projection; cursor/time filters; no 100-row cap; stable cache and error contract. | Counts remain exact on large seeded datasets and expose no private states. |
| `apps/web/app/api/health/route.ts` | REPLACE | 7 | `devops_observability_engineer` | Replace detailed public endpoint with minimal live/ready routes and authenticated operator diagnostics. | Unauthenticated response reveals no RPC URL, relayer balance, storage path, DB details, or secret configuration. |
| `apps/web/app/api/media/[file]/route.ts` | REWRITE | 3 | `media_privacy_engineer` | Resolve opaque media ID, authorize by lifecycle/requester, stream approved public derivative or authorized private staging object, deny orphan/rejected/expired by default, and avoid redirecting to raw Blob URLs. | Negative access matrix passes, including possession of a leaked legacy URL. |
| `apps/web/app/api/reindex/route.ts` | REPLACE | 4/5 | `api_workflow_engineer` | Move to protected internal reconciliation route/service using DB outbox/bindings, bounded batches, leases, dry-run, and structured reconciliation records. | Repeated reconciliation converges and cannot recreate private/public metadata from hashes alone. |
| `apps/web/app/api/reports/[id]/handoff/route.ts` | REWRITE/COMPATIBILITY | 5 | `api_workflow_engineer` | Move mutation to authenticated v2 operator route and domain service; retain read compatibility only if needed. Persist append-only handoff atomically, enforce expected head/idempotency/evidence basis, and schedule checkpoint. | Concurrent appends serialize correctly; acknowledgment requires configured official evidence; public read is safe. |
| `apps/web/app/api/reports/[id]/moderation/route.ts` | REWRITE/COMPATIBILITY | 5 | `api_workflow_engineer` | Replace shared secret with role auth and append-only decision service. Support pending, approve, request changes, reject, redact, withdraw/remove with actor/reason and publication gating. | No rejected/pending content is public; every decision is attributed and immutable. |
| `apps/web/app/api/reports/[id]/route.ts` | REWRITE | 5 | `api_workflow_engineer` | Use opaque public ID and public projection; return neutral tombstone or 404 for non-public states. Keep any private tracking lookup on a separate capability endpoint. | Direct URL cannot reveal rejected/pending/private title, description, exact coordinates, or media. |
| `apps/web/app/api/reports/[id]/status/route.ts` | REWRITE/COMPATIBILITY | 5 | `api_workflow_engineer` | Authenticated role check, state-machine validation, server canonical proof hash, append event plus outbox in one DB transaction, idempotency, expected version/head, no raw error. | Timeout/retry produces one logical event and one deterministic chain event. |
| `apps/web/app/api/reports/[id]/verify/route.ts` | RETIRE/410 OR REDIRECT | 5 | `api_workflow_engineer` | Remove verification semantics. Add `/api/v2/issues/[id]/signals` off-chain attention signal endpoint; legacy route returns migration-safe response without changing lifecycle or chain. | Two or many sessions never cause `verified`; copy never claims unique citizens. |
| `apps/web/app/api/reports/route.ts` | REWRITE/COMPATIBILITY | 3/5 | `api_workflow_engineer` | POST becomes private moderated submission or is disabled in favor of v2; GET uses complete DB cursor pagination. Remove chain-first write, ward fallback, limited dedupe, visible default, and raw errors. | Submission returns 202 tracking receipt; no public/chain record exists before approval; retries are idempotent. |
| `apps/web/app/api/upload/route.ts` | REWRITE/COMPATIBILITY | 3 | `media_privacy_engineer` | Replace raw URL receipt with staged media object and one-time purpose-bound receipt; enforce streaming limits and DB lifecycle. | Abandoned, wrong-session, expired, replayed, and rejected media cannot be served or consumed. |
| `apps/web/app/api/verify-proof/[id]/route.ts` | REWRITE | 5 | `api_workflow_engineer` | Support explicit v1/v2 proof readers, approved delivered media, versioned canonical metadata, stable partial statuses, and no implicit truth claim. | Known v1 and v2 fixtures match; tampered bytes/metadata/account produce precise independent failures. |
| `apps/web/app/dashboard/page.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Render exact DB aggregates, follow-up states, overdue semantics, data freshness, and partial-failure states without implying authority receipt. | Large dataset and failure-state browser tests pass. |
| `apps/web/app/error.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Show safe retry/support with request ID only; never expose stack, raw API error, secret, or private record. | Fault-injection browser tests show safe recovery and no sensitive output. |
| `apps/web/app/explore/page.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Use cursor-backed public list/map, explicit approximate locations, empty/error states, and no partial 100-record dataset. | Map/list consistency and pagination tests pass at scale. |
| `apps/web/app/icon.svg` | RETAIN | 6 | `frontend_a11y_engineer` | Keep only after attribution/licensing and accessibility usage are verified; do not embed private or unreviewed data. | Asset inventory has checksum, purpose, license/source, and no sensitive metadata. |
| `apps/web/app/issues/[id]/page.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Use public projection/tombstone, opaque ID, separated provenance/lifecycle/signals/handoffs/proof/corrections, and no private fields. | Rejected/pending URL tests show no sensitive content; proof semantics remain explicit. |
| `apps/web/app/layout.tsx` | MODIFY | 6/7 | `frontend_a11y_engineer` | Add metadata, skip navigation, security-compatible app shell, authenticated operator nav boundaries, and localization-ready structure. | A11y and header integration tests pass. |
| `apps/web/app/loading.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Use accessible status semantics and reduced-motion-safe skeletons. | Screen-reader and reduced-motion checks pass. |
| `apps/web/app/not-found.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Differentiate ordinary not-found from neutral removed-record tombstone without confirming private record existence. | Enumeration tests cannot distinguish private/rejected IDs. |
| `apps/web/app/page.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Reframe product around independent evidence and follow-up; disclose release profile and moderation; avoid devnet/mainnet-first marketing. | Claims match release evidence and pass language-boundary tests. |
| `apps/web/app/report/page.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Present moderated submission, scope/safety, non-emergency notice, privacy/retention summary, and no instant-publication promise. | Page language and flow match 202 tracking behavior. |
| `apps/web/app/steward/page.tsx` | REPLACE/REDIRECT | 6 | `authz_engineer` | Redirect to authenticated `/operator` area; no client-entered secret or public operator console. | Unauthenticated users cannot render private queues or forms. |
| `apps/web/components/ApproxLocationPicker.tsx` | MODIFY | 3/6 | `frontend_a11y_engineer` | Enforce pilot/Nepal bounds and clarify precise private vs coarse public location. | Map and server validation agree; exact coordinates are absent from public DOM/API. |
| `apps/web/components/CategoryPicker.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Drive from server/shared schema and pilot-enabled categories; accessible errors. | Disabled/out-of-scope category cannot be submitted via client or API. |
| `apps/web/components/DashboardStats.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Render server aggregate metadata and freshness; avoid client recomputation from partial list. | Stats match DB test fixture exactly. |
| `apps/web/components/DaysIgnoredBadge.tsx` | RENAME/REWRITE | 6 | `frontend_a11y_engineer` | Use neutral `Days observed` or follow-up-age labels tied to actual sent/acknowledged states; never imply authority neglect before delivery. | Copy is correct for prepared-only, sent, acknowledged, and no-handoff cases. |
| `apps/web/components/ExploreMap.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Implement cursor/paged loading or bounded viewport query; maintain accessible list fallback and approximate points. | No record disappears because of a fixed 100 limit; map failure remains usable. |
| `apps/web/components/HandoffTimeline.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Show prepared/sent/acknowledged/closed and official reference evidence distinctly; include checkpoint integrity status without immutability overclaim. | State semantics match policy and proof fixtures. |
| `apps/web/components/HashScrollRestorer.tsx` | RETAIN/TEST | 6 | `frontend_a11y_engineer` | Retain if accessible and compatible; add regression test only if proof anchors change. | No focus loss or unexpected motion. |
| `apps/web/components/IssueActions.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Expose safe signal/share/proof actions; remove any lifecycle-changing public action. | Public user cannot reach operator mutation. |
| `apps/web/components/IssueCard.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Use public projection, opaque ID, coarse location, publication/provenance labels, and neutral signals. | Card cannot render private or stale internal fields. |
| `apps/web/components/IssueMap.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Accept coarse public geometry only and disclose approximation. | No exact coordinate is serialized to the client. |
| `apps/web/components/PhotoUpload.tsx` | REWRITE | 3/6 | `media_privacy_engineer` | Display local preview and server validation states without exposing storage URL; support cancellation and safety warnings. | Rejected/expired upload state is recoverable and no raw Blob URL enters DOM/logs. |
| `apps/web/components/ProofPanel.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Add proof version, v1 legacy label, independent byte/metadata/chain/availability results, timestamps, and truth boundary. | Tampered and unavailable fixtures render distinct understandable statuses. |
| `apps/web/components/ProofPreview.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Preview only server-derived canonical commitments; never accept client authority for final hash. | Client/server canonical fixture comparison passes. |
| `apps/web/components/ReportForm.tsx` | REWRITE/SPLIT | 3/6 | `frontend_a11y_engineer` | Consume staged upload and submission contracts, submit for review, store tracking capability safely, and split steps into testable modules. | No client builds authoritative proof or receives public URL pre-approval; retry/error/a11y tests pass. |
| `apps/web/components/ReportLocation.tsx` | MODIFY | 3/6 | `frontend_a11y_engineer` | Render only approved coarse location and location confidence. | Public page never receives precise coordinates. |
| `apps/web/components/SafetyModal.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Use concise mandatory safety/scope and emergency guidance tied to policy; do not treat acknowledgment as legal consent by itself. | Content matches SAFETY.md and is keyboard/screen-reader accessible. |
| `apps/web/components/SessionChoice.tsx` | RETIRE/REPLACE | 3/6 | `frontend_a11y_engineer` | Remove pseudo-identity choice. Use private tracking and an anonymous signal cookie/capability with explicit non-personhood semantics. | No localStorage identity is used as a citizen identity claim. |
| `apps/web/components/SiteNavigation.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Separate public and operator navigation, auth state, focus management, and non-emergency language. | Unauthorized operator link does not expose data; navigation a11y passes. |
| `apps/web/components/StatusTimeline.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Render append-only lifecycle events and corrections; separate legacy implicit v1 state from steward-reviewed v2 events. | Timeline ordering/hash and accessible labels pass. |
| `apps/web/components/StewardConsole.tsx` | RETIRE/SPLIT | 6 | `frontend_a11y_engineer` | Replace monolith with authenticated operator queue/detail/actions components; remove secret and manual proof hash fields. | Role-specific operator E2E tests pass. |
| `apps/web/components/StewardHandoffForm.tsx` | REWRITE | 6 | `frontend_a11y_engineer` | Use typed operator API, official evidence requirements, idempotency hidden/generated, expected head, and clear state definitions. | Double submit and stale head are handled without duplicate events. |
| `apps/web/components/SubmitProgress.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Represent private upload, submission receipt, moderation, commitment, and publication states accurately. | No progress label claims publication or chain success prematurely. |
| `apps/web/components/VerifyButton.tsx` | RENAME/REWRITE | 6 | `frontend_a11y_engineer` | Replace with `SignalButton.tsx`; explain attention signal, abuse limits, and no personhood/truth claim. | Signals never alter lifecycle; keyboard and retry states pass. |
| `apps/web/components/WardLeaderboard.tsx` | REVIEW/REMOVE | 6 | `frontend_a11y_engineer` | Remove if it gamifies reporting or relies on partial counts; otherwise use exact aggregates and explain denominator. | No perverse incentive or misleading ranking remains. |
| `apps/web/components/WardSelect.tsx` | MODIFY | 3/6 | `frontend_a11y_engineer` | Require a valid explicit ward or safe unknown option per contract; no silent fallback. | Invalid/stale option blocks submission with accessible error. |
| `apps/web/components/maps/MapSurface.tsx` | MODIFY | 6 | `frontend_a11y_engineer` | Harden external map failures, CSP compatibility, keyboard fallback, and no secret query parameters. | Map failure and CSP tests pass. |
| `apps/web/eslint.config.mjs` | HARDEN | 1/7 | `dependency_custodian` | Add rules for unsafe any/casts, floating promises, server-only boundaries, secrets/logging, and test exceptions narrowly. | Lint catches representative unsafe fixtures and passes production code. |
| `apps/web/lib/constants/categories.ts` | REVIEW/MODIFY | 1-8 | `integration_owner` | Review against the target architecture and make the smallest contract-compliant change. | Relevant wave tests and full release gate pass. |
| `apps/web/lib/constants/config.ts` | REVIEW/MODIFY | 1-8 | `integration_owner` | Review against the target architecture and make the smallest contract-compliant change. | Relevant wave tests and full release gate pass. |
| `apps/web/lib/constants/statuses.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/constants/statuses.ts` | REVIEW/MODIFY | 1-8 | `integration_owner` | Review against the target architecture and make the smallest contract-compliant change. | Relevant wave tests and full release gate pass. |
| `apps/web/lib/db/demoSeed.ts` | MOVE/REWRITE | 2 | `database_engineer` | Move to test fixtures and Supabase seed; label sample/source/QA records, never seed production automatically. | Production startup has no seed side effect; tests are deterministic. |
| `apps/web/lib/db/jsonStore.ts` | RETIRE AFTER IMPORT | 2/8 | `database_engineer` | Freeze as a legacy import reader only or move under `lib/legacy`; remove all runtime writes. | Production code graph has no JSON read-model import except explicit migration tool. |
| `apps/web/lib/db/queries.ts` | REPLACE/SPLIT | 2 | `database_engineer` | Replace array scans with transaction-aware repositories for submissions, issues, media, signals, status, handoff, outbox, audit, and aggregates. | Queries are indexed, cursor-paginated, RLS-compatible, and tested above 100 records. |
| `apps/web/lib/db/schema.sql` | RETIRE | 2 | `database_engineer` | Replace one-shot schema with numbered Supabase migrations; keep only as archived prototype reference if needed. | Empty and upgrade migration tests use only numbered migrations. |
| `apps/web/lib/db/supabase.ts` | REWRITE | 1/2 | `database_engineer` | Create server/client/auth/admin factories with strict environment separation; service-role access server-only and narrowly scoped. | Bundle test proves service role is absent from client; connection/auth tests pass. |
| `apps/web/lib/deployment.ts` | REWRITE | 1/7 | `devops_observability_engineer` | Expose build/release identity and safe feature flags; validate cluster/program/schema compatibility. | Wrong environment or stale migration/IDL marks readiness false. |
| `apps/web/lib/geo/geohash.ts` | REVIEW/MODIFY | 3 | `api_workflow_engineer` | Use only for approved coarse/public purpose; document precision/privacy and test boundaries. | No geohash allows recovery of prohibited precision beyond policy. |
| `apps/web/lib/geo/map.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/geo/map.ts` | MODIFY | 3 | `api_workflow_engineer` | Centralize Nepal/global/pilot bounds, coarse rounding/grid, and public-location derivation. | Property tests ensure output is bounded, coarse, and consistent. |
| `apps/web/lib/geo/wards.ts` | REWRITE | 3 | `api_workflow_engineer` | Return `undefined` or validated result for unknown ward; add pilot boundaries/polygons/version and no fallback. | Unknown/mismatched ward is rejected and covered by tests. |
| `apps/web/lib/handoffs/hash.ts` | MODIFY | 5 | `api_workflow_engineer` | Version canonical handoff hash, include issue/event/idempotency/evidence fields, and test cross-runtime fixtures. | Hash vectors are stable and checkpoint matches chain. |
| `apps/web/lib/handoffs/policy.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/handoffs/policy.ts` | REWRITE | 5 | `api_workflow_engineer` | Encode precise state transitions and evidence requirements, especially sent/acknowledged/closed; no platform action equals official receipt. | Exhaustive transition table tests pass. |
| `apps/web/lib/issues/recordKind.ts` | MODIFY | 2/5 | `database_engineer` | Map legacy record classes to production data model and public eligibility; fixtures remain excluded. | Import/public projection tests prevent sample/QA promotion. |
| `apps/web/lib/ops/readiness.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/ops/readiness.ts` | REWRITE | 7 | `devops_observability_engineer` | Evaluate DB migrations, auth config, storage, v1/v2 RPC/program/IDL, worker backlog, signer health, release ID, and required feature flags without exposing details publicly. | Production cannot report ready with JSON storage, devnet mismatch, missing MFA policy, dead-letter backlog, or failed restore evidence. |
| `apps/web/lib/proof/canonicalize.ts` | HARDEN/VERSION | 5 | `api_workflow_engineer` | Define explicit canonical JSON versions, reject unsupported/non-finite/ambiguous values, and publish vectors. | Property and cross-language/vector tests pass. |
| `apps/web/lib/proof/evidence.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/proof/evidence.ts` | MODIFY | 3/5 | `media_privacy_engineer` | Fetch only approved same-origin media IDs with size/time/type bounds; distinguish unavailable from mismatch and block internal SSRF paths. | SSRF, redirect, oversized, timeout, and unavailable tests pass. |
| `apps/web/lib/proof/hash.ts` | RETAIN/HARDEN | 5 | `api_workflow_engineer` | Centralize byte/hex validation, constant-time comparison where used, and typed hash values. | Invalid length/encoding is rejected and test vectors pass. |
| `apps/web/lib/proof/metadata.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/proof/metadata.ts` | REWRITE/VERSION | 5 | `api_workflow_engineer` | Remove raw storage URL from new canonical metadata; use opaque media/public IDs, record/version, provenance, and explicit v2 schema. Keep v1 verifier. | v1 fixtures remain valid and v2 canonical vectors are frozen. |
| `apps/web/lib/proof/timelineHash.ts` | REWRITE/VERSION | 5 | `api_workflow_engineer` | Hash explicit append-only events; no synthetic fractional sequence; include event version/type/id and previous head. | DB and chain heads match after every tested transition. |
| `apps/web/lib/proof/verifyProof.ts` | REWRITE | 5 | `api_workflow_engineer` | Use version-dispatched verification and approved delivered bytes; independently report DB, bytes, canonical metadata, chain, and availability. | All mismatch combinations produce correct statuses without truth claim. |
| `apps/web/lib/security/rateLimit.ts` | REPLACE | 2/7 | `api_workflow_engineer` | Use transactional DB or approved dedicated rate limiter with keyed privacy-preserving identifiers, route scopes, expiry, fail policy, and observability. | Concurrent requests cannot bypass; unavailable limiter behavior follows policy and tests. |
| `apps/web/lib/security/request.ts` | REWRITE | 2 | `authz_engineer` | Centralize trusted proxy/IP policy, exact origin/host validation, CSRF, request IDs, streamed body bounds, and stable errors. | Spoofed forwarded headers, malformed origin, missing origin, oversized chunked body, and host attacks are tested. |
| `apps/web/lib/security/secrets.ts` | REWRITE | 1/7 | `dependency_custodian` | Use environment schema and secret separation; reject equal/short/placeholder secrets; no fallback in production. | Startup tests fail on every unsafe combination. |
| `apps/web/lib/security/session.ts` | REWRITE | 2 | `authz_engineer` | Use managed operator session and separate anonymous tracking/signal capabilities; store only keyed hashes; tighten expiry, rotation, secure/samesite/httpOnly. | No raw session persists and fixation/replay/logout tests pass. |
| `apps/web/lib/security/uploadReceipt.ts` | REWRITE | 3 | `media_privacy_engineer` | Token contains opaque media ID, purpose, expiry, nonce; signed and one-time consumed transactionally; never raw URL/session ID. | Replay/concurrency/purpose/wrong-session/expiry tests pass. |
| `apps/web/lib/server/paths.ts` | MODIFY | 2/7 | `devops_observability_engineer` | Remove production local-data paths and confine legacy/import/test paths. | Production bundle/runtime cannot write local read model or evidence. |
| `apps/web/lib/session/civicSession.ts` | RETIRE/REPLACE | 2/3 | `authz_engineer` | Remove localStorage pseudo-identity. Introduce server-issued anonymous capability only where needed, with no personhood claim. | Clearing/changing browser state cannot confer verified status; no raw token in storage/logs. |
| `apps/web/lib/solana/actions.ts` | REWRITE/SPLIT V1 V2 | 4 | `api_workflow_engineer` | Move v1 to read-only namespace; v2 mutation methods are invoked only by outbox worker with deterministic identifiers and exact expected state. | No route directly sends a chain transaction; retry tests converge. |
| `apps/web/lib/solana/connection.ts` | MODIFY | 4/7 | `api_workflow_engineer` | Add explicit cluster/program profiles, timeouts, retry classification, endpoint allowlist, and observability. | Production rejects wrong cluster/program; tests cover timeout and malformed RPC. |
| `apps/web/lib/solana/explorer.ts` | MODIFY | 4/6 | `frontend_a11y_engineer` | Version cluster-aware links and never imply Explorer proves truth. | Links point to configured cluster and copy is accurate. |
| `apps/web/lib/solana/identity.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/solana/identity.ts` | MOVE TO LEGACY/RETIRE WRITE USE | 4 | `solana_v2_engineer` | Keep only v1 historical derivation if necessary for verification; remove from production write path and prevent browser/session funding. | Dependency graph shows no v2 mutation imports. |
| `apps/web/lib/solana/idl.ts` | REWRITE | 4 | `solana_v2_engineer` | Load separate generated v1/v2 IDLs with checksum/version validation; do not hand-edit. | Build fails on IDL drift or program-ID mismatch. |
| `apps/web/lib/solana/instructions.ts` | REWRITE/SPLIT | 4 | `solana_v2_engineer` | Namespace v1 read helpers and v2 instruction builders; deterministic issue/event IDs and expected-state fields. | Instruction vector tests match Anchor program. |
| `apps/web/lib/solana/mappers.ts` | REWRITE | 4/5 | `api_workflow_engineer` | Map v1/v2 accounts to explicit domain proof models without conflating legacy verified status with reviewed status. | Legacy and v2 fixture mappings are semantically accurate. |
| `apps/web/lib/solana/pda.ts` | REWRITE/VERSION | 4 | `solana_v2_engineer` | Namespace v1 seeds; add v2 issue key/event/config/role derivations and vector tests. | TS and Rust PDA vectors match. |
| `apps/web/lib/solana/program.ts` | REWRITE | 4 | `solana_v2_engineer` | Create versioned read clients and worker-only v2 write client; no client bundle secret/signer. | Bundle and import-boundary tests pass. |
| `apps/web/lib/solana/readOnly.ts` | MODIFY | 4/5 | `api_workflow_engineer` | Support v1/v2 read and precise account-not-found vs RPC failure classification. | RPC error is never treated as absent account; proof tests pass. |
| `apps/web/lib/solana/server.ts` | REWRITE | 4 | `api_workflow_engineer` | Remove session-key derivation/top-up. Implement bounded worker signer interface, authority checks, simulation/confirmation, spend metrics, and KMS/custody adapter boundary. | No citizen SOL transfer path exists; unauthorized job cannot sign. |
| `apps/web/lib/storage/media.test.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/lib/storage/media.ts` | REWRITE | 3 | `media_privacy_engineer` | Use DB media records and opaque IDs; deny orphan by default; version public/private derivatives and deletion. | Complete access matrix passes. |
| `apps/web/lib/storage/mediaConfig.ts` | REWRITE | 1/3 | `media_privacy_engineer` | Validate private Blob configuration, retention, size/type limits, and environment; no mutable public URL assumptions. | Production fails closed on public bucket or missing token. |
| `apps/web/lib/storage/sanitizeImage.ts` | REWRITE | 3 | `media_privacy_engineer` | Add actual bounded resize, deterministic normalization, animation rejection, pixel/decode/output bounds, metadata removal, dimensions/hash result, and safe errors. | Golden fixtures and adversarial image tests pass; docs describe normalized artifact accurately. |
| `apps/web/lib/storage/upload.ts` | REWRITE | 3 | `media_privacy_engineer` | Stage under opaque storage key, insert media DB row transactionally/reconcilably, and never return raw Blob URL. | DB/storage partial failures are cleaned or reconciled and tested. |
| `apps/web/lib/types.ts` | SPLIT/REPLACE | 0/2 | `architecture_guard` | Replace monolithic legacy types with domain-specific immutable DTOs and explicit public/private projections. Keep v1 types namespaced. | Client imports cannot reference private DB rows; state enums match contracts. |
| `apps/web/lib/ui/format.ts` | MODIFY | 6 | `frontend_a11y_engineer` | Add locale/timezone-safe display and avoid using formatted strings in canonical data. | UTC storage/Nepal display tests pass. |
| `apps/web/next-env.d.ts` | REVIEW/MODIFY | 1-8 | `integration_owner` | Review against the target architecture and make the smallest contract-compliant change. | Relevant wave tests and full release gate pass. |
| `apps/web/next.config.ts` | REWRITE/HARDEN | 7 | `devops_observability_engineer` | Add environment-specific CSP/HSTS and security headers, image/source allowlists, no leaked source maps where prohibited, and server-only package handling. | Header/CSP tests pass without breaking maps/media/auth. |
| `apps/web/package.json` | MODIFY | 1 | `dependency_custodian` | Add approved DB/auth/schema/test/observability dependencies and complete scripts; no unreviewed broad upgrades. | Clean install/audit/build pass. |
| `apps/web/playwright.config.ts` | REWRITE | 7 | `test_reliability_engineer` | Add projects for desktop/mobile, authenticated operator fixtures, trace/video only on failure, deterministic DB reset, accessibility and security headers, and no shared production state. | Parallel tests are isolated and non-flaky across repeated runs. |
| `apps/web/public/demo/ATTRIBUTION.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `apps/web/public/demo/broken-paving-top.jpg` | RETAIN | 6 | `frontend_a11y_engineer` | Keep as explicitly labelled illustrative fixture; verify attribution, remove from production seed paths, and test that it can never be presented as community activity. | Asset checksum and attribution are recorded; production data import cannot promote it. |
| `apps/web/public/demo/garbage-street.jpg` | RETAIN | 6 | `frontend_a11y_engineer` | Keep as explicitly labelled illustrative fixture; verify attribution, remove from production seed paths, and test that it can never be presented as community activity. | Asset checksum and attribution are recorded; production data import cannot promote it. |
| `apps/web/public/demo/pothole-road.jpg` | RETAIN | 6 | `frontend_a11y_engineer` | Keep as explicitly labelled illustrative fixture; verify attribution, remove from production seed paths, and test that it can never be presented as community activity. | Asset checksum and attribution are recorded; production data import cannot promote it. |
| `apps/web/public/demo/storm-drain.jpg` | RETAIN | 6 | `frontend_a11y_engineer` | Keep as explicitly labelled illustrative fixture; verify attribution, remove from production seed paths, and test that it can never be presented as community activity. | Asset checksum and attribution are recorded; production data import cannot promote it. |
| `apps/web/public/source-dossiers/bancharedanda-landfill-service-life.png` | RETAIN | 2/8 | `database_engineer` | Treat as legacy public-source evidence. Import as approved legacy media with provenance and v1 proof binding; do not regenerate silently. | Checksum, source provenance, review date, and public availability are verified after import. |
| `apps/web/public/source-dossiers/central-kathmandu-drainage-capacity.png` | RETAIN | 2/8 | `database_engineer` | Treat as legacy public-source evidence. Import as approved legacy media with provenance and v1 proof binding; do not regenerate silently. | Checksum, source provenance, review date, and public availability are verified after import. |
| `apps/web/public/source-dossiers/dhangadhi-groundwater-shortage.png` | RETAIN | 2/8 | `database_engineer` | Treat as legacy public-source evidence. Import as approved legacy media with provenance and v1 proof binding; do not regenerate silently. | Checksum, source provenance, review date, and public availability are verified after import. |
| `apps/web/public/source-dossiers/nagdhunga-mugling-utility-poles.png` | RETAIN | 2/8 | `database_engineer` | Treat as legacy public-source evidence. Import as approved legacy media with provenance and v1 proof binding; do not regenerate silently. | Checksum, source provenance, review date, and public availability are verified after import. |
| `apps/web/styles/globals.css` | SPLIT/MODIFY LAST | 6 | `frontend_a11y_engineer` | After functional stabilization, split tokens/base/layout/components/pages; preserve visual regression and remove dead rules. Do not mix this with security workflow changes. | CSS build, visual smoke, responsive, contrast, reduced-motion, and overflow tests pass. |
| `apps/web/styles/refined.css` | MERGE/SPLIT | 6 | `frontend_a11y_engineer` | Consolidate into the structured style system or clearly scope it; remove duplicate/conflicting rules. | No cascade regressions in supported pages. |
| `apps/web/tailwind.config.ts` | REVIEW/MODIFY | 6 | `frontend_a11y_engineer` | Align content paths/tokens if Tailwind remains; remove unused or misleading config if CSS is primarily custom. | Production CSS contains expected classes and no accidental purge. |
| `apps/web/tests/public-experience.spec.ts` | REWRITE/EXPAND | 7 | `test_reliability_engineer` | Preserve useful coverage, migrate fixtures to the new contracts, and add negative, concurrency, privacy, failure, and accessibility cases for the owning module. | Test fails against the unsafe behavior and passes against the replacement; no network dependence unless explicitly integration-scoped. |
| `apps/web/tsconfig.json` | HARDEN | 1 | `dependency_custodian` | Enable strict compatible checks such as no unchecked indexed access where feasible and server/client boundary aliases; stage fixes rather than suppressions. | Typecheck passes without new blanket ignores. |
| `data/public-sources/nepal-civic-watch-2026.json` | MIGRATE/RETAIN PROVENANCE | 2 | `database_engineer` | Import into normalized source/provenance records with review dates and source snapshots/checksums; do not auto-publish without policy. | Every dossier has source, checked-at, recheck-at, evidence, and legacy binding. |
| `data/public-sources/onchain-receipt.json` | RETAIN AS LEGACY FIXTURE | 4/8 | `api_workflow_engineer` | Use as v1 proof regression fixture, record checksum, and avoid treating it as live production state. | v1 proof test passes from the frozen fixture. |
| `data/read-model/nagarik-signal.json` | ARCHIVE/MIGRATE | 2/8 | `database_engineer` | Treat as immutable legacy input. Copy to `data/legacy` with checksum, import deterministically, then exclude from production runtime/deploy. | Import count/hash report matches source; runtime has no write dependency. |
| `docs/assets/product-overview.png` | REGENERATE AFTER UI | 6/8 | `frontend_a11y_engineer` | Replace only after final production UX; label release/version and avoid real private data. | Screenshot matches current build and contains synthetic/approved content. |
| `docs/competitors.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/data-provenance.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/operating-model.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/privacy-and-safety.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/product-faq.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/product-walkthrough.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/research-notes.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/security-model.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `docs/why-solana.md` | UPDATE | 0/8 | `architecture_guard` | Reconcile documentation with the production architecture and remove claims that depend on the JSON model, shared secrets, session wallets, instant publication, or two-signal verification. | Every behavior claim is traceable to code/test/release evidence and explicitly labels v1 legacy behavior. |
| `idl/nagarik_signal.json` | RENAME/FREEZE V1 | 4 | `solana_v2_engineer` | Freeze as `nagarik_signal_v1.json` with checksum; generate separate v2 IDL. Maintain compatibility alias only if consumers require it. | Generated-artifact drift check passes and program IDs are distinct. |
| `package-lock.json` | REGENERATE ONLY | 1 | `dependency_custodian` | Regenerate only through reviewed `npm install` changes owned by the dependency custodian. Never merge competing lockfile branches. | `npm ci` succeeds in a clean checkout and audit evidence is stored. |
| `package.json` | REWRITE SCRIPTS/MODIFY DEPS | 1/7 | `dependency_custodian` | Add complete production scripts and workspace tooling; remove obsolete JSON/session-wallet scripts from release gates while keeping explicit v1 archive commands. | One `verify:release` command executes the complete local gate or clearly delegates to required services. |
| `programs/nagarik_signal/Cargo.toml` | RETAIN V1/MINIMAL WORKSPACE CHANGE | 4 | `solana_v2_engineer` | Preserve deployed v1 dependencies/layout; only compatibility/toolchain changes approved by ADR. | v1 account layout and tests remain unchanged. |
| `programs/nagarik_signal/src/errors.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1 semantics for historical verification; do not repurpose errors. | v1 build/test checksum evidence passes. |
| `programs/nagarik_signal/src/events.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1 events; new events belong to v2. | v1 tests pass unchanged. |
| `programs/nagarik_signal/src/instructions/add_steward.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | No semantic changes; v2 role management is separate. | v1 compatibility passes. |
| `programs/nagarik_signal/src/instructions/create_issue.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Do not retrofit global-counter/session semantics; implement new create path in v2. | v1 compatibility passes and v2 has no global counter. |
| `programs/nagarik_signal/src/instructions/initialize_registry.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1; v2 uses explicit protocol config. | v1 compatibility passes. |
| `programs/nagarik_signal/src/instructions/mod.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | No v2 exports here. | v1 build passes. |
| `programs/nagarik_signal/src/instructions/revoke_steward.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1; v2 role semantics separate. | v1 build passes. |
| `programs/nagarik_signal/src/instructions/update_status.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1 status semantics; never use as v2 contract. | v1 tests and historical proof pass. |
| `programs/nagarik_signal/src/instructions/verify_issue.rs` | RETAIN V1/DISABLE NEW USE | 4 | `solana_v2_engineer` | Preserve historical binary but exclude from new product write paths and label semantics as legacy signals. | No v2 code calls it; UI does not call legacy verification mutation. |
| `programs/nagarik_signal/src/lib.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Keep v1 program ID and entrypoints unchanged; add v2 as separate crate. | Program binary/IDL compatibility is documented. |
| `programs/nagarik_signal/src/state.rs` | RETAIN V1 | 4 | `solana_v2_engineer` | Freeze v1 account layout; add production state only in v2. | Account decoding fixtures remain valid. |
| `scripts/airdrop-relayer.ts` | DEV-ONLY/RENAME | 4/8 | `devops_observability_engineer` | Confine to explicit local/devnet profile and v1/v2 test payer; hard fail on mainnet or production environment. | Script cannot execute against production/mainnet. |
| `scripts/create-issue.ts` | ARCHIVE V1/ADD V2 TOOL | 4 | `solana_v2_engineer` | Rename legacy command and create v2 worker-compatible fixture tool with deterministic issue key and safe cluster checks. | Tool is idempotent and refuses production without explicit approved profile. |
| `scripts/create-stewards.ts` | REWRITE V2/SAFE | 4 | `solana_v2_engineer` | Use explicit v2 role instructions, authority custody checks, dry-run, and cluster/profile guard. | No raw key logged; role change is confirmed and audited. |
| `scripts/deploy-devnet.sh` | REWRITE | 4 | `devops_observability_engineer` | Deploy v2 only to explicit non-production cluster with program ID/checksum capture, build reproducibility, and no hidden key path. | Deployment artifact manifest is generated; mainnet is rejected. |
| `scripts/final-preflight.ts` | REWRITE AS RELEASE VERIFY | 7/8 | `integration_owner` | Verify schema migration, release ID, auth/RBAC, storage privacy, worker backlog, v1/v2 proof fixtures, headers, monitoring, restore evidence, feature flags, and zero known defects; no static count assumptions. | Produces machine-readable release evidence and fails on every missing gate. |
| `scripts/generate-source-dossiers.ts` | HARDEN/REVIEW | 2 | `database_engineer` | Generate only approved public derivatives with deterministic provenance and recheck metadata; no silent overwrite. | Generation records source/checksum/version and requires review before publication. |
| `scripts/import-public-sources.ts` | REWRITE | 2 | `database_engineer` | Import transactionally into submissions/issues/versions/provenance with dry-run, idempotency, review state, and checksum report. | Re-run is no-op and unsafe source is not published. |
| `scripts/lib/nagarikClient.ts` | REWRITE/SPLIT | 4 | `solana_v2_engineer` | Namespace v1 read-only and v2 admin/test clients; no session signer or implicit funding. | Client vector and integration tests pass. |
| `scripts/phase2-api-smoke.ts` | REPLACE/RENAME | 5/7 | `test_reliability_engineer` | Convert to v2 submission/media/public API contract smoke with private isolated fixtures. | Runs repeatably and cleans data. |
| `scripts/phase5-status-lifecycle-smoke.ts` | REWRITE | 5/7 | `test_reliability_engineer` | Exercise authenticated status/handoff/outbox/chain/reconciliation with deterministic fixture and rollback/cleanup. | No direct chain bypass; failure cases included. |
| `scripts/prepare-anchor-test.mjs` | MODIFY | 4 | `solana_v2_engineer` | Prepare separate v1/v2 IDLs/program IDs/test fixtures and verify no manual drift. | Both suites run from clean checkout. |
| `scripts/read-proof.ts` | REWRITE VERSIONED | 5 | `api_workflow_engineer` | Read and print v1/v2 proof components separately with stable JSON. | Matches API proof vectors. |
| `scripts/reindex.ts` | REPLACE WITH RECONCILE | 4/5 | `api_workflow_engineer` | Use DB chain bindings/outbox and bounded reconciliation; dry-run by default. | Repeated run converges and records discrepancies. |
| `scripts/seed-demo-data.ts` | TEST/DEV ONLY | 2 | `database_engineer` | Seed isolated local test database with explicitly labelled fixtures; never write production. | Environment guard and cleanup tests pass. |
| `scripts/sweep-session-balances.ts` | RETIRE | 4 | `api_workflow_engineer` | Remove after session-wallet funding path is deleted; preserve only in archived v1 recovery tooling if funds actually exist. | No runtime/session balance sweep is required in v2. |
| `scripts/update-status.ts` | REWRITE V2 | 4/5 | `api_workflow_engineer` | Invoke the domain/outbox path or create a test fixture; do not bypass DB transaction/audit. | CLI retry creates one logical status event and one chain event. |
| `scripts/verify-deployment.ts` | REWRITE | 7/8 | `devops_observability_engineer` | Validate exact release, minimal readiness, public routes, v1/v2 proof, safe tombstone, and headers without relying on private data or mutation. | Safe production smoke detects wrong build/schema/program. |
| `scripts/verify-issue.ts` | ARCHIVE V1 | 4 | `solana_v2_engineer` | Keep only for v1 regression; public signals are off-chain in v2. | No release docs instruct users to run v1 verification mutation. |
| `scripts/verify-proof-cli.ts` | REWRITE VERSIONED | 5 | `api_workflow_engineer` | Verify approved delivered bytes and v1/v2 commitments; support offline fixture mode and no truth claim. | Tamper tests fail precisely. |
| `scripts/verify-public-data.ts` | REWRITE | 2/8 | `database_engineer` | Verify imported provenance/public projections/media checksums/recheck dates and no private/sample leakage. | Large production-like fixture passes; deliberate leak fails. |
| `tests/nagarik_signal.ts` | RETAIN AS V1 + CLARIFY | 4/7 | `solana_v2_engineer` | Keep as historical v1 behavior test, rename if useful, and add separate v2 suite. Do not change expectations to pretend v1 is production semantics. | Both v1 legacy and v2 production suites pass independently. |
| `vercel.json` | REWRITE | 7 | `devops_observability_engineer` | Configure bounded internal cron routes for outbox, reconciliation, retention, and health with environment-safe protection and no public mutation endpoints. | At-least-once invocation is harmless through idempotency and worker routes reject unauthorized calls. |

---

## 13. New-file manifest

| New path | Wave | Owner | Purpose | Acceptance |
|---|---:|---|---|---|
| `docs/production/baseline-audit.md` | 0 | `architecture_guard` | Evidence-backed current defects and assumptions. | Every finding points to file/symbol/test or is labelled unverified. |
| `docs/production/threat-model.md` | 0 | `security_red_team` | Assets, actors, trust boundaries, abuse cases, controls, residual risks. | Maps to tests and monitoring. |
| `docs/production/architecture-contract.md` | 0 | `architecture_guard` | Frozen system boundaries, ordering, consistency, versions, data classification. | All workstreams sign off before implementation. |
| `docs/production/state-machines.md` | 0 | `architecture_guard` | Submission/media/publication/lifecycle/handoff/outbox/privacy states and transitions. | Exhaustive transition tests derive from it. |
| `docs/production/api-contracts.md` | 0 | `architecture_guard` | Versioned requests/responses/errors/auth/idempotency. | Contract tests generated or traceable. |
| `docs/production/release-criteria.md` | 0 | `integration_owner` | Zero-known-defect and external-gate criteria. | Final release manifest evaluates every item. |
| `docs/production/dependency-policy.md` | 1 | `dependency_custodian` | Version, license, audit, update, and ownership policy. | All new packages comply. |
| `docs/production/execution-log.md` | 0-8 | `integration_owner` | Wave decisions, commits, evidence, blockers. | No unsupported passing claim. |
| `docs/production/runbooks/*.md` | 7 | `devops_observability_engineer` | Incident, privacy removal, key compromise, RPC, DB, Blob, worker, rollback, restore. | Tabletop tests reference each runbook. |
| `docs/adr/0001-0006-*.md` | 0 | `architecture_guard` | Architecture decisions listed in wave 0. | Accepted before dependent code. |
| `rust-toolchain.toml` | 1 | `dependency_custodian` | Pinned reviewed Rust/Anchor-compatible toolchain. | Clean CI uses exact toolchain. |
| `.nvmrc` | 1 | `dependency_custodian` | Pinned Node runtime. | CI/local use same major/version policy. |
| `supabase/config.toml` | 1 | `database_engineer` | Local/staging Supabase configuration. | Reset/test commands are reproducible. |
| `supabase/migrations/0001_extensions_and_enums.sql` | 2 | `database_engineer` | Extensions, domain enums, helper types. | Migration and enum-transition tests pass. |
| `supabase/migrations/0002_identity_and_organizations.sql` | 2 | `database_engineer` | Profiles, organizations, memberships, roles. | Cross-org and role constraints/RLS pass. |
| `supabase/migrations/0003_submissions_and_media.sql` | 2 | `database_engineer` | Private submissions, tracking hashes, media/derivatives. | No public grants; lifecycle constraints pass. |
| `supabase/migrations/0004_issues_and_versions.sql` | 2 | `database_engineer` | Public issue projection, immutable versions, provenance. | Published projection invariants pass. |
| `supabase/migrations/0005_events_signals_handoffs.sql` | 2 | `database_engineer` | Signals, status, handoffs, checkpoints. | Append-only and sequence/hash constraints pass. |
| `supabase/migrations/0006_idempotency_and_chain_outbox.sql` | 2 | `database_engineer` | Idempotency, outbox, transactions, bindings, dead letters. | Crash/retry/concurrency tests converge. |
| `supabase/migrations/0007_audit_privacy_rate_limits.sql` | 2 | `database_engineer` | Audit, privacy requests, rate-limit buckets. | Append-only/privacy/RLS tests pass. |
| `supabase/migrations/0008_functions_triggers_rls.sql` | 2 | `database_engineer` | Transactional functions, immutable triggers, RLS. | Role matrix and mutation tests pass. |
| `supabase/migrations/0009_indexes_and_query_guards.sql` | 2 | `database_engineer` | Indexes, uniqueness, checks, query support. | EXPLAIN plans and load fixture meet gates. |
| `supabase/seed.sql` | 2 | `database_engineer` | Strictly local/test fixtures. | Cannot run in production profile. |
| `supabase/tests/*.sql` | 2/7 | `test_reliability_engineer` | pgTAP/RLS/constraint/migration tests. | All roles and invariants covered. |
| `apps/web/lib/env/schema.ts` | 1 | `dependency_custodian` | Typed validated environment. | Unsafe production config fails startup. |
| `apps/web/lib/auth/server.ts` | 2 | `authz_engineer` | Server auth/session access. | No client credential leak. |
| `apps/web/lib/auth/client.ts` | 2 | `authz_engineer` | Safe client auth helper only. | Contains public anon config only. |
| `apps/web/lib/auth/authorization.ts` | 2 | `authz_engineer` | Role and organization policy. | Negative matrix passes. |
| `apps/web/lib/auth/auditContext.ts` | 2 | `authz_engineer` | Actor/request attribution. | Every privileged action records actor. |
| `apps/web/lib/domain/*` | 0/3/5 | `architecture_guard/api_workflow_engineer` | State machines, schemas, errors, immutable DTOs. | Unit/property tests exhaust transitions. |
| `apps/web/lib/db/client.ts` | 2 | `database_engineer` | Server Postgres transaction client. | Pool/transaction/failure tests pass. |
| `apps/web/lib/db/repositories/*.ts` | 2 | `database_engineer` | Narrow repositories per aggregate. | No array scans or public/private mixing. |
| `apps/web/lib/db/transactions/*.ts` | 2 | `database_engineer` | Atomic idempotency/moderation/event/outbox functions. | Concurrency tests pass. |
| `apps/web/lib/services/submissions.ts` | 3 | `api_workflow_engineer` | Private submission orchestration. | 202/idempotency/privacy tests pass. |
| `apps/web/lib/services/moderation.ts` | 5 | `api_workflow_engineer` | Review/redaction/approval/rejection. | No prepublication leak. |
| `apps/web/lib/services/publication.ts` | 5 | `api_workflow_engineer` | Freeze version, create outbox, publish after confirm. | Partial failures converge. |
| `apps/web/lib/services/status.ts` | 5 | `api_workflow_engineer` | Lifecycle transitions and proof. | Sequence/idempotency/role tests pass. |
| `apps/web/lib/services/handoffs.ts` | 5 | `api_workflow_engineer` | Official follow-up append/checkpoint. | Evidence/state/hash tests pass. |
| `apps/web/lib/services/signals.ts` | 5 | `api_workflow_engineer` | Off-chain attention signal. | No lifecycle or personhood effect. |
| `apps/web/lib/services/proof.ts` | 5 | `api_workflow_engineer` | Versioned v1/v2 proof orchestration. | Tamper matrix passes. |
| `apps/web/lib/services/privacy.ts` | 5 | `api_workflow_engineer` | Withdrawal/removal/tombstone/export requests. | Public non-disclosure and audit pass. |
| `apps/web/lib/chain/outboxWorker.ts` | 4 | `api_workflow_engineer` | Lease/process/retry/dead-letter worker. | Crash/retry tests converge. |
| `apps/web/lib/chain/reconciler.ts` | 4 | `api_workflow_engineer` | DB/chain reconciliation. | Drift fixtures detected and repaired safely. |
| `apps/web/lib/chain/signer.ts` | 4 | `api_workflow_engineer` | Bounded worker signer adapter. | Unauthorized operations cannot sign. |
| `apps/web/lib/solana/v1/*` | 4 | `solana_v2_engineer` | Namespaced legacy read/proof code. | Historical fixture remains valid. |
| `apps/web/lib/solana/v2/*` | 4 | `solana_v2_engineer` | Generated types, PDA/instruction/read clients. | TS/Rust vectors and IDL checks pass. |
| `apps/web/app/api/v2/uploads/route.ts` | 3 | `media_privacy_engineer` | Private staged upload endpoint. | Adversarial upload suite passes. |
| `apps/web/app/api/v2/submissions/route.ts` | 3 | `api_workflow_engineer` | Private moderated submission endpoint. | Returns 202 tracking; no public write. |
| `apps/web/app/api/v2/submissions/[trackingId]/route.ts` | 3 | `api_workflow_engineer` | Capability-scoped safe tracking. | Wrong/revoked token reveals nothing. |
| `apps/web/app/api/v2/issues/route.ts` | 5 | `api_workflow_engineer` | Public cursor list. | Exact scalable query and public projection. |
| `apps/web/app/api/v2/issues/[publicId]/route.ts` | 5 | `api_workflow_engineer` | Public detail/tombstone. | No private data enumeration. |
| `apps/web/app/api/v2/issues/[publicId]/signals/route.ts` | 5 | `api_workflow_engineer` | Attention signal endpoint. | No verified status mutation. |
| `apps/web/app/api/v2/issues/[publicId]/proof/route.ts` | 5 | `api_workflow_engineer` | Versioned proof endpoint. | Tamper matrix passes. |
| `apps/web/app/api/operator/moderation/*` | 5 | `api_workflow_engineer` | Authenticated moderation APIs. | Role/audit/idempotency tests pass. |
| `apps/web/app/api/operator/issues/*` | 5 | `api_workflow_engineer` | Status/handoff/privacy operator APIs. | No shared secret/manual hash. |
| `apps/web/app/api/internal/outbox/process/route.ts` | 4/7 | `api_workflow_engineer` | Protected bounded worker trigger. | Unauthorized call rejected; duplicate cron safe. |
| `apps/web/app/api/internal/reconcile/route.ts` | 4/7 | `api_workflow_engineer` | Protected bounded reconciliation trigger. | Dry-run and convergence tests pass. |
| `apps/web/app/api/internal/retention/route.ts` | 3/7 | `media_privacy_engineer` | Protected staged-media/data retention cleanup. | Deletion and audit evidence pass. |
| `apps/web/app/api/health/live/route.ts` | 7 | `devops_observability_engineer` | Minimal liveness. | No dependency details leaked. |
| `apps/web/app/api/health/ready/route.ts` | 7 | `devops_observability_engineer` | Minimal readiness with release ID. | Wrong schema/program/backlog marks not ready. |
| `apps/web/app/operator/*` | 6 | `frontend_a11y_engineer` | Authenticated queues, review, issue, privacy, job diagnostics. | Role-specific E2E and a11y pass. |
| `apps/web/app/submissions/[trackingId]/page.tsx` | 6 | `frontend_a11y_engineer` | Private tracking page. | Capability and non-disclosure tests pass. |
| `apps/web/components/SignalButton.tsx` | 6 | `frontend_a11y_engineer` | Truthful attention signal control. | A11y/retry/semantics tests pass. |
| `apps/web/components/operator/*` | 6 | `frontend_a11y_engineer` | Split operator UI components. | No secret/manual hash/private leak. |
| `programs/nagarik_signal_v2/Cargo.toml` | 4 | `solana_v2_engineer` | New program crate. | Pinned build passes. |
| `programs/nagarik_signal_v2/src/lib.rs` | 4 | `solana_v2_engineer` | New program entrypoints and ID. | IDL/build/test pass. |
| `programs/nagarik_signal_v2/src/state.rs` | 4 | `solana_v2_engineer` | Config/role/issue/event accounts. | Size/rent/layout tests pass. |
| `programs/nagarik_signal_v2/src/errors.rs` | 4 | `solana_v2_engineer` | Precise v2 errors. | Every rejection path has test. |
| `programs/nagarik_signal_v2/src/events.rs` | 4 | `solana_v2_engineer` | Protocol events. | Event fields/version tested. |
| `programs/nagarik_signal_v2/src/instructions/*.rs` | 4 | `solana_v2_engineer` | Initialize, roles, issue, metadata, status, handoff, pause, authority. | Positive/negative/replay/concurrency tests pass. |
| `tests/nagarik_signal_v2.ts` | 4/7 | `solana_v2_engineer` | Exhaustive v2 Anchor suite. | All constraints and retries covered. |
| `idl/nagarik_signal_v1.json` | 4 | `solana_v2_engineer` | Frozen v1 generated artifact. | Checksum stored. |
| `idl/nagarik_signal_v2.json` | 4 | `solana_v2_engineer` | Generated v2 IDL. | Drift/program ID check pass. |
| `scripts/import-legacy-read-model.ts` | 2/8 | `database_engineer` | Dry-run/import/checksum legacy JSON. | Repeatable and reconciled. |
| `scripts/verify-migrations.ts` | 2/7 | `database_engineer` | Empty/upgrade/rollback-plan checks. | CI gate passes. |
| `scripts/process-outbox.ts` | 4/7 | `api_workflow_engineer` | Local/admin bounded worker CLI. | Idempotent and environment-safe. |
| `scripts/reconcile-chain.ts` | 4/7 | `api_workflow_engineer` | Dry-run reconciliation CLI. | Convergence report generated. |
| `scripts/verify-release.ts` | 7/8 | `integration_owner` | Complete release evidence gate. | Fails on any absent criterion. |
| `tests/integration/*.test.ts` | 3-7 | `test_reliability_engineer` | DB/API/media/outbox/fault integration. | Risk matrix covered. |
| `tests/security/*.test.ts` | 3-7 | `security_red_team` | Authorization/privacy/SSRF/replay/leak tests. | Known blockers regressions pass. |
| `tests/load/*.js` | 7 | `test_reliability_engineer` | Scalable read/write/worker smoke. | Thresholds and no correctness loss. |
| `tests/fixtures/*` | 2-7 | `test_reliability_engineer` | Synthetic, labelled, deterministic fixtures. | No real personal data or production dependency. |
| `.github/workflows/security.yml` | 7 | `devops_observability_engineer` | CodeQL/SAST/secrets/dependency/SBOM. | Least privilege and no high/critical. |
| `.github/workflows/db-migrations.yml` | 7 | `database_engineer` | Migration/RLS gates. | Empty and upgrade paths pass. |
| `.github/workflows/solana.yml` | 7 | `solana_v2_engineer` | Rust/Anchor v1/v2 checks and IDL drift. | Both versions pass. |
| `.github/workflows/codex-review.yml` | 7 | `devops_observability_engineer` | Optional read-only Codex PR review using committed prompt. | No auto-merge/write/deploy; key isolated. |
| `release-evidence/.gitkeep` | 8 | `integration_owner` | Directory convention for non-secret manifests. | Release report references immutable artifacts. |


---

## 14. Release evidence manifest

The final release must produce a machine-readable manifest resembling:

```json
{
  "releaseId": "immutable-build-id",
  "gitCommit": "40-char-sha",
  "databaseMigration": "0009",
  "schemaChecksum": "sha256:...",
  "webBuildChecksum": "sha256:...",
  "programs": {
    "v1": {"mode":"read-only","programId":"...","idlChecksum":"sha256:..."},
    "v2": {"cluster":"approved-profile","programId":"...","idlChecksum":"sha256:...","auditReport":"reference-or-null"}
  },
  "tests": {
    "unit":"pass",
    "db":"pass",
    "integration":"pass",
    "e2e":"pass",
    "accessibility":"pass",
    "security":"pass",
    "loadSmoke":"pass",
    "rustAnchor":"pass",
    "backupRestore":"pass"
  },
  "vulnerabilities": {"critical":0,"high":0,"moderate":0},
  "knownDefects": {"p0":0,"p1":0,"p2":0,"p3":0},
  "externalGates": {
    "webPenTest":"reference-or-blocked",
    "smartContractAudit":"reference-or-not-mainnet",
    "privacyLegalReview":"reference-or-blocked",
    "keyGovernance":"approved-or-blocked",
    "operatorTabletop":"reference-or-blocked"
  },
  "featureFlags": {
    "legacyMutations": false,
    "publicIntake": false,
    "v2Writes": true
  },
  "rollback": "tested-command-or-runbook-reference",
  "decision": "GO|CONDITIONAL_NON_PRODUCTION|NO_GO"
}
```

Do not store secrets, personal data, private URLs, or penetration-test exploit details in a public release manifest.

---

## 15. Final practical judgment

The quickest high-quality route is **not** to make the current JSON/shared-secret/session-wallet architecture look more polished. It is to preserve the working proof UI and legacy verifier while replacing the unsafe workflow core in a controlled versioned path.

The non-negotiable critical path is:

1. freeze contracts;
2. migrate to constrained Postgres and individual operator auth;
3. make media and submissions private until review;
4. add durable idempotency/outbox/reconciliation;
5. create Solana v2 without verification/session-wallet/global-counter semantics;
6. rebuild routes and UI against those contracts;
7. prove recovery, privacy, authorization, consistency, accessibility, and operations;
8. obtain independent human legal/security/contract review;
9. release only the scope that actually passed.

For the meetup, the honest winning posture is: **“This is the working prototype, these are the exact defects I found, and this is the production migration I will not fake overnight.”** That is more credible than falsely announcing zero issues.

# Production Baseline Audit

Status: confirmed baseline, production `NO_GO`  
Baseline commit: `237e8cd1c9c0b9ed3e504e52040a0f10e9a15d48`  
Baseline tag: `prototype-baseline`  
Production branch: `production-readiness`  
Audit date: 2026-07-31

## Scope and evidence rules

This audit describes the repository at `prototype-baseline`. File references in
this document refer to that tag even if later production work moves or removes
the cited code.

A finding is:

- **confirmed** when source, a command result, or a checked artifact proves it;
- **contradicted** when an existing check passes but encodes an unsafe
  production behavior;
- **missing evidence** when the required behavior has not been exercised;
- **external blocker** when automation cannot supply the approval.

The source plans remain unchanged in the private project archive and are not
part of the public release tree. Their recorded SHA-256 values are:

- original product plan:
  `6E34DC321C7B23BCBCF0C9BAC29520A18AD1D66C750C189C3AF982F4F1550018`;
- production readiness plan:
  `66E499C606D76E9FE3E09315DD624A53E6D01456EFEC28A576DA829CA9818EEF`.

## Honest release classification

The baseline is a devnet prototype. It is not a production system, public beta,
or operational municipal service. It may demonstrate public proof concepts and
historical v1 behavior. It must not claim:

- unrestricted production intake;
- verified unique citizens or truth;
- official government receipt or action without external evidence;
- production-grade privacy, authorization, availability, or recovery;
- mainnet readiness.

The selected production migration target is a curated, invite-only,
partner-operated pilot. No partner is assumed or named by the software. The
pilot remains non-production until the external gates in
`release-criteria.md` are satisfied.

## Reproduced baseline checks

| Check | Result | Interpretation |
|---|---|---|
| `npm ci` | passed | Lockfile installs, but install success is not a security gate. |
| `npm run typecheck` | passed | Current TypeScript types are internally consistent. |
| `npm run lint` | passed | Current lint rules pass. |
| `npm run test:unit` | 30/30 passed | Eight hard-coded legacy test files pass; several expectations encode prototype semantics. |
| `npm run verify:data` | passed | Current public-source/demo artifacts satisfy prototype checks. |
| `npm run build` | passed | Next.js prototype builds. |
| `npm run test:e2e` | 10/10 passed | Prototype browser flows pass; this is not the production risk matrix. |
| `npm audit --omit=dev --audit-level=moderate` | failed | Two high-severity production dependency findings were present: Next.js and PostCSS. |
| full `npm audit` | failed | Eleven high-severity findings including development dependency paths. |
| `cargo fmt --all -- --check` | failed | v1 formatting differs in `create_issue.rs` and `verify_issue.rs`; v1 must not be silently rewritten before its freeze decision. |
| `cargo clippy --workspace --all-targets -- -D warnings` | passed | Current Rust code has no clippy warning under this command. |
| `cargo test --workspace` | 2/2 passed | Default Rust tests pass. |
| `cargo test --workspace --all-targets --all-features` | failed | Anchor `#[program]` expansion panicked with `Safety checks failed: Failed to get program path`. |

## Confirmed release blockers

### P0 - private submissions are public before moderation

`apps/web/app/api/reports/route.ts` invokes `createIssueOnChain` before durable
application persistence, then creates an issue with
`safetyReviewStatus: 'visible'` (symbols near baseline lines 150 and 180).
Moderation is a later mutation. This violates private intake, moderation-first
publication, durable intent, and rollback safety.

Impact:

- unsafe or personal content can become public and committed before review;
- a chain success followed by a database failure can orphan the public proof;
- later rejection cannot erase the original public disclosure or chain event.

Required replacement: versioned private submission, immutable moderation
events, approved public version, durable outbox, confirmed commitment, then
public projection.

### P0 - private and public rows share lookup paths

`apps/web/app/api/reports/[id]/route.ts` calls the general `getIssue(id)`
repository directly. `apps/web/lib/db/queries.ts` uses a shared array model for
public, sample, and full-scope records. A guessed identifier can therefore
reach the same object shape used by operator and public code.

Impact:

- pending, rejected, removed, sample, or private fields can be enumerated;
- field omission becomes a route-by-route convention instead of a database and
  type boundary.

Required replacement: separate private repositories and explicit public views
whose row type has no private columns.

### P0 - operator queue is rendered before authentication

`apps/web/app/steward/page.tsx` loads moderation records and all handoffs before
any operator authentication and serializes them into the client
`StewardConsole`. This makes private/operator data available through page,
React Server Component, or client-prop responses even if mutation buttons later
ask for a secret.

Required replacement: authenticate and authorize before any private query;
server-only role-scoped operator repositories; no private queue data in
unauthenticated HTML/RSC/client props.

### P1 - operator authorization is a shared browser secret

Status and moderation routes read `x-nagarik-steward-secret` and compare it to
`NAGARIK_STEWARD_SECRET`:

- `apps/web/app/api/reports/[id]/status/route.ts`
- `apps/web/app/api/reports/[id]/moderation/route.ts`
- `apps/web/components/StewardConsole.tsx`

The UI asks an operator to type the shared secret and sends it from the
browser. There is no individual identity, organization scope, role
attribution, revocation history, or enforced MFA.

Required replacement: managed individual authentication, organization
membership, role policy, AAL2/MFA for privileged actions, RLS, and immutable
actor-attributed audit events.

### P1 - chain-first status and signal mutations

The status route accepts a caller-provided `proofHash` and calls
`updateStatusOnChain` before local persistence. The verification route calls
`verifyIssueOnChain` for a session-derived signer and allows the resulting
verification count to influence status.

Impact:

- callers can select commitment material;
- retries after timeout are ambiguous;
- anonymous sessions can consume relayer funds;
- attention signals are represented as verification/personhood-like state;
- database and chain can diverge.

Required replacement: server-canonical immutable event data, one database
transaction for idempotency/event/audit/outbox, a bounded worker, and an
off-chain signal that cannot change lifecycle.

### P1 - anonymous session wallet funding and local key material

`apps/web/lib/solana/server.ts` derives or writes session keypairs and transfers
lamports to keep them funded. The source checkout contained ignored
`data/session-keypairs/*.json` runtime key material. These files are not source
and were excluded from the production working copy.

Required replacement: no browser/session signer in v2; only a bounded service
signer may execute an already-authorized typed outbox operation.

### P1 - orphan media is allowed by absence of a linked issue

`apps/web/app/api/media/[file]/route.ts` asks
`mediaDisplayAllowed('/api/media/...')`. In
`apps/web/lib/db/queries.ts`, the baseline media lookup returns allowed when no
linked issue is found. Authorization therefore begins with allow for orphaned
objects.

The route also returns distinguishable `400`, `451`, `404`, and storage error
details. It resolves filenames rather than opaque database media IDs.

Required replacement: deny by default; resolve an opaque media ID to lifecycle
state and authorized relationship; return a neutral `404` on denial; proxy
bytes without exposing the storage URL.

### P1 - production configuration is not fail-closed

The baseline has scattered environment reads and a prototype readiness helper,
but no single validated environment schema that prevents startup under an
unsafe production profile. JSON storage, shared secrets, wrong cluster/program,
missing migrations, public Blob configuration, or stale recovery evidence can
still reach serving code.

Required replacement: typed startup validation plus explicit live, ready, and
authenticated diagnostics contracts.

### P2 - dedupe and aggregates depend on bounded list scans

`apps/web/app/api/reports/route.ts` performs duplicate-evidence detection over
`listIssues({ scope: 'public', limit: 100 })`.
`apps/web/app/api/dashboard/route.ts` also requests only 100 public rows.
`apps/web/lib/db/queries.ts` caps list results at 100 and performs in-memory
sort/filter/aggregate work.

Required replacement: indexed global hashes, exact SQL aggregates, and stable
cursor pagination.

### P2 - sessions and request material are persisted in the read model

The baseline schema and JSON model contain session identifiers, public keys,
hashes, and request-event metadata. `sessionHash` is an unkeyed SHA-256
construction, so low-entropy or leaked identifiers do not receive a
server-secret separation boundary.

Required replacement: raw token/session material never persists; server stores
versioned HMAC/keyed hashes only; logs and analytics use separate rotating
pseudonymous keys.

### P2 - media normalization is incomplete

`apps/web/lib/storage/sanitizeImage.ts` decodes and re-encodes images but does
not yet provide the required typed normalization contract, deterministic
orientation/color policy, animated/multipage rejection, actual resize to
maximum dimensions, decoded-output bounds, or exact stored-artifact naming.

Required replacement: stream and pixel bounds, orientation normalization,
actual resize, deterministic JPEG/WebP output, metadata stripping, exact-byte
hash, dimensions, and normalization version.

### P2 - request limits and forwarding identity can be bypassed

The baseline body-size helper trusts optional `Content-Length`, upload parsing
calls `formData()` before the file limit is fully enforced, and IP abuse keys
trust forwarded headers without a configured trusted-proxy contract. Chunked
or forged requests can bypass intended controls or create unbounded memory and
rate-limit behavior.

Required replacement: edge plus streaming byte limits, bounded multipart
parser, trusted deployment-proxy identity, and tests for missing/forged length
and forwarding headers.

### P2 - proof fetching is not constrained to an opaque media object

The proof path blocks cross-origin URLs but can accept configurable same-origin
paths and performs a large fetch plus RPC work from a public endpoint. A
misconfigured internal origin can therefore expand the request surface, while
concurrent proof requests can consume excessive resources.

Required replacement: resolve an approved public media ID directly; allowlist
the exact proxy route; reject redirects/private destinations; add bounded
timeouts, concurrency, cache, and rate/circuit controls.

### P2 - health and errors expose internal detail

The public health route combines RPC, relayer, storage, and readiness details.
Several API routes return raw `Error.message` values. Public health and error
responses therefore risk exposing configuration and dependency detail.

Required replacement: minimal liveness, minimal readiness, authenticated
diagnostics, stable error codes, request IDs, and redacted structured logs.

## Test and CI false-confidence findings

1. `package.json` hard-codes eight files in `test:unit`; new tests are not
   automatically discovered.
2. CI seeds and mutates the tracked read model before checking the repository
   state. It does not fail on generated drift.
3. The baseline CI has no Postgres service, migration tests, RLS matrix,
   immutable-trigger tests, fault injection, restore test, Rust/Anchor job,
   generated IDL drift gate, SAST, secret scan, SBOM, or load smoke.
4. Browser tests exercise the prototype and may use retries/live external map
   and Solana behavior. They do not prove deterministic production behavior.
5. The Anchor preparation path copies generated artifacts but does not prove
   source-generated IDL equality for both v1 and v2.
6. Production smoke can invoke endpoints that record request/rate-limit state,
   so it is not proven read-only.
7. Existing passing tests affirm session verification and shared-secret
   boundaries that v2 must retire. Passing those tests is compatibility
   evidence for v1, not production acceptance.
8. The public browser suite explicitly exercises the unauthenticated steward
   page, so a green result currently confirms an unsafe operator boundary.

## Repository and packaging findings

- The production plan inventory lists 200 current-file decisions and 87
  new-file entries/patterns.
- Before Wave 0, none of the new production manifest paths existed.
- The original product plan existed locally but was ignored. Wave 0 will track
  it byte-for-byte so its checksum and immutability are reviewable.
- Local ignored generated state included build outputs, browser artifacts,
  session keypairs, and local environment files. None may enter release
  artifacts.
- Docker and Vercel package boundaries require an explicit allowlist/denylist
  review; copying the repository broadly can include local state.
- The tracked v1 IDL and the generated baseline copy had the same observed
  checksum:
  `776832A8...32A61A`. Wave 4 must record the complete checksum and enforce
  drift automatically.

## Missing evidence

The baseline has no accepted evidence for:

- empty and upgrade database migration paths;
- RLS and cross-organization authorization;
- transactional idempotency under races;
- chain timeout-after-submit reconciliation;
- private media authorization and retention cleanup;
- v2 program account layout, replay resistance, or PDA vectors;
- backup and evidence restore from actual artifacts;
- rollback and canary thresholds;
- alert delivery;
- WCAG 2.2 AA manual checks;
- independent penetration test;
- independent Anchor audit for mainnet/high-stakes use;
- Nepal privacy/legal review;
- key custody and upgrade governance review;
- operator partner acceptance and incident tabletop.

## Baseline decision

`NO_GO` for production, public beta, unrestricted public intake, or mainnet
writes.

Work may proceed only under the frozen Wave 0 contracts. The next admissible
release profile is an explicitly scoped, invite-only, moderated, non-mainnet
curated pilot, and only after its applicable automated and human gates pass.

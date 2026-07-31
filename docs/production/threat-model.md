# Production Threat Model

Status: frozen and accepted for implementation  
Profile: curated invite-only pilot  
Model version: `threat-model-v1`  
Current decision: `NO_GO`

## Security objectives

1. Private intake, media, moderation, operator, and infrastructure data cannot
   be read by unauthorized parties.
2. Public content appears only after an attributable moderation decision,
   immutable version freeze, and required confirmed commitment.
3. Every mutation is attributable or capability-bound, idempotent, authorized,
   auditable, and recoverable.
4. Chain, database, storage, and public projection converge after partial
   failure without duplicate logical events.
5. Commitments are canonical and cannot be selected by an untrusted caller.
6. Public wording does not turn signals, hashes, or operator entries into false
   claims of personhood, truth, government action, or resolution.
7. Credentials, exact/private location, raw media identifiers, and tokens do
   not leak through code, logs, caches, errors, analytics, or build artifacts.
8. Operators can restrict access, correct public records, recover data, pause
   chain writes, and respond to incidents.

## Assets

### Civic and privacy assets

- private submission revisions;
- staged/original evidence and metadata;
- approximate private review location;
- tracking/intake capabilities;
- moderation notes, decisions, and redaction history;
- privacy requests and legal-hold status;
- approved public versions and correction/tombstone history.

### Integrity assets

- canonical metadata/evidence/location/event bytes and hashes;
- idempotency reservations;
- state-machine versions and expected heads;
- chain outbox operations and attempt history;
- v1/v2 program IDs, IDLs, PDA derivations, and bindings;
- audit events and operator attribution;
- source provenance and freshness.

### Operational and security assets

- managed-auth sessions and MFA assurance;
- organization memberships and role grants;
- database service role and connection credentials;
- storage credentials and private object keys;
- HMAC/cookie/rate-limit/log-correlation keys;
- v2 signer and upgrade authority;
- RPC credentials and spending limits;
- backups, restore artifacts, release manifests, alerts, and runbooks.

## Actors

| Actor | Trust level | Capabilities |
|---|---|---|
| anonymous browser | untrusted | read the public projection; establish intake/signal context only while presenting a valid invite capability |
| reporter with tracking capability | untrusted bearer | read/update one private submission within state and expiry |
| malicious reporter | hostile | malformed media, PII, false claims, duplicate/replayed requests, geography abuse |
| public reader/scraper | untrusted | enumerate IDs, cache content, apply load, inspect bundles/errors |
| moderator | trusted but fallible/possibly malicious | review private intake and approve/reject/redact within organization |
| steward | trusted but fallible/possibly malicious | append lifecycle/handoff evidence within organization |
| privacy reviewer | highly trusted but fallible/possibly malicious | verify privacy cases, restrict access, export, remove/tombstone within organization |
| auditor | trusted read-only | inspect restricted audit/reconciliation evidence |
| organization admin | highly trusted | manage membership and approved organization policy |
| system admin/operator | highly trusted | operate flags, workers, dead letters, incidents |
| service worker | narrow machine trust | lease typed jobs, sign allowlisted operations, reconcile, retain |
| cloud providers | dependency trust | managed auth, Postgres, storage, deployment, logs |
| Solana RPC/cluster | Byzantine/unavailable dependency | return stale/erroring data, accept/reject/confirm transactions |
| external authority/partner | outside platform trust | provide official receipt/reference or action evidence |
| supply-chain attacker | hostile | compromise dependency, action, build, package, or generated artifact |

Named operators are not treated as infallible. Least privilege, MFA, append-only
history, review, and monitoring limit insider and account-compromise impact.

## Trust boundaries

```text
Untrusted browser
  | HTTPS, origin, body/rate limits
  v
Next.js public/intake/operator APIs
  | typed validation, authz, transaction boundary
  v
Postgres + RLS ------------------------> private object storage
  |                                        |
  | typed durable outbox                   | opaque key, deny-by-default
  v                                        |
Bounded worker/custody adapter <-----------+
  |
  | allowlisted canonical operation
  v
RPC / Solana v2
  |
  | confirmed account/event reconciliation
  v
Public database projection -> public API/media proxy/CDN
```

Additional boundaries:

- client versus server-only module graph;
- public projection versus private repositories;
- interactive operator identity versus machine identity;
- v1 historical reads versus v2 production writes;
- application logs/analytics versus restricted security diagnostics;
- source repository/build context versus deployed artifact;
- application control versus external official receipt/legal decision.

## Current confirmed vulnerabilities

| ID | Severity | Baseline evidence | Consequence |
|---|---:|---|---|
| `B-001` | P0 | `apps/web/app/api/reports/route.ts` calls chain then stores issue as visible | private/unsafe report becomes public before moderation; orphan chain state |
| `B-002` | P0 | `apps/web/lib/db/queries.ts:mediaDisplayAllowed` allows unlinked media | leaked content-addressed filename grants orphan upload access |
| `B-003` | P0 | public report detail uses unrestricted `getIssue`; shared read model includes private/ops classes | enumeration and private-field serialization |
| `B-004` | P0 | `/steward` loads all records without auth and passes them to `StewardConsole` | operator queue/private evidence disclosure |
| `B-005` | P0 | create/verify/status call Solana before durable intent | DB/chain divergence and ambiguous retry |
| `B-006` | P0 | no production Postgres/RLS/auth/v2 runtime exists | required control plane absent |
| `B-007` | P1 | shared `NAGARIK_STEWARD_SECRET` is typed in browser | no individual identity, revocation, MFA, organization scope, or accountability |
| `B-008` | P1 | session keypairs are derived/stored and relayer-funded; v1 signals can change state | spending abuse and false personhood/verification semantics |
| `B-009` | P1 | list/dedupe/dashboard scans cap at 100 | duplicate acceptance and incorrect public aggregates |
| `B-010` | P1 | baseline readiness accepts JSON/shared-secret/session-wallet profile | unsafe deployment can report operational |
| `B-011` | P2 | status route accepts optional caller `proofHash` | attacker chooses commitment material |
| `B-012` | P2 | coordinates are only finite/rounded | out-of-scope publication, ward mismatch, privacy leakage |
| `B-013` | P2 | upload receipt has no persisted consumption/purpose nonce | replay and cross-purpose media use |
| `B-014` | P2 | public health and raw route errors expose dependency detail | reconnaissance and secret/path leakage |
| `B-015` | P2 | incomplete normalization/resize policy | metadata/privacy leakage and resource exhaustion |
| `B-016` | P2 | raw/unkeyed session material persists in prototype model | cross-dataset correlation and token risk |
| `B-017` | P2 | CI lacks DB/RLS/Rust/Anchor/security/restore/load gates | false release confidence |

Every `B-*` finding blocks production until replaced and covered by regression
tests. A read-only deployment flag reduces immediate write exposure but does
not close these defects.

## Threat register and controls

### Intake, privacy, and media

| Threat ID | Abuse/failure | Preventive controls | Detection/monitoring | Required tests |
|---|---|---|---|---|
| `T-001` | guessed ID exposes pending/rejected/private record | opaque IDs; separate public view/DTO; RLS; neutral 404 | denied private-read counter by route/class; leak canary | exact known IDs across states and roles; sentinel strings absent |
| `T-002` | orphan/leaked media filename grants bytes | opaque media ID; DB lifecycle authorization begins deny; private bucket; no redirect | denied media by lifecycle/reason; orphan count | same/wrong/no capability; unlinked/rejected/expired/removed objects |
| `T-003` | metadata, face, plate, text, or location discloses people | decode/re-encode; metadata removal; human redaction review; approved derivative | moderation reason counts; derivative mismatch alert | EXIF/GPS, face/plate/text advisory fixtures, malformed/animated images |
| `T-004` | decompression bomb or oversized upload exhausts runtime | streaming input limit; decoded-pixel/dimension/output bounds; timeouts | rejected bytes/pixels and processing latency | compressed bomb, oversized dimensions, slow/chunked input |
| `T-005` | receipt/token replay or theft accesses another submission | 256-bit tokens; keyed purpose/record binding; one-time DB consumption; no URL/log | replay/cross-binding counters; unusual capability failures | simultaneous consumption, wrong capability/purpose/media, expiry/revoke |
| `T-006` | exact/private location reaches public/chain/log | integer E6 input; exact E6-to-E3 private rounding; `grid-0.01deg-v1` cell/ward public object; allowlist DTO; delete private point | sentinel coordinate leak checks; public precision audit | float/range/Nepal/pilot/ward mismatch; negative half rounding; bundle/log/chain assertions |
| `T-007` | reporter submits emergency, personal, defamatory, or unsafe content | scoped categories/copy; private intake; human moderation; removal path | reason-category trends; urgent review queue | pending never public; rejection/removal/tombstone paths |
| `T-008` | cached private response appears to another user | `no-store`; Vary/auth policy; no static generation; neutral denial | cache header checks and sentinel leak alerts | two-session cache replay and post-removal retrieval |
| `T-039` | privacy request targets another organization/private submission | server-derived target organization; exact tracking capability for submission; same-org checks; neutral 404 | cross-org/target-binding denial | public/private target x capability x organization matrix |
| `T-040` | privacy export receipt is leaked, replayed, or consumed by a failed stream | 15-minute purpose/target/artifact binding; keyed verifier; no URL/cookie; single lease; consume only after successful stream | issue/lease/interrupt/replay/expiry audit | concurrent download, interrupted retry, wrong target/capability, expiry/revoke |
| `T-041` | live personal/private intake starts before legal approval | `EXT-003` dependency guard; live intake disabled; synthetic isolated fixtures only | startup/readiness and intake-enable attempt alert | every profile with missing/stale approval fails live intake |

### Authentication, authorization, and operator abuse

| Threat ID | Abuse/failure | Preventive controls | Detection/monitoring | Required tests |
|---|---|---|---|---|
| `T-009` | shared/compromised operator credential performs actions | individual managed auth; AAL2; no shared browser secret; revocation | auth failures, AAL downgrade, impossible role/action alerts | old secret/header/input fails; missing MFA denied |
| `T-010` | operator crosses organization/resource boundary | active membership; service checks; RLS; organization on every aggregate | cross-org denial metrics and audit review | exhaustive role x org x resource matrix |
| `T-011` | moderator/steward rewrites history | append-only tables/triggers; expected head; immutable audit | integrity/head mismatch alerts | UPDATE/DELETE denied; stale tab and concurrent append |
| `T-012` | org admin implicitly gains unrelated civic/system action | explicit action policy; no role inheritance by convenience | privileged action by role | negative permission matrix |
| `T-013` | public `/steward` or serialized props reveal queue | auth before data fetch; server-only private repositories; no client secrets | unauth operator-route access | direct HTML/RSC/API request and source-map inspection |
| `T-014` | CSRF or cross-origin site invokes operator/intake mutation | same-site cookies; CSRF/origin checks; content-type; idempotency | origin/CSRF failures | missing/wrong Origin, simple-form content type, replay |
| `T-042` | compromised runtime/database state enables a capability beyond release scope | validated static ceilings; disable-only DB switches; independent edge deny for public reads/media; fail-closed missing state | switch changes, cache invalidation, edge acknowledgment, effective-state drift | direct DB enable attempt, stale/malformed/missing switch, edge outage, static-disabled path |
| `T-043` | administrator lockout or recovery command becomes a privilege backdoor | no runtime bootstrap; one-shot empty-database bootstrap; offline two-person scoped recovery; no-last-admin/self-revoke rules; independent audit | bootstrap/recovery invocation and last-admin denial | second bootstrap, nonempty tables, application-role invocation, overbroad recovery manifest |

### Workflow, idempotency, and chain

| Threat ID | Abuse/failure | Preventive controls | Detection/monitoring | Required tests |
|---|---|---|---|---|
| `T-015` | duplicate requests create multiple logical records/events | scoped idempotency reservation in transaction; canonical hash; unique constraints | idempotency conflicts/replays/races | concurrent duplicates and same key/different payload |
| `T-016` | chain succeeds, app times out/fails to acknowledge | deterministic operation/event IDs; attempt history; reconcile before retry | submitted/unknown age; mismatch and reconciliation alerts | injected crash after send/before DB ack; one chain event |
| `T-017` | RPC timeout/error or Byzantine provider fabricates absence/finality | tri-state reads; errors never initialize; two independently operated providers must agree on pinned genesis, finalized signature, owner, immutable binding-event bytes, and reported finalized issue snapshot | per-provider error/latency/genesis/slot/byte disagreement; attempted-init-after-error invariant | timeout, stale/forged response, wrong genesis/cluster/owner, split providers, false absence |
| `T-018` | stale operator tab overwrites newer state | expected version/state/head; append-only event; conflict | stale-head conflict rate | concurrent transitions and stale retries |
| `T-019` | caller supplies proof/event hash | server canonicalization; schema rejects unknown/manual hash fields | rejected forbidden field count; DB/chain mismatch alert | manual hash rejected; cross-runtime vectors |
| `T-020` | worker signs arbitrary or expensive transaction | typed job allowlist; cluster/program/authority/compute/fee/spend bounds; simulation; circuit breaker | spend, simulation failure, unknown operation, signer pause | malformed job, wrong program/cluster/authority, fee/compute exceed |
| `T-021` | compromised signer or upgrade authority | custody adapter; least privilege; pause/role revoke; rotation/runbook; human governance | signer use and role/config changes | pause/revoke/rotate and unauthorized instruction tests |
| `T-022` | v1 semantics are silently reinterpreted as v2 | frozen checksums; namespaced clients; versioned proof/IDL/program IDs | IDL/program drift alert | historical v1 fixture plus distinct v2 vectors |
| `T-023` | signal Sybil count changes civic status | off-chain keyed signal; no lifecycle hook; neutral copy | signal velocity/abuse | many tokens/sessions; lifecycle and proof remain unchanged |
| `T-024` | handoff event fabricates authority acknowledgment or leaks a private reference | cycle/state policy; recipient-generated receipt/reference type; reviewed public projection; no low-entropy private-reference hash; append-only supersession | acknowledgment without approved evidence and reference-projection invariant | platform-only event, withheld reference, cycle race, correction/supersede, lifecycle unchanged |
| `T-044` | first caller seizes v2 protocol administration or stale admin writes overwrite authority/grants | compile-time non-default genesis authority; unique config PDA; starts paused; monotonic config/grant revisions; paused two-step transfer | initializer/admin failures and revision drift | wrong/default initializer, concurrent admin writes, transfer while unpaused, stale revision, unknown role bits |
| `T-045` | capability token can be replayed across purpose/org/subject or verifier compromise reveals tokens | strict token grammar; independent derivation/verifier keys; domain/purpose/key version and UUID bindings; constant-time comparison; expiry/revocation | parser/purpose/version failures and key-version incidents | cross-purpose/org/subject, malformed encoding, equal-key config, expired deterministic replay |

### Availability, data integrity, and operations

| Threat ID | Abuse/failure | Preventive controls | Detection/monitoring | Required tests |
|---|---|---|---|---|
| `T-025` | DB outage causes external side effect | DB transaction before outbox; fail closed | mutation failure and dependency status | DB fail at each transaction boundary; no chain write |
| `T-026` | Blob outage/orphan object loses DB relation | private staging prefix; provider-enforced 24-hour expiry; immediate cleanup; orphan deny; inventory sweeper | storage/DB mismatch, oldest staging object, lifecycle/sweep deletion failure | fail before/after storage; simultaneous DB and immediate-delete failure; lifecycle/sweep convergence |
| `T-027` | worker lease crash stalls or duplicates jobs | expiring lease; SKIP LOCKED; deterministic operation; bounded retry/dead letter | oldest age, leases, retries, dead letters | crash at every boundary and lease reacquisition |
| `T-028` | more than 100 rows corrupt dedupe/aggregates | indexed exact query; SQL aggregate; cursor | query latency/count reconciliation | seed well above cap and compare authoritative counts |
| `T-029` | backup exists but cannot restore DB/evidence or resurrects deleted data | encrypted backups; independently protected revocation/deletion ledger; isolated restore; post-snapshot replay; checksums; storage reconciliation | backup/ledger/restore-evidence age and replay watermark | actual old-snapshot restore, replay later removals/deletions, then public/private/RLS/proof checks |
| `T-030` | rollback leaves incompatible schema/chain state or stale public cache | expand/migrate/contract; independent origin/edge flags; cache purge; immutable release IDs; correcting chain event | canary thresholds, edge/origin state, purge result, rollback event | prior release redeploy; each flag disable; stale-cache denial; schema compatibility |
| `T-031` | health endpoint leaks internals or reports unsafe ready | minimal live/ready; authenticated diagnostics; fail-closed schema/profile checks | readiness reasons restricted; public payload scan | wrong DB/program/cluster/storage/flags/backup age |
| `T-032` | denial of service via list, proof, signal, upload, worker | indexed queries; cursor limits; rate limits; bounded fetch/worker/media; bounded-revalidation public cache | per-route saturation/error/latency, queue age | load smoke and correctness under limits |
| `T-046` | emergency privacy restriction is cleared against stale/removed content | privacy-reviewer-only overlay; exact case/version/state; terminal attributable no-removal decision; origin/edge denial and purge acknowledgment | overlay/purge state and stale-clear failures | moderator denial, stale version/decision, removal, edge outage, apply/clear races |

### Supply chain, SSRF, logs, and deployment

| Threat ID | Abuse/failure | Preventive controls | Detection/monitoring | Required tests |
|---|---|---|---|---|
| `T-033` | proof/media/source-reference fetch reaches internal or attacker-controlled infrastructure | proof/media use configured hosts or same-origin IDs; source/reference URLs use the credential-free bounded egress broker with per-hop DNS/address pinning, HTTPS-only redirects, decoded-byte/time limits, and no body persistence | blocked destination/redirect/encoding category and fetch latency | loopback/link-local/private/IPv4-mapped IP, DNS rebinding, redirect downgrade, compressed limit, timeout fixtures |
| `T-034` | dependency/action compromise enters build | pinned runtimes/actions; lockfiles; review; SAST/dependency/license audit; SBOM | audit and provenance gate | clean install, audit, lock drift, action permission scan |
| `T-035` | secrets/private data enter logs/errors/analytics | structured allowlist logger; redaction; no body/header logging; separate keys | sentinel leak scan; secret scanner | capture all failure paths with sentinel values |
| `T-036` | keypair/env/private read model enters deployment | allowlist build context; `.gitignore`/`.vercelignore`/Docker review; artifact scan | deployment manifest and secret scan | inspect archive/container/source maps for forbidden patterns |
| `T-037` | source map/client import exposes server module/credential | `server-only`; client dependency graph gate; no secret-prefixed public vars | bundle scan | build and search sentinel server-only values/paths |
| `T-038` | production smoke mutates real civic/abuse state | read-only synthetic endpoints/fixtures; isolated canary namespace | mutation audit from smoke identity | verify zero application mutation during smoke |

## Abuse cases

### Coordinated false reporting

The platform cannot cryptographically prove a civic claim is true. Controls are
private intake, scoped categories/geography, source attribution, moderation,
correction/removal, signal neutrality, rate limits, and transparent proof
limitations. Residual truth assessment is human and operational.

### Doxxing through evidence or location

The attacker uploads a face, plate, house, document, GPS metadata, or precise
point. Controls are metadata-free normalization, coarse public location, human
privacy review, redacted derivative, no raw original publication, rapid
restriction, privacy workflow, and retention deletion. Automated image
processing alone is insufficient.

### Operator collusion or compromised account

An operator approves unsafe content or fabricates a handoff/status. Controls
are individual MFA identity, scoped roles, append-only actor audit, immutable
version preview, evidence requirements, monitoring, correction/removal, and
separation between platform statements and official receipts. A curated pilot
still requires a named human review process.

### Infrastructure compromise

An attacker obtains database/storage/signer/service credentials. Controls are
least privilege, separate credentials/keys, secret manager, rotation, pause,
role revoke, immutable audit/chain evidence, encrypted backups, incident
runbooks, and provider security controls. Key custody remains an external human
gate.

## Security monitoring requirements

At minimum, restricted telemetry covers:

- intake/upload success, rejection category, bytes, pixels, and latency;
- moderation queue age and decision counts without private text;
- publication state duration and commit failures;
- idempotency replay/conflict/race;
- private/media authorization denials;
- operator auth, AAL2, role, organization, and stale-head failures;
- outbox pending/leased/submitted age, retries, dead letters, and mismatches;
- signer operation type, bounded spend, circuit breaker, and role/config change;
- RPC/DB/Blob latency/error categories;
- proof mismatch and unavailable dimensions;
- retention backlog, deletion retry, and legal-hold count;
- backup age and last successful isolated restore evidence;
- public health/readiness and release ID;
- rate-limit saturation and unusual signal velocity;
- privacy request state and overdue owner review without requester detail.

Alert delivery must be exercised. A dashboard without tested delivery is not
an operational gate.

## Residual risks and external gates

Automation cannot close:

- whether collection/publication/retention/removal/blockchain use complies with
  Nepal-specific law and policy;
- whether real operators can moderate safely and respond to incidents;
- whether v2 program and custody are independently secure enough for mainnet or
  high-stakes use;
- whether a third-party penetration test finds exploitable deployment issues;
- whether an external authority's receipt/reference is authentic;
- whether a public civic claim is true.

Required external evidence:

1. independent web/API penetration test;
2. independent Anchor audit before mainnet/high-stakes deployment;
3. Nepal privacy/legal review;
4. signer/upgrade/key custody governance approval;
5. named partner acceptance and incident/privacy/restore tabletop.

Until applicable evidence exists, the decision remains
`CONDITIONAL_NON_PRODUCTION` at best, with public intake and mainnet disabled.

## Review cadence

Review this threat model when:

- an API, data class, state, role, retention rule, or chain account changes;
- a new provider/dependency or public integration is added;
- intake scope expands;
- a privacy/security incident or near miss occurs;
- an external review produces findings;
- release profile changes from curated pilot toward public beta/production.

Every confirmed defect must receive a regression test, monitoring impact
decision, and linked fix before the release manifest can report zero known
defects.

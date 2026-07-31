# Production State Machines

Status: frozen and accepted for implementation  
Canonical version: `workflow-v2`

## Global rules

Each state machine is independent. A value in one machine must not be reused
as a value in another machine.

- Submission approval is not publication.
- Publication is not lifecycle resolution.
- A signal is not moderation, verification, or lifecycle.
- Handoff acknowledgment is not issue resolution.
- A chain transaction signature is not publication confirmation.
- Rejection is not a public lifecycle state.
- Removal does not delete immutable audit or neutral public correction history.

Transitions are performed by domain services in a database transaction. Every
external mutation requires:

- an authenticated actor or valid bounded capability;
- organization/resource authorization;
- an idempotency key;
- canonical request hash;
- expected current state/version/head;
- an append-only event and audit context;
- durable outbox intent in the same transaction when a chain checkpoint is
  required.

Ordinary roles cannot update or delete historical events.

## Submission

States:

```text
received -> under_review -> changes_requested -> revision_pending -> under_review
       \          |                                 \-----------> changes_requested
        \         |      \-> approved
         \        |      \-> rejected
          \       \------> withdrawn
           \-------------> withdrawn

received -> expired
changes_requested -> expired
revision_pending -> expired
under_review -> expired
```

`approved`, `rejected`, `withdrawn`, and `expired` are terminal for that
submission. A correction after approval is always a new immutable public
version under the same public issue ID, never a rewrite or a new submission.
A separate new observation may be submitted as a new issue, but it is not the
correction workflow.

| From | To | Actor | Required conditions | Atomic effects |
|---|---|---|---|---|
| none | `received` | intake capability | valid scope, schema, media receipt, geography, idempotency | consume receipt; create private submission; bind media; create promotion outbox; audit |
| `received` | `under_review` | moderator | AAL2, active membership, expected version, all current media `quarantined` | append moderation event; assign reviewer; audit |
| `under_review` | `changes_requested` | moderator | public-safe reason for citizen plus private note separation | append event; issue bounded tracking notification; audit |
| `changes_requested` | `revision_pending` | tracking capability | valid non-expired capability and replacement data/media | create immutable revision; consume receipts; create promotion outbox; append event; audit |
| `revision_pending` | `under_review` | media reconciliation worker | every current-revision media object is durably promoted and `quarantined`; immutable first-review deadline not elapsed | append system transition; preserve reviewer assignment/deadline; audit |
| `revision_pending` | `changes_requested` | media reconciliation worker | promotion failed | deny failed media; append safe re-upload request; preserve deadline; audit |
| `under_review` | `approved` | moderator | required fields reviewed; public preview and media derivative approved | append decision; freeze immutable public version; create non-public issue; create commit outbox; audit |
| `under_review` | `rejected` | moderator | reason code and private/public reason separation | append decision; revoke publication eligibility; schedule retention; audit |
| `received`, `under_review`, `changes_requested`, `revision_pending` | `withdrawn` | valid tracking capability or authorized operator | expected version; no completed publication | append event; revoke capabilities; deny media; schedule retention; audit |
| `received`, `changes_requested` | `expired` | retention worker | configured inactivity deadline, no legal hold | append system event; revoke capability; deny media; schedule deletion; audit |
| `under_review`, `revision_pending` | `expired` | retention worker | immutable first-review deadline reached, no scoped legal hold | append system event; revoke capability; deny media; schedule deletion; alert owner; audit |

The first transition to `under_review` sets `reviewDeadlineAt` to 30 days
later. Reassignment, requested changes, revision, or re-entry never moves that
deadline. An individually authorized scoped legal hold blocks the expiry
transition while active but never changes or restarts the deadline; if the
deadline has elapsed when the hold clears, expiry is immediately eligible.
Media reconciliation cannot return `revision_pending` to `under_review` after
that deadline; expiry wins under the same row lock.

Forbidden:

- approval without an approved public derivative when media is required;
- approval by a steward without the moderator role;
- reactivation of terminal rows;
- public reads in any submission state;
- overwriting submitted text, coordinates, media, or decisions.

## Media

States:

```text
private source:
  staged -> promotion_pending -> quarantined -> approved_private
     |             |                |               |
     |             +-> promotion_failed             +-> rejected
     |                              +-> rejected
     +-> rejected
     +-> expired -> deleted

public-candidate child:
  redacted_derivative -> approved_public -> removed -> deleted
            |
            +-> rejected
```

`redacted_derivative` is always a distinct public-candidate media row/object
linked to its private source, even when deterministic processing produces
identical bytes and hash. The source does not itself become public. A moderator
must explicitly approve a purpose-bound binding receipt; the consuming
version/event transaction changes and binds the derivative to
`approved_public`.

| From | To | Actor | Required conditions |
|---|---|---|---|
| none | `staged` | upload service | decoded/normalized within bounds; private object persisted; DB row and keyed receipt created |
| `staged` | `promotion_pending` | submission transaction/operator upload service | object bound to organization/purpose; deterministic durable-private promotion outbox created in the same DB transaction |
| `promotion_pending` | `quarantined` | media promotion worker | exact bytes/hash/length copied to unguessable durable-private key; destination row/pointer finalized before staging deletion; scanner findings attached |
| `promotion_pending` | `promotion_failed` | media promotion/reconciliation worker | staging object missing/expired or bounded retries exhausted; origin denied; audited change/re-upload path opened |
| `quarantined` | `approved_private` | moderator | bytes/hash/dimensions match; human privacy/safety review completed |
| `staged`, `quarantined`, `approved_private`, `redacted_derivative` | `rejected` | moderator | reason code; object immediately inaccessible except authorized retention/legal process |
| `staged` | `expired` | retention worker | unattached past 24-hour limit and no legal hold |
| `expired` | `deleted` | retention worker | storage deletion confirmed or retry intent persisted |
| `promotion_failed` | `deleted` | retention worker | staging/durable orphan deletion confirmed or retry intent persisted |
| `approved_private` | new `redacted_derivative` child | media service | deterministic public-candidate derivative created under a distinct row/object identity and linked to source; source remains `approved_private` |
| `redacted_derivative` | `approved_public` | version/event transaction | unexpired moderator-approved binding receipt consumed; exact derivative bound to one issue version or public event |
| `approved_public` | `removed` | privacy reviewer | removal event/tombstone committed; origin access revoked and cache purge started |
| `removed` | `deleted` | retention worker | policy deadline and no legal hold |

Access is a separate decision:

- `approved_public` is public only when its issue version is public-eligible;
- `quarantined` and `approved_private` require a bound tracking capability or
  authorized operator;
- `staged`, `promotion_pending`, `promotion_failed`, `redacted_derivative`,
  `rejected`, `expired`, `removed`, `deleted`, orphaned, or unknown remains
  denied to public callers; operator preview of a derivative is separately
  authorized and `no-store`;
- storage URL knowledge never grants access.

Every media object used by a submission, correction, status event, or handoff
must pass through durable promotion and `quarantined` before human approval.
`staged` means unattached private storage only; it can never transition
directly to `quarantined`, `approved_private`, or `approved_public`. A
submission with `promotion_pending` or `promotion_failed` media cannot enter
`under_review` or be approved.

## Publication

States:

```text
not_published -> commit_pending -> published -> superseded
                       |
                       +-> commit_failed -> commit_pending

published -> removed
superseded -> removed
```

| From | To | Actor | Required conditions | Atomic effects |
|---|---|---|---|---|
| none | `not_published` | approval service | approved submission; frozen immutable public version | issue/version rows exist but public view excludes them |
| `not_published` | `commit_pending` | approval/publication service | deterministic v2 operation created in same DB transaction | insert outbox; record expected binding |
| `commit_pending` | `commit_failed` | worker/reconciler | terminal/non-retryable attempt or retry policy exhausted | record append-only diagnostic/dead letter; alert; remain private |
| `commit_failed` | `commit_pending` | system admin | reviewed `retry_exact` authorization for the same immutable operation | append replay authorization; reschedule the deterministic operation without changing sequence, IDs, heads, or payload |
| `commit_pending` | `published` | confirmation service | required v2 account/event confirmed and hashes match frozen version | bind chain; set `published_at`; public view admits version; audit |
| `published` | `superseded` | correction/publication service | newer approved version is confirmed and published | append correction relation; retain old public proof/history |
| `published`, `superseded` | `removed` | privacy reviewer | authorized removal decision and neutral tombstone | revoke origin media/content access; expose tombstone and correction/removal metadata only |

No transition to `published` may depend only on a transaction signature,
submitted outbox state, or a client callback.

For a correction, the prior version stays `published` while the new version is
`commit_pending`; only finalized exact binding atomically makes the new version
`published` and the prior version `superseded`. Pending lifecycle and public
handoff events are operator-visible but absent from the public projection until
their checkpoints finalize. Removal revokes origin access and publishes a
neutral tombstone before its checkpoint so a chain outage cannot force unsafe
content to remain visible.

## Issue lifecycle

States:

```text
open -> in_progress -> resolved -> closed
  |          |            |
  +----------+------------+-> disputed
                         disputed -> open
                                  -> in_progress
                                  -> resolved
                                  -> closed

open -> closed
in_progress -> closed
```

| Transition | Role | Evidence/guard |
|---|---|---|
| `open` -> `in_progress` | steward | server-canonical reason/source; expected lifecycle head |
| `in_progress` -> `resolved` | steward | public note plus at least one approved evidence basis: approved public derivative or reviewed external public reference; source attribution; expected head |
| `open`, `in_progress`, `resolved` -> `disputed` | steward/moderator | dispute reason and source; no deletion of prior event |
| `disputed` -> valid target | steward | resolution of dispute plus reference to prior event |
| `open`, `in_progress`, `resolved`, `disputed` -> `closed` | steward | closure reason explicitly distinguishes administrative closure from resolution |

Rules:

- lifecycle starts `open` only when the issue is published;
- public signals cannot trigger a transition;
- a handoff event cannot trigger a transition automatically;
- `closed` may mean administratively closed and must display its reason;
- a resolution evidence basis is integrity/provenance evidence, not automatic
  proof that the real-world issue is resolved;
- terminal policy is enforced by expected state and transition table, not UI;
- every event has issue version, sequence, previous head, new head, actor,
  source/evidence basis, occurred-at time, and canonical hash.

## Authority handoff

States:

```text
(none | closed | failed) -> prepared -> sent -> acknowledged -> closed
                              |         |
                              +-------> failed
```

| From | To | Role | Required evidence |
|---|---|---|---|
| none, `closed`, `failed` | `prepared` | steward | new server-generated cycle ID, recipient class, intended channel, private draft basis |
| `prepared` | `sent` | steward | active cycle's carried channel and recipient class, sent timestamp, and reviewed dispatch evidence projected under the frozen public-evidence union |
| `prepared`, `sent` | `failed` | steward | failure category, observed time, non-sensitive diagnostic |
| `sent` | `acknowledged` | steward | configured external official reference/receipt type transformed into the frozen public-evidence union |
| `acknowledged` | `closed` | steward | frozen closure reason code; explicit statement that this is handoff closure |

The private aggregate has a gapless `sequence` and hash `head`; every accepted
handoff event advances both across all cycles, including `prepared`, `failed`,
and corrections. Only one cycle is active; `prepare` after `closed` or `failed`
creates a new UUID and later events copy it. Concurrency guards always use the
issue-level private aggregate plus active cycle ID. A checkpoint-required
handoff event reserves the next gapless `publicHandoffSequence`
transactionally before canonical hashing/outbox creation; it becomes public
only after FIFO finalization.
Prepared/failed events and their private-only supersessions never receive a
public sequence or chain event. A supersession of a finalized public event is
an append-only correction relation, not an aggregate state. It uses the
target's semantic event type and cycle, cannot rewrite current aggregate state,
and is itself checkpointed. Until it finalizes, the prior public event remains
current; afterward, it remains visible as superseded history. Dead letter
freezes the reservation and every later checkpoint, so no public-sequence gap
can be skipped.

`action_recorded` is an append-only evidence event, not a handoff state. It
is allowed only after `sent`, `acknowledged`, or `closed`, carries forward the
current recipient/channel, must name its source, and cannot set lifecycle
automatically.

## Chain outbox

States:

```text
blocked_by_predecessor -> pending -> leased -> submitted -> confirmed
                            |         |          |
                            +-------> retry <----+
                                         |
                                         +-> pending
                                         +-> dead_letter
```

| From | To | Actor | Guard |
|---|---|---|---|
| none | `pending` | domain transaction | issue-global sequence reserved; no unconfirmed predecessor; deterministic immutable payload |
| none | `blocked_by_predecessor` | domain transaction | issue-global sequence reserved; predecessor not yet confirmed |
| `blocked_by_predecessor` | `pending` | scheduler | every prior sequence confirmed and this is `confirmed + 1` |
| `pending`, `retry` | `leased` | worker | row lock; lease owner; lease expiry; bounded batch |
| `leased` | `submitted` | worker | simulation/policy passed; attempt and signature recorded |
| `leased`, `submitted` | `confirmed` | worker/reconciler | deterministic PDA/event exists and exact intended commitments/state match |
| `leased`, `submitted` | `retry` | worker/reconciler | retryable categorized failure or unknown timeout; attempt appended |
| `retry` | `pending` | worker scheduler | backoff elapsed; maximum attempts not exceeded |
| `retry` | `dead_letter` | worker | non-retryable result, invariant mismatch, or attempt/age limit exceeded |
| `dead_letter` | `pending` | scheduler after system-admin decision | AAL2 `retry_exact`; original immutable operation, sequence, predecessor, expected heads/count, IDs, and payload unchanged |

Lease expiry returns processing eligibility without erasing the prior attempt.
Before every submit, the worker checks whether the deterministic operation
already exists on-chain. `confirmed` is terminal except for append-only
reconciliation annotations. Dead-letter replay requires an AAL2 system-admin
`retry_exact` decision and never changes the original operation payload,
sequence, expected heads/count, event ID, or predecessor. A dead letter keeps
all descendants `blocked_by_predecessor`; no transition skips, cancels, rebases,
or reorders it. `acknowledge_freeze` appends the administrative decision and
leaves the operation in `dead_letter`; it is not a state-machine escape.

## Privacy request

States:

```text
received -> capability_or_identity_checked -> in_review
                                      |        |
                                      |        +-> fulfilled
                                      |        +-> partially_fulfilled
                                      |        +-> denied
                                      +-------> withdrawn
```

| From | To | Actor | Guard/effect |
|---|---|---|---|
| none | `received` | tracking capability/operator intake | minimum necessary request; private by default |
| `received` | `capability_or_identity_checked` | privacy reviewer | approved verification method; no unnecessary identity copy |
| `capability_or_identity_checked` | `in_review` | privacy reviewer | scope classified; legal hold and public/chain limitations identified |
| `in_review` | `fulfilled` | privacy reviewer | requested action completed; evidence and affected versions recorded |
| `in_review` | `partially_fulfilled` | privacy reviewer | immutable public/chain limitation and completed actions explained |
| `in_review` | `denied` | privacy reviewer | approved reason and review path recorded |
| non-terminal | `withdrawn` | requester capability/authorized operator | append withdrawal event; preserve minimum audit evidence |

If a credible privacy or safety risk requires immediate restriction, only an
AAL2 `privacy_reviewer` may apply the issue access overlay through the dedicated
contracted endpoint. A moderator may open/escalate a case but cannot change
public access. The restriction revokes origin access and starts edge/cache
purge before the request workflow completes.

Emergency restriction is a versioned access overlay
(`overlayVersion`, `public_access_revoked_at`, case, reason, audit reference),
not a silent media/publication state rewrite. Only a `privacy_reviewer` may
clear it, and only by referencing a terminal attributable
`no_removal_required` decision while the same approved public version remains
eligible. A terminal removal can never be cleared through the overlay path.

## Idempotency reservation

Reservation states:

```text
reserved -> completed
    |
    +-> retryable_failure -> reserved
    +-> terminal_failure
```

The reservation and logical mutation share one database transaction whenever
possible. If work is asynchronous, the completed response may represent
accepted durable intent rather than external completion.

Rules:

- scope = API version + operation + actor/capability/organization;
- key is a canonical caller-generated UUIDv4;
- canonical request hash includes every semantic input and excludes transport
  noise;
- same scope/key/hash returns the stored stable result;
- same scope/key with another hash returns conflict;
- expired records are removed only after the maximum client retry horizon and
  linked mutation retention permit it;
- raw bearer capabilities and secrets never enter the request hash stored for
  diagnostics.

## Transition implementation contract

Each transition implementation must have:

1. an exhaustive transition table or total function;
2. unit tests for every allowed and denied edge;
3. property tests for terminal-state and expected-head invariants;
4. database tests proving constraints/RLS/append-only behavior;
5. concurrency tests for duplicate keys and stale heads;
6. API contract tests for stable error mapping;
7. audit and monitoring assertions;
8. rollback/reconciliation behavior when an external dependency fails.

Adding a state or edge requires an ADR amendment, migration impact review, API
version review, UI copy review, and updated transition tests before merge.

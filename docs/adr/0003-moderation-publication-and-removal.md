# ADR 0003: Moderation, Publication, Correction, and Removal

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture, workflow, privacy

## Context

The prototype marks new reports visible before moderation and later edits a
mutable safety status. A Solana commitment may already exist before a reviewer
can reject or redact content. This ordering cannot protect private or unsafe
material.

## Decision

Submission is always private. Moderation appends decisions and immutable
revisions. Approval:

1. selects approved/redacted text, category, provenance, coarse location, and
   public derivative;
2. freezes an immutable public version;
3. creates/updates a non-public issue projection;
4. inserts deterministic v2 commitment intent in the same transaction;
5. waits for finalized, exact commitment reconciliation;
6. publishes the version through an explicit public projection.

The public issue lifecycle starts `open` at publication. Approval does not
itself mean published.

A correction creates another immutable approved version. After its required
binding is finalized, it becomes current and the prior version becomes
superseded. It retains the same public issue ID, records the source version,
uses a complete reviewed public object rather than a patch, and requires an
AAL2 moderator, idempotency, current-version precondition, optional
purpose-bound replacement media receipt, and deterministic metadata outbox
operation. The prior version stays public if the correction fails. History
remains visible according to policy.

Removal immediately denies content/media and creates a neutral tombstone with
safe reason category, time, and correction-history indicator. Removed content,
moderation notes, requester detail, and precise location are not repeated.
Existing chain commitments remain as hashes; copy explains that limitation
without exposing removed content.

## Operator decision rules

- Operators are individually authenticated at AAL2.
- Moderator, steward, privacy-reviewer, and organization-admin capabilities are
  separate action policies even when one user holds multiple memberships.
- Every decision records actor, organization, request, reason code, previous
  state, new state, and immutable event time.
- Private notes and public-safe messages are separate fields.
- Approval requires server-generated public preview and an approved derivative.
- Stale versions/heads fail; no last-write-wins decision.

## Invariants

- Pending, changes-requested, rejected, withdrawn, expired, commit-pending, and
  commit-failed versions are absent from public views.
- A public ID cannot enumerate a private submission.
- No transaction signature alone makes a version public.
- Ordinary roles cannot update/delete historical moderation or version rows.
- Removal and correction are append-only and auditable.
- A valid hash proves integrity only, not truth or official acceptance.

## Rejected alternatives

- **Publish then moderate:** initial disclosure and chain commitment are
  irreversible.
- **Mutable public row:** cannot prove which content was approved or committed.
- **Delete removed row without tombstone:** breaks accountability and allows
  confusing dangling proof references.
- **Treat moderation rejection as lifecycle `rejected`:** conflates private
  intake with a published civic issue.

## Verification

- exact known-ID pending/rejected/removal disclosure tests;
- publication failure at each DB/worker/RPC boundary;
- immutable version and correction tests;
- role/MFA/cross-organization/stale-tab tests;
- removal media/cache/CDN behavior;
- UI copy tests distinguishing approval, commitment, publication, lifecycle,
  handoff, and truth.

## Rollback

Disable publication/operator mutation flags and redeploy the prior release.
Published chain state is corrected by append-only superseding commitments, not
destructive rollback.

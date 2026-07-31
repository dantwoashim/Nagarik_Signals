# Operator Tabletop

## Purpose

Exercise the human decision path for a privacy incident, dependency failure,
signer concern, restore, and rollback. This tabletop is an external human gate;
automated tests cannot mark it passed.

## Participants

Name an incident commander, system administrator, privacy reviewer, moderation
owner, service owner, communications owner, and independent observer. Record
which roles share a person and why.

## Scenario Sequence

1. A published image is reported as containing sensitive information while a
   cached copy is still reachable.
2. The primary RPC times out after a v2 transaction may have been submitted.
3. Operator diagnostics show a blocked descendant and one dead letter.
4. The current deployment must be rolled back while the database contains
   forward-compatible migrations.
5. The latest backup predates a privacy removal and deletion-ledger entry.

For each inject, require the team to state severity, owner, stop condition,
capability changes, provider action, evidence retained, user-facing behavior,
and the exact condition for resuming service. Walk the relevant runbook; do not
perform mutations against real civic records.

## Pass Criteria

- Private reporting and escalation channels are known and reachable.
- Two people can locate release, schema, program, outbox, and alert evidence.
- The team disables the correct capabilities without deleting durable intent.
- Timeout-after-submit is reconciled rather than retried blindly.
- Privacy restriction precedes investigation and cache denial is verified.
- Restore remains isolated until post-snapshot deletion/revocation replay.
- Rollback keeps confirmed chain history and forward-compatible schema.
- Every decision has one owner, one deadline, and one independent reviewer.

## Evidence

Retain the scenario version, date, participant role references, decision log,
timings, missed steps, corrective owners, and reviewer decision in the approved
restricted system. The public release evidence stores only the opaque review
reference and pass/blocked status. Any missed stop condition keeps the external
operator-tabletop gate blocked until a focused rerun passes.

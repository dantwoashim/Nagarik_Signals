# Incident Response

## Trigger

Open an incident for suspected private-data exposure, authorization bypass,
proof or chain mismatch, duplicate logical events, unknown signer activity,
dead-lettered publication, destructive operator action, or an outage outside
the approved canary envelope.

## Roles

- Incident commander owns severity, decisions, and the timeline.
- System administrator owns capability controls and deployment actions.
- Privacy reviewer owns exposure and removal decisions.
- Service owner investigates the failing database, Blob, RPC, auth, or web path.
- Independent reviewer confirms recovery evidence before closure.

One person may fill several response roles, but the final reviewer must be a
different person from the operator who performed recovery.

## Immediate Containment

1. Create a restricted incident record and note the release SHA and UTC time.
2. Preserve logs by request/trace ID. Do not copy raw civic content into chat or
   a public issue.
3. Disable the narrowest affected capability. For uncertain scope, disable
   `inviteIntakeEnabled`, `inviteSignalsEnabled`, `publicationEnabled`, and
   `v2WritesEnabled` first.
4. Disable `operatorMutationsEnabled` if operator identity, authorization, or
   audit integrity is uncertain.
5. For possible public exposure, apply the provider edge deny, purge cached
   public responses, then disable `publicMediaEnabled` and
   `publicReadEnabled` with the purge reference.
6. Stop workers when signer behavior, ordering, or reconciliation is uncertain.

## Investigation

Capture the first bad request, affected resource IDs, outbox sequence, database
transaction, Blob object ID, Solana signature/account, and deployment ID as
applicable. Compare each value to the immutable release and expected program,
cluster, schema, and IDL. Run reconciliation in read-only mode:

```bash
npm run chain:reconcile -- --limit=25
```

Do not use `--apply` until the incident commander approves the exact repair.

## Stop Conditions

Keep affected capabilities disabled if any private response remains cached, a
proof dimension disagrees, an outbox descendant is blocked, signer activity is
unexplained, alert delivery fails, or the release identity is uncertain.

## Recovery And Exit

Restore from the last known-safe state, apply a reviewed fix, and run the
relevant regression, database, security, build, and deployment gates. Re-enable
one capability at a time. Close only after the independent reviewer confirms
containment, reconciliation, alert delivery, retained evidence, and a written
follow-up owner.

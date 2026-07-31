# Release Rollback

## Trigger

Rollback on any private-data leak, authorization failure, proof mismatch,
duplicate logical event, unknown signer action, schema/program/release mismatch,
failed alert, failed recovery evidence, or approved canary threshold breach.

## Procedure

1. Record the current and previous immutable 40-character release SHAs.
2. Disable intake, signals, publication, v2 writes, and operator mutations.
   Disable public read/media only when the incident affects served content; use
   provider edge deny and cache purge first.
3. Stop workers and capture pending, submitted-unknown, blocked, and dead-letter
   outbox state. Do not delete or reorder jobs.
4. Redeploy the previous immutable release. Do not reverse a confirmed Solana
   event or run destructive schema rollback. Migrations must remain compatible.
5. Verify release identity, health, schema, public read, one known proof, cache
   purge, and private denial.
6. Run dry reconciliation. Repair only an exact observed event with reviewed
   `--apply`; otherwise keep descendants blocked.
7. Re-enable the minimum safe read capability. Write capabilities remain off
   until the incident decision explicitly clears them.

## Evidence

Save non-empty `deploymentLog`, `cachePurgeLog`, and `reconciliationLog` files.
The private drill JSON uses kind `rollback`, environment `staging` or `canary`,
`releaseId` and `rollbackFromReleaseId` equal to the candidate release, and a
different `rollbackToReleaseId`. Every required disable, release, schema, cache,
read, proof, and reconciliation check must be true.

```bash
npm run ops:verify-evidence -- --kind rollback --input release-evidence/private/rollback.json
npm run verify:deployment -- --url https://deployment.example --expected-sha <rollback-to-sha>
npm run verify:release:report
```

## Exit Criteria

The previous release is identified at the public health endpoint; schema is
compatible; public and proof reads match; cache purge is verified; outbox state
is reconciled or explicitly frozen; alerts work; and a reviewer different from
the rollback operator signs the drill record.

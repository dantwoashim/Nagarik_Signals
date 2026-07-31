# Backup And Isolated Restore

## Purpose

Prove that an actual database backup and approved media/deletion evidence can be
restored without exposing stale private data or serving an isolated recovery
environment publicly.

## Preconditions

- Name the operator and a different reviewer.
- Bind the drill to the exact 40-character release SHA.
- Create an isolated restore environment with public ingress, email, workers,
  webhooks, custody, and Solana writes disabled.
- Obtain a real database backup, media inventory/manifest, and deletion or
  revocation ledger. Do not use synthetic empty files.

## Restore Procedure

1. Record checksums and byte counts before restoring anything.
2. Restore the database into the isolated environment and apply only the
   documented forward-compatible migration path.
3. Reconcile storage inventory against database object IDs and hashes. Keep raw
   objects private.
4. Replay every post-snapshot revocation, removal, tombstone, deletion-ledger,
   and legal-hold event before enabling any read path.
5. Verify schema identity, RLS matrix, private denial, public projection,
   tombstones, proof bindings, and zero public traffic.
6. Save the database backup, media manifest, deletion ledger, and restore log as
   four non-empty files. Record each exact SHA-256 and byte count in the private
   drill JSON.

The evidence must use schema `nagarik-operational-drill-v1`, kind
`backupRestore`, environment `isolated_restore`, two distinct references,
ordered UTC timestamps, a future approved `validUntil`, all required checks set
to `true`, and artifact kinds `databaseBackup`, `mediaManifest`,
`deletionLedger`, and `restoreLog`.

## Verification

```bash
npm run ops:verify-evidence -- --kind backupRestore --input release-evidence/private/backup-restore.json
npm run verify:release:report
```

The verifier reads each artifact relative to the private JSON, recomputes bytes
and SHA-256, writes a sanitized report, and marks the release gate pass or fail.
It does not perform the restore and cannot replace the independent reviewer.

## Stop And Exit

Destroy or retain the isolated environment under the approved evidence policy;
never promote it directly. The drill fails if any artifact is empty, a hash or
release differs, RLS/private denial fails, ledger replay is incomplete, storage
does not reconcile, traffic isolation is uncertain, or evidence expires.

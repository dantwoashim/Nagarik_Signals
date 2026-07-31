# Production Runbooks

These procedures apply to the `curated_pilot_v2_non_mainnet` profile. They are
operating instructions, not evidence that a drill or external review passed.

## Runbooks

- [Incident response](incident-response.md)
- [Privacy restriction and removal](privacy-removal.md)
- [Signer or key compromise](signer-key-compromise.md)
- [Dependency outage](dependency-outage.md)
- [Backup and isolated restore](backup-restore.md)
- [Release rollback](release-rollback.md)
- [Operator tabletop](operator-tabletop.md)

## Shared Rules

1. Record the release SHA, environment, UTC start time, incident or drill ID,
   operator, reviewer, and every request ID.
2. Keep personal data, credentials, cookies, raw media, private notes, and
   exploit details in the approved restricted case system.
3. Treat a missing or ambiguous dependency result as unsafe. Do not convert it
   to a pass.
4. Use a new UUIDv4 `Idempotency-Key` for each intended mutation. Replay the
   same key only when retrying the exact same request.
5. A public-read or public-media switch change requires a completed provider
   cache purge and its operation reference.
6. A release stays `NO_GO` until the release manifest and applicable external
   gates pass.

## Capability Control

An AAL2 `system_admin` changes one switch through:

```http
PATCH /api/operator/capabilities/{capability}
Origin: https://approved-origin.example
Idempotency-Key: <uuid-v4>
Cookie: <managed AAL2 session>
Content-Type: application/json

{
  "schemaVersion": "capability-switch-v1",
  "disabled": true,
  "expectedVersion": 4,
  "reason": "Incident INC-204 containment",
  "cachePurgeReference": null
}
```

The capability must be one of `publicReadEnabled`, `publicMediaEnabled`,
`inviteIntakeEnabled`, `inviteSignalsEnabled`, `operatorMutationsEnabled`,
`publicationEnabled`, or `v2WritesEnabled`. Read the current version from the
authenticated operator diagnostics endpoint. For public read/media changes,
replace `cachePurgeReference` with the provider's completed purge reference.

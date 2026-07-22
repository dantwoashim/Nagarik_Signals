# Data Provenance

Every Nagarik Signal issue has an explicit `recordKind`. Public totals include only community reports and public-source dossiers.

## Record Classes

### Community report

A server-session report with sanitized evidence and an approximate location. The platform records the supplied description; it does not certify physical truth.

### Public-source dossier

A checked official or reputable publication with:

- publisher and source title;
- original URL;
- publication, check, and expiry times;
- source type and confidence;
- status at check;
- official escalation URL;
- a generated dossier image whose exact bytes are hashed and anchored.

### Illustrative sample

Synthetic interface data. Samples have local integrity hashes, use `seeded_demo`, and never contribute to public civic totals.

### QA fixture

Historical smoke-test activity retained for engineering traceability. Fixtures cannot enter public list APIs, maps, dashboards, or leaderboards.

## Checked Source Set

The source manifest is [`data/public-sources/nepal-civic-watch-2026.json`](../data/public-sources/nepal-civic-watch-2026.json). The generated evidence artifacts are under [`apps/web/public/source-dossiers`](../apps/web/public/source-dossiers). Full issue PDAs, transaction signatures, evidence hashes, and metadata hashes are recorded in [`data/public-sources/onchain-receipt.json`](../data/public-sources/onchain-receipt.json).

| Issue | Publisher | Review expiry |
|---:|---|---|
| 12 | The Kathmandu Post | 2026-07-28 12:00 NPT |
| 13 | Kathmandu Metropolitan City - Metro News | 2026-07-28 12:00 NPT |
| 14 | Kathmandu Metropolitan City - Metro News | 2026-08-13 12:00 NPT |
| 15 | The Kathmandu Post | 2026-07-28 12:00 NPT |

The expiry is a review deadline, not a predicted resolution date.

## Reproducibility

Render the dossier artifacts:

```bash
npm run sources:render
```

Import or refresh them on devnet:

```bash
npm run sources:import
```

Import performs chain writes and requires the configured relayer. Run it only after reviewing source changes. Any change to committed metadata or image bytes produces a different hash and must create or update a traceable receipt rather than silently replacing the prior claim.

## Recheck Procedure

1. Open the original source and any listed corroborating URLs.
2. Look for a dated official or reputable update.
3. Record the new check time and state without rewriting the earlier source claim.
4. Attach a steward status update when the new evidence supports one.
5. Keep `needs_recheck` when the current state cannot be established.

Social posts can trigger a recheck, but cannot by themselves upgrade a record to high-confidence civic evidence.

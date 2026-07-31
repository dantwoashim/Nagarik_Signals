# Release Defect Triage

This procedure produces the known-defect evidence consumed by the release
verifier. A passing test suite is input to the review, not a substitute for it.
Do not create a zero-count artifact until the review is complete.

## Review scope

Review the exact immutable release commit, the baseline findings `B-001`
through `B-017` in [the threat model](threat-model.md), new failures and
warnings from clean CI, open security reports, accessibility findings,
operational drill findings, and discrepancies between public claims and
implemented behavior.

The review owner and reviewer must be different people. References may be
private ticket or report IDs; do not place exploit details or personal data in
the repository.

## Procedure

1. Record the 40-character release commit and the clean CI run URL.
2. Re-evaluate every baseline finding against the current code and its named
   regression evidence.
3. Assign each confirmed finding an ID, severity, owner, status, and evidence
   reference.
4. Mark a defect closed only when its fix commit and regression test both pass
   on the release commit.
5. Confirm that deferred work is an enhancement and does not contradict the
   release profile or public claims.
6. Have the independent reviewer reconcile the defect list and severity counts.
7. Store the signed review in restricted evidence storage and place only the
   sanitized count artifact at `artifacts/release/known-defects.json`.

## Severity policy

| Severity | Meaning                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| `P0`     | active privacy, authorization, integrity, custody, or irreversible data-loss risk      |
| `P1`     | release-blocking correctness, security, recovery, or public-claim failure              |
| `P2`     | material accessibility, operability, abuse-resistance, or degraded correctness failure |
| `P3`     | lower-impact defect that still affects a release criterion                             |

Every open `P0` through `P2` blocks release. A `P3` blocks release when it
affects correctness, privacy, security, accessibility, operability, or public
claims.

## Sanitized artifact

The release verifier reads the four severity counts. Keep the additional
review fields so a human can trace how those counts were established.

```json
{
  "schemaVersion": "nagarik-known-defects-v1",
  "releaseId": "0123456789abcdef0123456789abcdef01234567",
  "reviewedAt": "2026-07-31T00:00:00.000Z",
  "ownerReference": "restricted:release-owner-record",
  "reviewerReference": "restricted:independent-review-record",
  "evidenceReferences": [
    "https://github.com/dantwoashim/Nagarik_Signals/actions/runs/00000000000",
    "restricted:defect-review-report"
  ],
  "p0": 0,
  "p1": 0,
  "p2": 0,
  "p3": 0
}
```

Replace every example value. The artifact is stale if its `releaseId` differs
from the candidate commit or if any referenced review predates a material
change.

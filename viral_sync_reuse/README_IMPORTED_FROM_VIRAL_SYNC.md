# Viral Sync Reuse Bundle

Imported on 2026-07-07 from `D:\viral-sync-main`.

This folder is a reference/import bundle for building Nagarik Signal. It is not
the active Nagarik implementation and does not change
`D:\Nagarik_Signals\nagarik_signal_master_plan.md`.

## Purpose

Use these files as reusable patterns for:

- Solana PDA and duplicate-prevention design.
- Receipt/nullifier/settlement proof verification.
- SDK proof helpers and artifact verification.
- Civic route, ledger, verifier, and proof-panel UI patterns.
- Claim-safety scans and artifact assertion scripts.
- Judge-facing docs for limitations, verification, and submission readiness.

## Important Boundaries

- Do not claim these files prove Nagarik issue reports.
- Do not claim Nagarik has `Issue`, `Verification`, or `StatusUpdate` PDAs until
  the `nagarik_signal` program implements them.
- Do not reuse Viral Sync merchant, reward, campaign, or settlement language in
  public Nagarik copy.
- Treat files under `proof_artifact_examples/` as examples only. They are Viral
  Sync proof artifacts, not Nagarik Signal artifacts.
- Avoid copying `dist/` or generated auditor packets into the Nagarik product.

## Recommended Use

Build Nagarik as the clean product home, then adapt selectively:

1. Create a sibling Anchor program named `nagarik_signal`.
2. Port only the PDA, SDK, verification, and artifact-gating patterns that fit
   the master plan.
3. Keep Nagarik public copy centered on public issue proof, citizen
   verification, status timelines, and Days Ignored.
4. Keep Janamat, identity, government, mainnet, and production-readiness claims
   explicitly labeled as roadmap/specification until implemented.


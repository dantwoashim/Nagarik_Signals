# Submission Checklist

## Required Before Submission

- Run `npm run claims:scan`.
- Run `npm run civic:assert-routes`.
- Run `npm run civic:assert-artifacts`.
- Run `npm run civic:verify-receipt`.
- Run `npm run lint --workspace app`.
- Run `npm run build --workspace app`.
- Run `npm run build --workspace viral-sync-sdk`.
- Run `cargo check --manifest-path programs/viral_sync/Cargo.toml`.
- Run `npm run test:protocol`.
- Run `npm run frontier:assert-final`.

## Demo Assets

- Record a demo under 3 minutes.
- Show the market route first.
- Show verifier and ledger routes before discussing technical depth.
- Open at least one civic JSON artifact.
- Open `/receipt/[id]` for civic receipt copy.
- Open `/proofs/civic-proof-sidecar.json` for source hash bindings.
- Open `/proofs/civic-fraud-gauntlet.json` for replay evidence.

## Claim Discipline

- Do not claim live municipal source integration.
- Do not claim private identity proofs are live.
- Do not claim real-value readiness.
- Run `npm run phase6:final-checks`, `npm run phase6:browser-readiness`, and `npm run phase6:assert-submission` before recording the final video.
- Record the final video from the tagged commit and keep it under 3 minutes.
- Do not claim real-world repair completion.
- Keep the non-wager model explicit.

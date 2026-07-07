# Architecture

Nagarik Signal has three layers.

## 1. Public Product

The web app lets people browse, report, verify, and inspect public
infrastructure issues. Browsing requires no wallet. Report and verification
flows support civic-session mode first. The browser can connect a wallet as an
optional judge/crypto identity, while the current live transaction path remains
sponsored devnet signing for accessibility.

## 2. Read Model

The read model stores display data that should not live directly on-chain:
photo URLs, title, description, ward text, rounded location, dashboard
aggregates, and moderation state.

The read model is not the proof source. It must match the hashes committed to
Solana.

## 3. Solana Proof Layer

The Anchor program owns the durable public proof objects:

- `Registry`
- `Steward`
- `Issue`
- `Verification`
- `StatusUpdate`

Each issue commits:

- evidence hash
- metadata hash
- location hash
- first-observed timestamp
- status
- verification count
- timeline hash
- optional resolution hash

Phase 1 devnet program:

```text
76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY
```

The current deployed proof lifecycle has program-owned Registry, Steward,
Issue, Verification, and StatusUpdate accounts on devnet. The web read model is
intentionally separate from proof state: it stores display data and can be
checked against Solana through ProofPanel.

## Viral Sync Reuse Boundary

Viral Sync patterns are reused for proof verification, PDA discipline,
artifact safety, and public limitations. Viral Sync receipt artifacts are not
used as Nagarik issue proof.

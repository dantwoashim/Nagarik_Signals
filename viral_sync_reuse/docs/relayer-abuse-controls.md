# Relayer Abuse Controls

Status: current controls and production requirements for the sponsored transaction relayer.

## Existing Controls

- API key required unless local development explicitly enables unauthenticated mode.
- CORS origin allowlist required in production.
- Program ID and instruction-prefix allowlists required in production.
- Writable account, signer account, instruction count, transaction size, and compute unit limits.
- Address lookup tables disabled in production unless explicitly allowed after loaded-address validation.
- Replay fingerprint cache with persistent REST cache required in production.

## Current Boundaries

- The relayer does not create on-chain campaigns.
- The receipt lookup route reads the published POC-1 proof packet; it is not a general arbitrary receipt verifier.
- Disabled x402 paid routes must not be marketed until they submit real on-chain work and pass end-to-end payment tests.

## Required Before Production

- Persistent replay cache.
- Per-merchant and per-campaign rate limits.
- Request IDs and durable audit logs.
- Alerting on rejected policy checks and replay attempts.
- Load testing against expected pilot traffic.

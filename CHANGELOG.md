# Changelog

## Unreleased

- Added writable hosted state and private evidence through Vercel Blob with ETag conflict handling.
- Replaced caller-owned browser identities with signed server sessions and deterministic session signers.
- Added Origin checks, signed upload receipts, persistent rate limits, relayer circuit breakers, and moderation controls.
- Added delivered-byte evidence verification; unavailable or mismatched media now fails the proof result.
- Anchored four cited Nepal civic-source dossiers on Solana devnet with explicit review expiry.
- Split community reports, public sources, illustrative samples, and QA fixtures across every public query and metric.
- Added source/sample artifact integrity checks, provenance contract tests, and expanded desktop/mobile browser coverage.
- Updated public documentation around official grievance handoff, security boundaries, research, and operating model.
- Patched the transitive `uuid` advisory with a scoped `jayson` override and retained both dependency paths.

## 0.1.0

- Devnet Anchor proof core.
- Next.js civic proof app.
- Issue, Verification, and StatusUpdate PDA flows.
- Steward console and resolution proof.
- Seeded sample dataset and final preflight script.

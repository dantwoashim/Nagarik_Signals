# Security Policy

Nagarik Signal is a public devnet system with a funded server relayer. Security reports are welcome and should be handled privately.

## Scope

In scope:

- Solana program authorization bugs.
- Duplicate verification bypasses.
- Hash mismatch or canonicalization bugs.
- Unsafe upload handling.
- Leaked secrets, session keypairs, or relayer credentials.
- API paths that allow unauthorized status updates.
- Origin, upload-receipt, rate-limit, or moderation bypasses.
- Durable-state races that lose or overwrite a confirmed record.
- Safety failures that expose people, license plates, private homes, or accusation flows.

Out of scope:

- Mainnet fund loss, because this MVP is devnet-only.
- Spam in seeded demo data.
- Social engineering against maintainers.
- Reports about unsupported roadmap features.

## Reporting

Open a private GitHub security advisory when available. If that is not available, contact the repository owner directly and avoid publishing exploit details until the issue is triaged.

Include:

- affected file or endpoint;
- steps to reproduce;
- impact;
- suggested fix if known.

## Current Boundaries

- The project is devnet-only.
- No tokens, rewards, payments, or mainnet value are handled.
- Hosted state and evidence use private Vercel Blob objects; local development uses atomic JSON and local media.
- Browser sessions are duplicate-resistant identities, not proof of personhood.
- The relayer is a server-held hot key protected by scoped limits and a reserve circuit breaker.
- Resolution proof is a steward-submitted record, not an official completion certificate.

The detailed threat model and remaining risks are documented in [`docs/security-model.md`](docs/security-model.md).

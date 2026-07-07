# Security Policy

Nagarik Signal is a devnet MVP, but security reports are still welcome.

## Scope

In scope:

- Solana program authorization bugs.
- Duplicate verification bypasses.
- Hash mismatch or canonicalization bugs.
- Unsafe upload handling.
- Leaked secrets, session keypairs, or relayer credentials.
- API paths that allow unauthorized status updates.
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
- The default local read model is JSON-backed for the MVP.
- Resolution proof is a steward-submitted record, not an official completion certificate.

# Security Model

Nagarik Signal protects a devnet civic-record workflow with a funded server relayer. The main risks are arbitrary media, secret leakage, write abuse, identity overclaiming, stale source data, and disagreement between hosted context and chain state.

## Controls

| Risk | Control |
|---|---|
| Cross-site writes | Exact Origin allowlist on every mutation; production rejects missing Origin |
| Session tampering | Signed HttpOnly, Secure, SameSite cookie with bounded age |
| Browser key exposure | Session Solana keypairs are derived server-side with HMAC |
| Relayer drain | Per-session, per-IP, and global token buckets plus minimum-balance and reserve checks |
| Upload substitution | Short-lived HMAC receipt binds session, evidence URL, and SHA-256 hash |
| Malicious image metadata | Decode, pixel limit, rotation, resize, re-encode, and metadata stripping |
| Duplicate public evidence | Full sanitized-byte hash rejected when already attached to a public record |
| Storage races | Local lock and atomic rename; Blob ETag compare-and-swap with bounded retry |
| Unauthorized status/moderation | Independent steward secret compared in constant time |
| False or overwritten handoff history | Explicit transitions, expected previous hash, event hash chain, and idempotency key |
| Sensitive receipt disclosure | Receipt reuse rejection, manual redaction declaration, sanitized upload path, and moderation-aware media proxy |
| Hidden harmful media | Private, no-store media proxy blocks `hidden_media` and `rejected` artifacts |
| False green proof | Delivered bytes are fetched and hashed; missing bytes fail the proof result |
| Test data leakage | Record-kind filtering excludes samples and QA from public metrics |

Identifiers stored for rate limits are salted hashes. Raw forwarded IP values are not written to the read model.

## Secret Separation

Production uses independent values for:

- relayer signing;
- deterministic session derivation;
- cookie signing;
- upload receipt signing;
- rate-limit hashing;
- steward authorization;
- reindex authorization.

The relayer secret accepts a Solana secret array or base64-encoded secret key and must never be exposed through a `NEXT_PUBLIC_` variable.

## Remaining Risks

- A browser session is not a unique human. Cookie clearing and multiple clients can create more identities.
- Manual moderation can miss unsafe content. No face or license-plate detector is claimed.
- Receipt privacy review is manual and can miss names, case credentials, QR codes, or other identifying details.
- The production relayer is a hot key and can be abused if server secrets are compromised.
- Vercel Blob compare-and-swap protects state writes but is not a substitute for a transactional database at sustained high concurrency.
- The devnet program remains upgradeable by its authority.
- A hash proves integrity and timing, not physical-world truth.
- Source pages can be edited or removed after checking; the dossier preserves the checked citation and summary, not a licensed copy of the article.

## Production Exit Criteria

Before mainnet or an institutional deployment: external Anchor review, multisig authority, key rotation, alerting, backup/restore drills, formal moderation coverage, evidence retention rules, privacy/legal review, and a documented incident process.

Report vulnerabilities through the repository's private security process.

# Security Policy

Security and privacy reports must use a private channel. Do not include exploit
details, personal data, tracking capabilities, storage URLs, or credentials in
a public issue.

## Supported Surface

The latest commit on the maintained release branch receives security fixes.
Historical commits, local sample data, unsupported forks, and the frozen v1
write path do not receive fixes unless the defect also affects the maintained
surface.

The release profile is non-mainnet. Real civic intake remains disabled until
the recorded privacy and legal review exists.

## Report Privately

Use the repository's
[private security advisory form](https://github.com/dantwoashim/Nagarik_Signals/security/advisories/new).
If that channel is unavailable, contact the repository owner privately before
sharing technical details elsewhere.

Include:

- affected route, account, file, or release commit;
- prerequisites and a minimal reproduction;
- actual and expected behavior;
- security or privacy impact;
- whether any real data or credential may have been exposed;
- a proposed remediation, when available.

Never test against real civic records or a shared deployment. Use synthetic
local fixtures and stop if a test could expose or modify another person's data.

## In Scope

- authorization, organization-scope, AAL2, or RLS bypass;
- capability forgery, replay, purpose confusion, fixation, or enumeration;
- private submission, precise location, media, moderation, or operator leakage;
- unsafe upload parsing, media substitution, raw storage access, or cache leak;
- idempotency, transaction, outbox, reconciliation, or publication race;
- Solana role, PDA, sequence, hash, pause, or authority defect;
- proof responses that report a match for unavailable or mismatched evidence;
- secret, signer, service-role, or worker credential exposure;
- removal, retention, export, or tombstone behavior that restores denied data;
- release, deployment, CSP, dependency, or artifact-scan bypass.

## Current Boundaries

- Postgres is authoritative for workflow; Solana is a public commitment layer.
- V1 is read-only. V2 writes use a distinct server-owned, non-mainnet profile.
- Mainnet writes and unrestricted public intake are disabled.
- Operator access requires managed identity, AAL2, organization membership,
  roles, and audit attribution.
- Media storage is private. Public bytes come from a reviewed derivative through
  a same-origin authorization layer.
- A cryptographic commitment proves integrity and ordering, not physical-world
  truth, personhood, or government acknowledgement.

External penetration testing, a program audit, Nepal-specific privacy/legal
review, signer governance review, and an operator recovery tabletop remain
release gates. See [`docs/production/release-criteria.md`](docs/production/release-criteria.md).

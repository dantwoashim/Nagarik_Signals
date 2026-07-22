# Contributing

Nagarik Signal is a proof-first civic technology project. Contributions should make the proof layer clearer, safer, or easier to verify.

## Project Layout

```text
apps/web/                    Next.js application and API routes
programs/nagarik_signal/    Anchor program
data/                        Public sources and the local read model
scripts/                     Proof, import, and maintenance tools
```

The repository root is the workspace root. Application work belongs in `apps/web`; proof-program work belongs in `programs/nagarik_signal`.

## Local Setup

```bash
npm install
npm run seed:demo
npm run dev
```

## Before Opening A Pull Request

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run verify:data
npm run build
npm run test:e2e
npm run final:preflight
```

For proof-core changes, also run:

```bash
npm run anchor:build
npm run anchor:test:devnet
```

`anchor:test:devnet` requires a funded devnet relayer wallet. If the faucet is rate-limited, state that directly in the PR.

## Contribution Rules

- Preserve the safety boundary: public infrastructure only, no comments, no personal accusations.
- Do not add token, reward, payment, betting, or prediction-market mechanics.
- Do not claim official government status unless an official integration exists.
- Keep proof language precise. A hash proves a commitment, not physical truth by itself.
- Keep source, community, sample, and QA record classes explicit and isolated.
- Preserve delivered-byte verification and source review expiry.
- Do not commit session keypairs, uploads, logs, env files, build output, or `node_modules`.

## Good Changes

- Clearer ProofPanel checks.
- Better hash verification and mismatch reporting.
- Stronger demo preflight checks.
- Safer upload/moderation behavior.
- Better docs for residents, civic groups, and maintainers.

## Commit Style

Use direct, plain commit messages:

```text
Add final preflight checks
Tighten resolution proof validation
Improve dashboard empty states
```

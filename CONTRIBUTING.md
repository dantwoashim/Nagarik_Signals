# Contributing

Contributions should preserve the separation between private civic workflow,
public projections, media delivery, and Solana commitments.

## Repository Layout

```text
apps/web/                         Next.js application and APIs
apps/web/lib/services/            Transactional domain workflows
supabase/migrations/              Postgres schema, RLS, and invariants
programs/nagarik_signal_v2/       Current Anchor protocol
programs/nagarik_signal/          Frozen v1 compatibility program
scripts/                          Workers and verification tools
docs/adr/                         Architecture decisions
docs/production/                  Contracts and release evidence
```

## Local Setup

Use the exact runtime declared in `.nvmrc` and the locked dependency graph.

```bash
npm ci
npm run db:start
npm run db:reset
npm run dev
```

Populate `apps/web/.env.local` from [`.env.example`](.env.example) with local
Supabase values and independent development secrets. Use synthetic data only.

## Required Checks

For web, API, domain, or database changes:

```bash
npm run verify
npm run db:test
npm run build
npm run test:e2e
npm run audit:security
```

For protocol, IDL, chain worker, or proof changes:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run anchor:idl:check
```

Run `npm run verify:release:report` when a change affects deployment,
configuration, migrations, security policy, recovery, or release evidence.
State every command that was not run.

## Invariants

- A submission remains private until moderation, immutable version creation,
  required chain confirmation, and projection admission complete.
- Public queries use public projections; private fields are absent by schema.
- Every external mutation starts with durable, idempotent database intent.
- V1 interfaces and account semantics remain frozen.
- Public signals represent attention only. They do not change lifecycle state or
  prove truth or personhood.
- Raw storage URLs, precise private coordinates, service-role credentials,
  signer material, and capability tokens never enter browser bundles or logs.
- Real civic data, mainnet writes, and unrestricted intake stay disabled unless
  their release gates are explicitly satisfied.
- Generated IDLs and release evidence are verified rather than hand-edited.

## Pull Requests

Keep changes scoped. Describe contract impact, migration and rollback behavior,
privacy implications, proof compatibility, and test evidence. Include
screenshots for user-interface changes and record any residual risk directly.

Report security-sensitive findings privately under [`SECURITY.md`](SECURITY.md).

# Nagarik Signal Production Migration Rules

These instructions apply to the repository unless a more specific nested
`AGENTS.md` overrides them.

## Governing Documents

1. `docs/production/production-readiness-master-plan.md` is the production
   migration program and acceptance contract.
2. `nagarik_signal_master_plan.md` remains the original product architecture
   plan and must not be edited.
3. When the two documents differ, preserve the product intent from the original
   plan while following the stricter privacy, consistency, authorization, and
   release rules in the production-readiness plan.

The current `main` release is a devnet prototype. Production work belongs on
`production-readiness` until an evidence-backed release decision is made.

## Non-Negotiable Boundaries

- Postgres is authoritative for workflow; Solana is a versioned public
  commitment layer.
- Submission and raw media remain private until moderation, immutable public
  version creation, and any required chain confirmation complete.
- Public and private DTOs, repositories, routes, and projections stay separate.
- Every external mutation is idempotent and begins with durable database
  intent. Routes do not write to Solana first.
- The deployed v1 program and IDL are historical and retain their semantics.
  Production semantics belong to a distinct v2 program and IDL.
- Public signals are attention or corroboration signals. They do not prove
  personhood, truth, authority response, or lifecycle state.
- Production paths do not fund browser or anonymous session wallets.
- Media access is deny-by-default and never exposes raw storage URLs.
- Individual operator authentication, organization scope, role authorization,
  and audit attribution replace shared browser secrets.
- Tests and development tools never target live civic data.
- Mainnet and production claims remain blocked until the external human gates
  in the production-readiness plan are satisfied.

## Execution Order

Follow the waves in the governing plan. Do not begin a dependent wave before
its contract and gate are satisfied.

For every change:

1. Inspect current behavior and authoritative contracts.
2. State the invariant and failure ordering being changed.
3. Add a regression test that fails against the unsafe behavior.
4. Implement the smallest complete contract-compliant change.
5. Run focused tests, then all affected release gates.
6. Record evidence, residual risk, migration impact, and rollback impact in
   `docs/production/execution-log.md`.

## Ownership

- One dependency custodian owns `package-lock.json` and `Cargo.lock`.
- One database owner assigns migration numbers.
- Contract changes to public/private types, API shapes, state machines, PDA
  seeds, account layouts, `Anchor.toml`, IDLs, CI, or deployment profiles
  require architecture/integration review before implementation.
- Generated IDLs and manifests are generated and verified, never hand-edited.
- Parallel writers must have disjoint file ownership.

## Evidence Standard

Never claim a gate passed unless the exact command ran successfully and the
artifact exists. Separate:

- confirmed current behavior;
- confirmed defects;
- design risks;
- missing evidence;
- external human blockers.

Every agent handoff must conform to
`.codex/schemas/agent-report.schema.json`.

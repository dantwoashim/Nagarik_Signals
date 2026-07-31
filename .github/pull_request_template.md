## Summary

What changed, and what invariant or user need does it address?

## Contract Impact

- API or public DTO:
- Database migration, RLS, or retention:
- Solana account, PDA, IDL, or proof compatibility:
- Authentication, authorization, privacy, or media:
- Observability, deployment, or recovery:

## Verification

- [ ] `npm run verify`
- [ ] `npm run db:test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm run audit:security`
- [ ] Rust format, clippy, tests, and IDL drift when protocol behavior changed
- [ ] UI screenshots or recordings attached when visual behavior changed

List exact commands, results, and anything not run.

## Release Safety

- [ ] Private and public data paths remain separate.
- [ ] Mutations are idempotent and persist durable intent before external work.
- [ ] Logs, errors, bundles, and artifacts contain no secrets or private fields.
- [ ] V1 compatibility and v2 program identity remain explicit.
- [ ] Migration and rollback behavior is documented and backward compatible.
- [ ] Generated files and release evidence were regenerated and checked.

## Residual Risk

Known defects, operational dependencies, external approvals, or follow-up work:

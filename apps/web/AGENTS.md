# Web Application Rules

These rules extend the repository-level `AGENTS.md`.

- Keep server-only credentials, service-role clients, signers, private rows,
  precise locations, moderation notes, tracking material, and raw storage URLs
  outside client imports and serialized props.
- Use explicit versioned request and response schemas with stable errors,
  idempotency keys, request IDs, and body limits.
- Public routes query public projections only. Private tracking and operator
  routes use separate capability or authenticated contracts.
- A report submission returns private tracking state. It does not create a
  public issue or invoke Solana directly.
- Operator mutations run through domain services and one database transaction
  that includes audit and outbox intent where required.
- Media routes begin denied, resolve opaque IDs through the database, and proxy
  authorized bytes with safe cache and content headers.
- UI language distinguishes source provenance, freshness, public signals,
  lifecycle, official handoff evidence, integrity, availability, and truth.
- Critical flows require keyboard, mobile, reduced-motion, screen-reader, empty,
  stale, partial-failure, retry, correction, and tombstone coverage.
- Never use production data in tests. Browser tests reset isolated fixtures.

Run focused unit/integration tests, `npm run typecheck`, `npm run lint`, and the
relevant Playwright projects for every affected public or operator flow.

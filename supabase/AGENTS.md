# Database and Supabase Rules

These rules extend the repository-level `AGENTS.md`.

- Number migrations monotonically; one database owner assigns numbers.
- Applied migrations are immutable. Corrections use a new migration.
- Store private submissions, raw media metadata, tracking hashes, moderation,
  operator data, audit, rate limits, outbox payloads, and diagnostics outside
  public grants and projections.
- Public views contain only approved immutable public versions and coarse
  location data.
- Use constraints, indexes, RLS, and append-only triggers to enforce invariants
  in addition to application checks.
- Store keyed hashes rather than raw sessions, tracking tokens, or abuse keys.
- One transaction covers each logical mutation and its idempotency, audit, and
  outbox effects.
- Service-role access is server-only, narrow, and never shipped to the client.
- Every migration must pass empty-database, upgrade, constraint, role/RLS,
  immutability, concurrency, and query-plan tests.
- Seed data is synthetic, labelled, local-only, and production-guarded.

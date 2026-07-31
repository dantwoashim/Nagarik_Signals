# Scheduled Workers

This runbook covers the bounded outbox, health, reconciliation, and retention
routes in the `curated_pilot_v2_non_mainnet` profile. The schedules are a wakeup
mechanism; durable intent, leases, retries, and dead-letter state live in
Postgres.

## Deployment Preconditions

- Use a Vercel plan that permits per-minute cron schedules. A Hobby deployment
  is not an approved writable pilot profile because its cron cadence is limited
  to once per day.
- Set independent random `CRON_SECRET` and `NAGARIK_WORKER_AUTH_SECRET` values
  of at least 32 bytes. Never reuse an application, auth, database, Blob, RPC,
  signer, or capability secret.
- Configure the public HTTPS alert endpoint and independent bearer described in
  [the observability contract](../observability.md).
- Confirm all four jobs appear under the production project's Cron Jobs view
  after deployment. Preview deployments do not run these schedules.
- Keep invite intake, publication, and v2 writes disabled until the database,
  signer, RPC, Blob, alerting, and human release gates are ready.

## Fixed Cadence

| Route                          | UTC cadence      | Behavior                                                               |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------- |
| `/api/internal/outbox/process` | every minute     | leases and processes at most 10 typed jobs                             |
| `/api/internal/health`         | every 5 minutes  | returns failure when the minimal internal readiness snapshot is unsafe |
| `/api/internal/reconcile`      | every 10 minutes | inspects at most 25 bindings in dry-run mode                           |
| `/api/internal/retention`      | daily at 02:17   | deletes at most 25 eligible expired media objects                      |

Every cron call is a bodyless `GET` authenticated by Vercel's bearer and cron
user agent. The endpoint rejects query parameters, another path, another
method, a missing/incorrect bearer, and a non-cron user agent.

## Manual Invocation

Manual machine calls use `POST`, the independent worker bearer, and the exact
audience. Example for the outbox worker:

```http
POST /api/internal/outbox/process
Authorization: Bearer <NAGARIK_WORKER_AUTH_SECRET>
X-Nagarik-Worker-Audience: nagarik-worker/outbox-process/v1
Content-Type: application/json

{"schemaVersion":"outbox-process-v1"}
```

Use `nagarik-worker/reconcile/v1` with `reconcile-worker-v1`, or
`nagarik-worker/retention/v1` with `retention-worker-v1`. There is no manual
health mutation.

## Failure Handling

1. Record the release SHA, request ID, route, UTC time, HTTP status, and the
   redacted aggregate result.
2. Check oldest pending age, submitted-unknown jobs, retries, blocked
   descendants, and dead letters in authenticated diagnostics.
3. Disable v2 writes when signer/RPC observations are ambiguous. Do not delete,
   reorder, rebase, or edit an outbox payload.
4. Run reconciliation in dry-run mode and follow the dependency-outage or key
   compromise runbook when observations disagree.
5. Restore scheduling only after an authorized operator confirms the dependency
   and backlog state. Repeated worker invocation must remain harmless.

Cron logs alone are not alert evidence. Production approval still requires a
tested alert destination and an acknowledged alert-delivery artifact.

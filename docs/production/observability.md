# Operational Telemetry And Alerts

This contract applies to the `curated_pilot_v2_non_mainnet` profile. Runtime
telemetry is operational metadata, not a civic evidence store. It must never
contain report text, media data, precise or coarse locations, operator identity,
auth claims, cookies, capability values, storage keys, RPC payloads, private
references, exception messages, or stack traces.

## Event Envelope

Every runtime record is one compact JSON line with schema
`nagarik-operational-event-v1`. The envelope contains only:

- UTC occurrence time;
- enumerated event, outcome, and derived severity;
- generated opaque request and trace IDs;
- immutable release ID and runtime environment;
- non-negative duration;
- event-specific numeric metrics;
- enumerated low-cardinality dimensions.

Unknown metrics or dimension values fail validation rather than entering logs.
The first implemented event families are `health.readiness`, `alert.delivery`,
`worker.outbox`, `worker.reconcile`, and `worker.retention`.

## Readiness Metrics

The protected scheduled readiness check emits boolean `0`/`1` dependency and
switch status plus aggregate outbox counts. It does not emit a database error,
capability reason, job identifier, signer key, account, signature, organization,
or issue identifier. An unauthorized invocation emits only status `404`,
request/trace IDs, release metadata, duration, and the fixed `cron` trigger.

## Alert Transport

Production requires independent `NAGARIK_ALERT_WEBHOOK_URL` and
`NAGARIK_ALERT_WEBHOOK_TOKEN` values. The endpoint must be public HTTPS without
URL credentials, query credentials, fragments, loopback, link-local, or private
IP literals. Delivery uses a three-second bounded POST, rejects redirects, and
sends the credential only in the bearer header.

The alert body uses schema `nagarik-operational-alert-v1` and contains a
deterministic alert ID, enumerated kind/severity, request/trace/release IDs, UTC
time, and kind-specific numeric metrics. It contains no arbitrary message or
exception field. Alert delivery emits its own success/failure event without
logging the endpoint, credential, or response body.

## Provider Configuration

The approved provider must parse one JSON object per line, retain records no
longer than `NAGARIK_LOG_RETENTION_DAYS`, restrict access to named operators,
and create dashboards/thresholds from the numeric fields. Alert routing must
name an owner and escalation destination. Runtime logs alone are insufficient
for release approval.

## Release Evidence

Unit tests prove the schema rejects forbidden metric/dimension names, alert
credentials stay outside the payload, unsafe endpoints fail closed, redirects
are rejected, and provider failures become stable delivery failures. These
tests prove implementation behavior only.

`OPS-003` remains blocked until a release-bound staging/canary drill sends a
real alert, a named owner acknowledges it at the configured destination, an
independent reviewer verifies the timestamps and release ID, and the sanitized
artifact passes the release verifier.

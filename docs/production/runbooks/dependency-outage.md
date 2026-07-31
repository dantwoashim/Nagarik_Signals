# Dependency Outage

## Trigger

Use this procedure when Postgres, managed auth, private Blob storage, either RPC
provider, custody, or deployment infrastructure is unavailable, inconsistent,
or outside its approved latency/error threshold.

## Containment Matrix

| Dependency | Disable immediately                                         | Reads allowed only when                              |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Postgres   | intake, signals, operator mutations, publication, v2 writes | never without authoritative DB state                 |
| Auth/AAL2  | operator mutations, publication                             | public projection remains healthy                    |
| Blob       | intake, publication, public media                           | issue text/proof does not imply media availability   |
| One RPC    | publication, v2 writes                                      | both-provider agreement is restored                  |
| Both RPCs  | publication, v2 writes                                      | recorded public reads remain clearly stale/available |
| Custody    | publication, v2 writes                                      | no signing attempt is made                           |
| Web/CDN    | provider edge controls                                      | origin and cache identity are verified               |

Apply the narrow capability controls from the runbook index. Do not route around
an unavailable dependency with local JSON, public storage, one RPC, a browser
wallet, or a locally held production key.

## Diagnosis

Check `/api/health/live`, `/api/health/ready`, and the AAL2 operator diagnostics
endpoint. Record release SHA, schema version, outbox counts, oldest pending job,
dead letters, provider incident references, and alert delivery. Keep provider
endpoint names and sensitive diagnostics in the restricted incident record.

## Recovery

Wait for the dependency to become stable, then verify release/schema/program
identity and run dry reconciliation. Resume bounded workers before accepting new
writes. Re-enable one capability at a time while watching the approved canary
thresholds.

## Exit Criteria

Required dependencies are healthy across the approved observation window,
backlog is bounded and draining in FIFO order, no proof disagreement or private
cache leak exists, alerts are acknowledged, and a named owner records the
provider follow-up.

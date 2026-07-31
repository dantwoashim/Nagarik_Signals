# ADR 0007: Release Profile and Kill Switches

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture, security, operations

## Context

The prototype mixes environment flags, route availability, readiness checks,
and user-interface visibility. A runtime setting can appear to enable a path
whose auth, schema, signer, or reconciliation dependency is unsafe. Release
evidence also becomes ambiguous when flag names differ between documents.

## Decision

The first eligible profile is `curated_pilot_v2_non_mainnet`. Its static
invariants are:

```text
legacyRead=true
legacyMutations=false
publicRead=true
publicIntake=false
publicSignals=false
mainnetWrites=false
publicationRequiresFinalizedCommit=true
sampleData=false
```

They are validated at startup and build/release verification. They cannot be
changed through an administrative runtime interface.
`legacyMutations=false` covers retired legacy routes and behavioral/domain
updates to imported v1 records. It does not disable mandatory privacy
enforcement on the imported database projection: an authorized removal can
deny media/content and expose only the frozen neutral tombstone without
invoking v1 or creating a v2 wrapper.

The only capability ceilings are:

```text
publicReadEnabled
publicMediaEnabled
inviteIntakeEnabled
inviteSignalsEnabled
operatorMutationsEnabled
publicationEnabled
v2WritesEnabled
```

All seven ceilings are `true` for the reviewed release artifact. Database
migrations create all seven kill-switch rows as `disabled=true`; provider-edge
public-read/media controls start with `edgeKillSwitch=true`. Missing,
unreadable, duplicate,
malformed, or stale-policy switch state is equivalent to disabled and makes
readiness false. Release activation clears one named switch only after its
guards pass.

Each has a static release enable and a database kill switch. Effective
enablement is `staticReleaseEnable && !databaseKillSwitch && dependencyGuards`.
The database can only remove capability. It cannot grant capability beyond the
release artifact. Public reads and media also require an independently
configured provider-edge switch:

```text
staticReleaseEnable
&& !databaseKillSwitch
&& !edgeKillSwitch
&& dependencyGuards
```

Either public switch disables delivery at origin and edge before cache lookup.
The operation also purges relevant CDN entries and is not complete until edge
denial is verified. Edge-state unavailability fails closed.

Kill-switch changes require AAL2 `system_admin`, explicit reason,
idempotency/concurrency checks, an append-only audit event, and immediate
configuration cache invalidation. A public-safe, `no-store` capability endpoint
may expose public read/intake/signal availability. It never exposes operator,
chain-write, publication, dependency, or diagnostic state.

Live invite intake additionally requires recorded `EXT-003` approval. Without
it, only synthetic fixtures in isolated non-public test namespaces are
permitted.

Retired legacy mutations return `410 legacy_mutation_retired`. A supported route
disabled by a flag or dependency guard returns `503
feature_temporarily_unavailable`. Readiness is false for an invalid static
profile or an enabled capability with a failed dependency guard.

## Invariants

- UI state never replaces server enforcement.
- A runtime data-store compromise cannot enable a statically disabled path.
- Provider-edge or database control alone can disable public reads/media.
- `publicationRequiresFinalizedCommit` cannot be disabled.
- `legacyMutations`, unrestricted intake/signals, mainnet writes, and sample
  data remain disabled in this profile.
- Publication requires operator mutations, v2 writes, exact finalized binding,
  healthy public projection, and no relevant dead letter.
- Release evidence records static and effective state plus policy version.

## Rejected alternatives

- **Environment flags only:** cannot provide an emergency operational kill
  without redeployment.
- **Database flags that both enable and disable:** data-store control can exceed
  reviewed release scope.
- **UI-only hiding:** routes remain callable.
- **One global maintenance switch:** cannot isolate intake, signals, operators,
  chain writes, and publication safely.
- **Fail open when configuration is unavailable:** makes dependency failure an
  authorization or publication bypass.

## Verification

- exhaustive static-profile schema/invariant tests;
- database enable-beyond-ceiling negative tests;
- per-capability dependency-guard matrix;
- concurrent kill-switch update/idempotency/cache-invalidation tests;
- retired and temporarily disabled route contract tests;
- public capability DTO leak tests;
- release-manifest and readiness reconciliation tests.

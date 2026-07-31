# Roadmap

## Current Engineering Baseline

- Postgres-authoritative private intake, moderation, publication, lifecycle,
  correction, handoff, removal, signals, audit, and outbox workflows;
- managed operator identity with AAL2, organization scope, roles, and RLS;
- staged private media, reviewed public derivatives, capability-bound delivery,
  retention state, and neutral tombstones;
- frozen v1 read compatibility and a separate server-owned v2 commitment
  protocol;
- public, tracking, and operator interfaces backed by versioned v2 contracts;
- deterministic CI for web, database/RLS, Rust, generated IDL, browser,
  accessibility, security scanning, dependency audit, and SBOM evidence.

## Curated Pilot Readiness

- exercise an actual database and object-storage backup in an isolated restore;
- run load smoke against a staging release and approve measured thresholds;
- exercise kill switches, immutable release rollback, cache purge, and outbox
  recovery;
- connect alert delivery and record acknowledgement evidence;
- complete a manual keyboard and screen-reader review;
- obtain Nepal-specific privacy/legal review;
- define signer custody and upgrade-authority governance;
- name moderation, privacy, recovery, and incident owners;
- complete a scoped penetration test and operator tabletop.

## After A Responsible Pilot

- add reviewed Nepali-language public, intake, tracking, and operator copy;
- publish privacy-safe civic exports and aggregate service metrics;
- add duplicate-location and perceptual-similarity review assistance;
- support verified authority integrations without presenting platform events as
  authority-authored history;
- evaluate broader intake only from measured moderation and abuse data.

Mainnet is a separate release decision requiring an independent program audit,
approved key governance, tested recovery, and evidence from the pilot. Tokens,
rewards, payments, betting, and public accusation features are outside scope.

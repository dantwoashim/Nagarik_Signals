# Changelog

## Unreleased

- Rebuilt the public interface around report, explore, proof, dashboard, and steward workflows.
- Added responsive navigation, loading/error states, safe media delivery, and browser-level experience checks.
- Added stateful Docker deployment support through `NAGARIK_DATA_DIR`.
- Hardened production steward writes to fail closed when no secret is configured.
- Reworked the repository presentation, product documentation, and public walkthrough.
- Expanded CI to seed the demo model, build the app, and run Playwright checks.

## 0.1.0

- Devnet Anchor proof core.
- Next.js civic proof app.
- Issue, Verification, and StatusUpdate PDA flows.
- Steward console and resolution proof.
- Seeded sample dataset and final preflight script.

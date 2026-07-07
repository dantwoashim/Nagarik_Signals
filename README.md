# Nagarik Signal

[![CI](https://github.com/dantwoashim/Nagarik_Signals/actions/workflows/ci.yml/badge.svg)](https://github.com/dantwoashim/Nagarik_Signals/actions/workflows/ci.yml)
![Solana](https://img.shields.io/badge/Solana-devnet-16324a)
![License](https://img.shields.io/badge/license-MIT-b71f2d)

Public proof for public problems.

Nagarik Signal is a Solana-backed civic proof layer for ignored public infrastructure issues in Nepal. It does not try to become another complaint portal. It creates public records that prove when an issue was reported, what evidence was committed, who verified it once, how the status changed, and whether resolution proof was attached.

> Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

## Why This Exists

Nepal already has complaint channels: ward offices, government portals, Facebook groups, civic apps, local media, and private messages. The missing piece is public memory.

If a broken drain, unsafe footpath, overflowing waste point, or damaged public facility stays unresolved for weeks, people need more than a post. They need a tamper-evident record that can be checked later without trusting the platform operator.

Nagarik Signal turns civic issues into proof objects:

- sanitized evidence hash;
- canonical metadata hash;
- approximate location commitment;
- Solana Issue PDA;
- one-verification-per-session/wallet Verification PDA;
- steward StatusUpdate PDA;
- public timeline hash;
- live ProofPanel comparison;
- ward/locality accountability dashboard.

## Repository Map

```text
.
├── nagarik-signal/                 Active product: Next.js app, API routes, Anchor program, scripts, docs
├── nagarik_signal_master_plan.md   Controlling architecture and execution plan
├── viral_sync_reuse/               Reference material copied from Viral Sync for proof/safety patterns
├── .github/                        CI, issue templates, pull request template
└── README.md                       This file
```

The production work lives in [`nagarik-signal/`](nagarik-signal/). The [`viral_sync_reuse/`](viral_sync_reuse/) folder is intentionally kept as reference material. It is not the app entry point and its artifacts are not Nagarik issue proof.

## Current Status

| Area | Status |
|---|---|
| Web app | Next.js app with landing, report, explore, issue, dashboard, steward, and about pages |
| Solana program | Anchor proof core deployed on devnet |
| Devnet program ID | `76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY` |
| Proof lifecycle | Issue PDA, Verification PDA, StatusUpdate PDA, timeline hash, resolution hash |
| Demo data | 30 safe seeded demo issues plus preserved live devnet rows |
| Storage/read model | Local JSON MVP read model, with Supabase schema prepared |
| Product boundary | Devnet-only MVP. No tokens, payments, rewards, comments, or official government claims |

## Product Flow

```text
Report
  -> strip metadata
  -> hash evidence
  -> hash canonical metadata
  -> commit approximate location
  -> create Issue PDA
  -> citizen verifies once
  -> steward updates status
  -> judge verifies hashes live
```

## Why Solana Is Used

| Need | Database-only system | Nagarik Signal on Solana |
|---|---|---|
| Issue creation time | Operator-controlled timestamp | Public transaction timestamp |
| Evidence commitment | Media can be replaced silently | Evidence hash committed to Issue PDA |
| Duplicate verification | App logic can be edited later | Verification PDA prevents duplicate signer/session verification |
| Status timeline | Admin history can be rewritten | StatusUpdate PDA and timeline hash create an audit trail |
| Public verification | Trust screenshots or exports | Recompute displayed hashes and compare them with chain state |

This is not a token product. Solana is used as public proof infrastructure.

## Quick Start

```bash
cd nagarik-signal
npm install
npm run seed:demo
npm run dev
```

Open:

```text
http://127.0.0.1:3001
```

The app can also run on another free Next.js port if `3001` is occupied.

## Local Verification

From `nagarik-signal/`:

```bash
npm run seed:demo
npm run typecheck
npm run lint
npm run build
npm run final:preflight
```

Solana proof-core checks:

```bash
npm run anchor:build
npm run anchor:test:devnet
```

`anchor:test:devnet` needs devnet SOL in the configured relayer wallet. If the faucet is rate-limited, the code can still build locally, but live devnet lifecycle tests will fail at funding time.

## Demo Path

1. Start on `/dashboard`.
2. Open an ignored issue and show Days Ignored.
3. Create a public infrastructure report.
4. Open the issue page.
5. Run ProofPanel.
6. Verify once from a different civic session.
7. Show duplicate verification rejection.
8. Use `/steward` to move the issue to `in_progress`.
9. Resolve with after-photo proof.
10. Return to the dashboard and show the ward/locality leaderboard.

## Safety Boundary

Nagarik Signal is deliberately narrow:

- public infrastructure only;
- approximate location only;
- EXIF metadata stripped before storage;
- no faces, license plates, private homes, named officials, or personal accusations;
- no comments;
- no emergency reporting;
- no claim that a government agency resolved an issue unless an official source is integrated.

Resolution proof means a steward attached an after-state record to a status update. It is public evidence of a steward update, not an official completion certificate.

## Documentation

- [Product README](nagarik-signal/README.md)
- [Architecture](nagarik-signal/ARCHITECTURE.md)
- [Safety](nagarik-signal/SAFETY.md)
- [Demo script](nagarik-signal/DEMO_SCRIPT.md)
- [Judge FAQ](nagarik-signal/docs/judge-faq.md)
- [Why Solana](nagarik-signal/docs/why-solana.md)
- [Submission package](nagarik-signal/docs/submission-package.md)
- [Master plan](nagarik_signal_master_plan.md)

## Contributing

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md). Keep changes proof-first, safety-aware, and honest about what the MVP does and does not prove.

## License

MIT. See [`LICENSE`](LICENSE).

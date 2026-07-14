# Nagarik Signal

> Public proof for public problems.

Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

Nagarik Signal is a Solana-backed public proof layer for ignored civic issues in Nepal. It is not another complaint portal. It turns safe public infrastructure reports into public proof objects with evidence hashes, metadata hashes, approximate location commitments, citizen verification, steward status history, and live on-chain verification.

## Links

| Item | Value |
|---|---|
| Local app | `http://127.0.0.1:3001` after `npm run dev` |
| Devnet program | `76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY` |
| Cluster | Solana devnet |
| Live public preview | `https://nagarik-signal.vercel.app` (read-only; proof checks are available) |

## What It Does

```text
Report -> Hash -> Anchor -> Verify -> Track -> Resolve
```

- Citizens report public infrastructure issues with safe photos, categories, ward/locality, and approximate location.
- The app strips metadata, hashes evidence, builds canonical metadata, and creates an Issue PDA on Solana devnet.
- A signer or sponsored civic session can add one signal through a Verification PDA. Duplicate verification by that identity is blocked by the program.
- Stewards update status through StatusUpdate PDAs and can attach resolution proof.
- ProofPanel recomputes displayed data and compares it against Solana state.
- Dashboard ranks unresolved issues by ward/locality and Days Ignored.

## What It Is Not

- Not a government complaint replacement.
- Not a token, reward, payment, betting, or prediction-market app.
- Not proof that a physical-world repair happened unless a trusted steward or official source is integrated.
- Not proof-of-personhood. MVP verification is duplicate-resistant per session or wallet identity, not fully Sybil-proof.
- Not a Janamat clone. Janamat shows civic opinion; Nagarik Signal shows civic evidence.

## Why Solana, Honestly

| Need | Normal database | Solana proof |
|---|---|---|
| Issue creation timestamp | Operator-controlled | Public transaction timestamp |
| Evidence commitment | Can be replaced silently | Hash committed on-chain |
| Duplicate verification | Application rule can be rewritten | Verification PDA prevents duplicate signer/session verification |
| Status timeline | Admin history can be edited | StatusUpdate PDAs and timeline hash create an audit trail |
| Independent verification | Trust the platform export | Recompute display hashes and compare with chain state |

Solana is used only for public proof. There are no tokens, rewards, or payments.

## Architecture

```text
Next.js app
  - landing, report, explore, issue, dashboard, steward, about
  - API routes for upload, reports, verify, status, dashboard, proof, health

Local JSON read model for MVP display
  - issue text, image URLs, rounded location, sessions, dashboard data
  - sample rows use the internal status seeded_demo

Solana devnet proof layer
  - Registry PDA
  - Steward PDA
  - Issue PDA
  - Verification PDA
  - StatusUpdate PDA
```

The database/read model is display infrastructure. The public proof source is the Solana program plus the hashes committed to it.

## Solana Program

Program ID:

```text
76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY
```

Implemented lifecycle checks:

- Registry PDA creation.
- Steward PDA creation.
- Issue PDA creation.
- Verification PDA creation.
- Duplicate verification rejection.
- Reporter self-verification rejection.
- StatusUpdate PDA creation.
- Resolved issue rejection for further verification.
- Timeline hash updates.
- Resolution hash storage.

The program is deployed on devnet. The funded lifecycle suite is available through `npm run anchor:test:devnet`; publishing a program ID alone is not treated as proof that every physical-world claim is true.

## Sample Data

Run:

```bash
npm run seed:demo
```

This regenerates a safe synthetic/staged sample dataset while preserving existing live devnet rows. The current generator verifies:

- at least 30 visible issues;
- at least 5 wards/localities;
- 10+ verifications;
- 5+ in-progress issues;
- 2+ resolved issues;
- 10+ unresolved issues;
- at least one issue with 3+ verifications.

Seeded rows are labeled `seeded_demo`; live rows created through the app are labeled `indexed_devnet`.

## Local Setup

```bash
npm install
npm run seed:demo
npm run dev
```

Open `http://127.0.0.1:3001`.

## Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run anchor:build
npm run anchor:test:devnet
npm run phase2:smoke
npm run phase5:smoke
npm run final:preflight
```

`npm run anchor:test` needs `solana-test-validator` installed locally. `npm run anchor:test:devnet` exercises the deployed devnet program without a local validator.

## Proof Commands

```bash
npm run proof:create
npm run proof:verify -- --issue-id 1 --keypair target/test-keys/verifier.json
npm run proof:status -- --issue-id 1 --seq 1 --status 2
npm run proof:read -- --issue-id 1
npm run verify:proof -- --issue-id 1
```

## Product Walkthrough

1. Start on `/dashboard`.
2. Open an ignored issue and show Days Ignored.
3. Create a new report from `/report`.
4. Open the public issue page.
5. Verify from a different session.
6. Demonstrate duplicate rejection.
7. Run ProofPanel and show green hash matches.
8. Use `/steward` to move the issue to in progress and resolved.
9. Show the frozen Resolved after X days counter.
10. Close with: Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

## Privacy And Safety

- Public infrastructure only.
- No faces, license plates, private homes, personal accusations, or political accusation flow.
- No comments.
- Approximate location display only.
- EXIF metadata stripped before storage.
- Stewards can hide unsafe media display while preserving the public proof trail.
- Resolution proof is a steward-submitted after-state record, not an official government completion claim.

## Deployment

The current MVP writes its read model, session keys, and sanitized uploads to disk. Deploy the full workflow on a stateful Node host with a persistent volume. The Vercel deployment is configured as a read-only public preview: it bundles the public read model, keeps live Solana proof verification available, and fails every state-changing route closed.

Recommended production path:

1. Set `NEXT_PUBLIC_NAGARIK_PROGRAM_ID`.
2. Set `NEXT_PUBLIC_SOLANA_RPC_URL`.
3. Set `ANCHOR_WALLET` or `NAGARIK_RELAYER_KEYPAIR` for the devnet relayer.
4. Set a strong `NAGARIK_STEWARD_SECRET`; production steward writes fail closed when it is absent.
5. Mount persistent storage and set `NAGARIK_DATA_DIR` to that mount path.
6. Build and run the included `Dockerfile` on a stateful host.
7. Run `npm run final:preflight` against the deployed URL with `NAGARIK_PREFLIGHT_BASE_URL`.

## Known Limitations

- MVP is devnet-only.
- The MVP uses a JSON read model and filesystem uploads. Hosted write flows require a persistent volume through `NAGARIK_DATA_DIR`; Supabase remains a future adapter.
- Wallet identity can be connected in the browser, but the current live transaction path is still sponsored devnet signing for accessibility.
- Sample rows are synthetic/staged examples and intentionally use the internal status `seeded_demo`.
- Verification is duplicate-resistant per session/signer, not proof-of-personhood.
- Official government response is not claimed.

## Docs

- [Architecture](ARCHITECTURE.md)
- [Safety](SAFETY.md)
- [Competitors](docs/competitors.md)
- [Why Solana](docs/why-solana.md)
- [Privacy and safety](docs/privacy-and-safety.md)
- [Product FAQ](docs/product-faq.md)
- [Public posts](docs/public-posts.md)
- [Roadmap](ROADMAP.md)

## License

MIT for the app and supporting scripts unless a dependency license states otherwise.

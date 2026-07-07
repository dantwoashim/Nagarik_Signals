# Final 3-minute Video Checklist

Target length: 2:30 to 2:55. Hard cap: 3-minute.

## Recording Structure

0:00-0:20

Problem: civic signals are easy to discuss but hard to verify. The project separates opinion, action, receipt, and reward settlement.

0:20-0:45

Open `/market/ward12-water-repair`. Show the civic question, source boundary, and non-wager forecast framing.

0:45-1:15

Open `/participate/ward12-water-repair`. Issue a signed participation pass and Phase 5 conviction signal. Say clearly: the conviction signal is capped, non-transferable, and cannot trigger settlement.

1:15-1:45

Open `/verify/ward12-water-repair`. Verify the pass/receipt path and show replay rejection.

1:45-2:15

Open `/ledger`. Show `npm run civic:verify-receipt`, public proof artifacts, devnet receipt PDA, nullifier PDA, and settlement record.

2:15-2:40

Show terminal output for:

```bash
npm run civic:verify-receipt
npm run test:protocol
```

2:40-2:55

Close with the claim boundary: devnet Solana receipt settlement is proven; live municipal data, private identity, and mainnet value are next gates.

## Required Callouts

- Solana receipt PDA
- nullifier replay rejection
- sponsor reward settlement depends on receipt, not forecast
- Phase 5 `ConvictionSignal` PDA
- independent verifier command
- explicit limitations

## Recording Rules

- Do not claim real users.
- Do not claim mainnet readiness.
- Do not claim official government integration.
- Do not say the repair physically happened unless a permitted data source exists.
- Keep the terminal readable at 125 percent zoom or larger.

## Upload Step

Personal action required before final submission:

1. Run `npm run phase6:final-checks`.
2. Run `npm run phase6:browser-readiness`.
3. Record the video from the latest tagged commit.
4. Upload to Loom or YouTube.
5. Add the video URL to the hackathon submission form and README if the platform expects it.

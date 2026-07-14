# Why Solana

Solana is used for the smallest part of the product that benefits from independent inspection:

- a public issue timestamp;
- evidence, metadata, location, and timeline hashes;
- one Verification PDA per issue and signer;
- one StatusUpdate PDA per sequence;
- a public account that can be checked without trusting a Nagarik Signal export.

Images, descriptions, search, moderation, request limits, and provenance stay in application storage. Putting those fields directly on-chain would increase privacy risk and make moderation harder.

The current deployment uses devnet because the operating model, moderation process, legal boundary, and program authority are not ready for mainnet. There is no token, reward, payment, betting, or speculative mechanism.

Solana proves commitment consistency. It does not prove physical truth, unique human identity, official acknowledgement, or permanent hosted-media availability.

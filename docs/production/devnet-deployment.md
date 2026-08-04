# Devnet V2 Deployment

Verified on 2026-08-04 against Solana devnet genesis
`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. This is non-mainnet pilot
infrastructure and carries no production-value funds.

| Item                     | Verified value                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Source release           | `77d53d40c03fa141606f112423e30c564be25f47`                                                 |
| Program                  | `A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP`                                             |
| Program data             | `HqyJXBW5jNxx9uUPYNQpKSKANKNtBcB1tTyEj8f5cgiT`                                             |
| Deploy slot              | `481084063`                                                                                |
| Deploy signature         | `5YAXg7LW4VebydzfGvHzomytAdTGCZLyB3sLBwgy1R8n4ryQjTfdn66FTRnh9Eo3CK5sbhZkMPfhi3JhJcJnXcD8` |
| Protocol config          | `B1u7TxnDJtmh6CRugrSYQiRhanDzJXGMoJw5DkgH1ftL`                                             |
| Genesis authority        | `94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i`                                             |
| Initialization signature | `5qwoS5DjPP89qwsEAfm7acWERKyPDhVsX3YZmcRgitjiSQgXTZx77cqgGfmF4VXaWYGkNqPfQVeaPhZDu8r3LcCa` |
| Service authority        | `8BiVyKRMyqQm4t1J3UanjpdxfsLUuUMpntWz5AKoX31`                                              |
| Role grant               | `944DuaJyACr8VFmLXisySqqhJtLkyXguPd9CZdk1nw2P`                                             |
| Role grant signature     | `3EkzxYvFqYv55M5NriYUYXyPGVPkox7HW2jufgvCPFVbj7hiZVwgBdqzVQwDVQ2VBjQ76wovieZEcZG5cRUHXsE6` |
| Active role bits         | `15` (`issue`, `lifecycle`, `handoff`, `removal`)                                          |
| Unpause signature        | `5rTE56etKkPVub8F1i7m8isnmGb5wbC8UpZNDm6nC5Bujpg1WLVLWEPzSUQ5TCvt3mBmyb9jQktCMq1kMY8v6g2V` |
| Service balance          | `100000000` lamports (`0.1` devnet SOL)                                                    |

The program account is executable and owned by the upgradeable BPF loader. The
protocol reports version 2, the frozen genesis authority, an active service
role, and `paused=false`. A second run of the bootstrap command produced an
empty signature list, proving that the checked-in procedure is idempotent:

```bash
npm run chain:bootstrap:devnet
```

Public inspection:

- [program](https://explorer.solana.com/address/A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP?cluster=devnet)
- [protocol config](https://explorer.solana.com/address/B1u7TxnDJtmh6CRugrSYQiRhanDzJXGMoJw5DkgH1ftL?cluster=devnet)
- [service role grant](https://explorer.solana.com/address/944DuaJyACr8VFmLXisySqqhJtLkyXguPd9CZdk1nw2P?cluster=devnet)

The service private key remains in the ignored local deployment directory. It
must enter Cloudflare only through a Worker secret and must never enter Vercel,
GitHub, the repository, application data, or logs.

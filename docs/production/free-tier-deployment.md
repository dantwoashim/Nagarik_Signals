# Zero-Cost Constrained Pilot

This profile preserves the production architecture while imposing hard usage
ceilings. It is suitable for a small, non-commercial, partner-operated pilot.
It is not an SLA-backed nationwide service.

## Service Map

| Capability                   | Service                                 | Hard pilot boundary                                                                                |
| ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Next.js web and bounded APIs | Vercel Hobby                            | Keep within the included invocation, CPU, memory, and transfer quotas                              |
| Scheduler and v2 signer      | Cloudflare Workers Free                 | Four of five Cron Triggers plus one exact policy-bounded non-mainnet signing route                 |
| Postgres and managed auth    | Supabase Free                           | 500 MB database, 50,000 monthly active users, no provider automatic backups                        |
| Private media                | Vercel Private Blob                     | 1 GB storage, 2,000 advanced operations, and 10 GB transfer per included period                    |
| Independent Solana reads     | Helius Free and Alchemy Free            | Non-mainnet custom profile, bounded requests, no provider SLA                                      |
| CI and recovery jobs         | GitHub Actions in the public repository | Standard runners only; encrypted artifacts; bounded retention                                      |
| Custody                      | Cloudflare encrypted Worker secret      | Dedicated low-balance non-mainnet key; exact transaction policy; independent review still required |

Current schedules produce approximately 56,190 wakeup requests in a 30-day
month: 43,200 outbox, 8,640 health, 4,320 reconciliation, and 30 retention.
This is a capacity estimate, not evidence; the controlled canary must measure
real invocation and CPU use before activation.

## Required Controls

1. Deploy `infra/cloudflare-scheduler` and store `CRON_SECRET` as a Cloudflare
   secret. The value must exactly match Vercel Production and must not be used
   for any other purpose.
2. Keep Vercel deployment schedules absent. Cloudflare owns all four wakeups.
   Store the v2 key only as a Cloudflare secret and give Vercel only the
   independent signer bearer, endpoint, and public key.
3. Enable provider usage notifications and treat any quota warning as a
   capacity incident. Free tiers stop or degrade instead of silently changing
   the release profile.
4. Enable `.github/workflows/backup-restore.yml`. It keeps five weekly,
   restore-tested encrypted database snapshots for 35 days and fails when the
   48 MiB per-snapshot pilot ceiling is exceeded.
5. Keep public intake, signals, publication, and v2 writes closed until the
   dependency checks, signer, restore, rollback, canary, and human gates pass.
6. Keep `NAGARIK_MAINNET_WRITES=false` and reject any mainnet endpoint or
   genesis hash.
7. Run a signing canary and inspect Cloudflare CPU/error metrics before opening
   v2 writes. The Free plan allows 10 ms CPU per HTTP request; a repeated CPU
   limit error closes the write capability rather than changing custody.

## Provider References

- [Vercel Hobby limits](https://vercel.com/docs/plans/hobby)
- [Vercel Private Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Supabase Free plan](https://supabase.com/pricing)
- [Helius plans](https://www.helius.dev/docs/billing/plans)
- [Alchemy pricing](https://www.alchemy.com/pricing)
- [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub Actions artifact retention](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)

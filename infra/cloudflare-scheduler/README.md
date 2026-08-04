# Cloudflare Edge Operations

This Worker wakes the four bounded Nagarik internal routes while the Next.js
application remains on Vercel Hobby. It stores no civic data and performs no
domain mutation itself. Postgres leases, idempotency, retry state, and dead
letters remain authoritative.

It also exposes one exact `POST /sign` route for the non-mainnet v2 service
authority. The route accepts a single unsigned legacy transaction, requires a
dedicated bearer, and signs only when the fee payer, signer count, program,
instruction count, account indexes, size, and Anchor discriminator match the
frozen policy. Vercel simulates the transaction before requesting a signature
and verifies that the returned message is byte-identical.

## Deploy

1. Generate a dedicated Solana keypair for this non-mainnet program. Fund it
   only with the minimum test currency required by the controlled pilot and
   grant only the v2 protocol role.
2. From this directory, run `npx wrangler login` and `npx wrangler deploy`.
3. Add `CRON_SECRET` as a Worker secret with the same independent value used in
   Vercel Production.
4. Add three more Worker secrets: `NAGARIK_SIGNER_AUTH_SECRET`,
   `NAGARIK_SIGNER_KEYPAIR_BASE64`, and `NAGARIK_SIGNER_PUBLIC_KEY`. The auth
   secret must be independent and at least 32 random bytes. The keypair value
   is the base64 encoding of the 64 raw bytes in the Solana keypair JSON.
5. Configure Vercel Production with the Worker URL plus `/sign`, the same signer
   auth secret, the public key, and custody ID
   `cloudflare-secret/nagarik-v2-signer`.
6. Confirm all four Cron Triggers appear in Cloudflare, run one controlled
   signing canary, and inspect Worker CPU/error metrics. Keep v2 writes closed
   if signing approaches the Free plan's 10 ms CPU ceiling.

Use `wrangler secret put` or the Cloudflare dashboard so secret values never
enter `wrangler.toml`. Do not commit `.dev.vars`, put a keypair in Vercel, fund
the authority on mainnet, or change `NAGARIK_BASE_URL` to a preview deployment.

The signer is isolated secret custody for the constrained non-mainnet pilot,
not a hardware KMS. Independent custody review and the signer-compromise
runbook remain mandatory before operational v2 writes.

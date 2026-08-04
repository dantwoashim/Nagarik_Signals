# Cloudflare Scheduler

This Worker wakes the four bounded Nagarik internal routes while the Next.js
application remains on Vercel Hobby. It stores no civic data and performs no
domain mutation itself. Postgres leases, idempotency, retry state, and dead
letters remain authoritative.

## Deploy

1. Create a Cloudflare Workers application on the Free plan.
2. From this directory, run `npx wrangler login` and `npx wrangler deploy`.
3. Run `npx wrangler secret put CRON_SECRET` and enter the same independent
   value configured as `CRON_SECRET` in Vercel Production.
4. Confirm all four Cron Triggers appear in the Cloudflare dashboard.
5. Invoke each route once and verify a successful, redacted runtime event.

Do not commit `.dev.vars`, copy the bearer into `wrangler.toml`, expose a raw
worker route publicly, or change `NAGARIK_BASE_URL` to a preview deployment.

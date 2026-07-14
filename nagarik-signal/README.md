# Nagarik Signal: Product and Runtime

This directory contains the active web application, Anchor program, source manifests, proof tools, and runtime documentation. Start with the [repository README](../README.md) for the product overview.

## Runtime Layout

```text
apps/web/                    Next.js application and API routes
programs/nagarik_signal/    Anchor program
data/read-model/            Bundled public snapshot and local state
data/public-sources/         Cited source manifest and devnet receipts
scripts/                     Import, proof, smoke, and maintenance tools
idl/                         Checked program interface
```

## Storage Modes

`NAGARIK_STORAGE_MODE=local` uses an atomically replaced JSON file and local media directory. This is the default for development.

`NAGARIK_STORAGE_MODE=blob` uses private Vercel Blob objects for both the read model and sanitized evidence. Fixed-path state updates use ETag compare-and-swap and bounded conflict retries. Evidence is delivered through `/api/media/:hash.ext` with private, no-store caching, so moderation can block unsafe media without deleting the on-chain commitment.

The PostgreSQL schema in [`apps/web/lib/db/schema.sql`](apps/web/lib/db/schema.sql) remains the normalized adapter target from the master architecture. It is not presented as the current production write adapter.

## Local Development

```bash
npm ci
npm run seed:demo
npm run dev
```

Open `http://127.0.0.1:3001`.

The bundled model includes four public-source records, thirty illustrative samples, and retained QA fixtures. Public queries include only `community_report` and `public_source`; samples require an explicit scope; QA fixtures are never returned by list APIs.

Interactive maps use MapLibre GL JS with an OpenFreeMap vector style and visible OpenStreetMap attribution. Public issue coordinates are rounded before rendering, and the report picker rounds a one-time browser location fix before placing it on the map. Set `NEXT_PUBLIC_NAGARIK_MAP_STYLE_URL` to switch to another compatible hosted or self-managed MapLibre style without changing application code.

## Writable Configuration

Copy the values described by [`.env.example`](.env.example) into the deployment environment. Production writes fail closed unless the required secrets exist.

Required for hosted writes:

- `NAGARIK_STORAGE_MODE=blob`
- `BLOB_READ_WRITE_TOKEN`
- `NAGARIK_RELAYER_SECRET_KEY`
- `NAGARIK_SESSION_DERIVATION_SECRET`
- `NAGARIK_COOKIE_SECRET`
- `NAGARIK_UPLOAD_RECEIPT_SECRET`
- `NAGARIK_RATE_LIMIT_SALT`
- `NAGARIK_RATE_LIMIT_PEPPER`
- `NAGARIK_STEWARD_SECRET`
- `NAGARIK_REINDEX_SECRET`
- `NAGARIK_ALLOWED_ORIGINS`

Use independent random values. Do not reuse the relayer secret as an application secret.

## Data and Proof Commands

```bash
npm run seed:demo
npm run sources:render
npm run sources:import
npm run verify:proof -- --issue-id 15
npm run proof:read -- --issue-id 15
npm run sessions:sweep
```

`sources:import` performs devnet writes. `sessions:sweep` defaults to a dry run; use its explicit execution flag only after reviewing the planned transfers.

## Quality Gates

```bash
npm run test:unit
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run anchor:build
npm run final:preflight
```

The browser suite checks desktop and mobile overflow, source/sample separation, evidence rendering, public wording, proof interaction, and core navigation. The preflight verifies API behavior and proof surfaces against a running app.

## Proof Boundary

The verifier checks canonical metadata, approximate location, timeline state, counters, resolution state, and the SHA-256 hash of delivered evidence bytes against the Issue PDA. A passing result proves consistency with the committed devnet account. It does not establish physical truth, proof of personhood, official acknowledgement, or legal finality.

See [Architecture](ARCHITECTURE.md), [Security model](docs/security-model.md), [Data provenance](docs/data-provenance.md), and [Safety](SAFETY.md).

# Support

Nagarik Signal is not an emergency or dispatch service. For immediate danger,
use the appropriate local emergency or municipal channel.

## Public Support

Open a GitHub issue for reproducible setup, build, documentation, or
public-interface defects. Include:

- operating system;
- exact Node and npm versions;
- release commit;
- command or page involved;
- complete error text with secrets and personal data removed;
- whether the failure uses local synthetic data or a hosted public read.

## Private Requests

Use the private process in [`SECURITY.md`](SECURITY.md) for:

- security vulnerabilities;
- accidental private-data exposure;
- leaked capabilities, credentials, or storage references;
- sensitive removal or privacy concerns.

Do not post evidence images, personal details, private submission IDs, tracking
links, or operator diagnostics in a public issue.

## Maintainer Checks

```bash
npm ci
npm run verify
npm run db:test
npm run build
npm run test:e2e
npm run audit:production
npm run audit:security
npm run verify:release:report
```

Anchor protocol changes also require the Rust and generated-IDL gates listed in
[`README.md`](README.md). Support and response times are best effort; no service
level agreement is currently offered.

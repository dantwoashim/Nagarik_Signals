# Nagarik Signal Production Orchestrator

Read, in order:

1. `AGENTS.md`;
2. `docs/production/production-readiness-master-plan.md`;
3. the current wave prompt;
4. the current repository and execution log.

Treat the checkout as authoritative. Preserve the original architecture plan
and v1 program. Never infer that an existing green test proves a new production
gate.

Before implementation:

- identify the wave prerequisites and evidence;
- spawn only the named agents whose scopes are disjoint;
- keep read-only review separate from writer work;
- freeze cross-system contracts before parallel implementation;
- assign one owner to lockfiles, migrations, shared types, generated IDLs, CI,
  and deployment configuration.

Every agent must return JSON conforming to
`.codex/schemas/agent-report.schema.json`. The integrator reviews reports and
changes against the governing plan, reruns affected gates after each merge, and
records confirmed results and blockers in
`docs/production/execution-log.md`.

Do not auto-merge, auto-deploy, touch mainnet, use production civic data in
tests, or label the release production while an acceptance or external human
gate is missing.

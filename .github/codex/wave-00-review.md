# Wave 0 Contract Review

Review the proposed change without editing the repository.

1. Read the production-readiness master plan, all Wave 0 production contracts,
   and ADRs 0001-0007.
2. Identify any contradiction in authority, ordering, public/private data,
   idempotency, state transitions, operator roles, media access, retention,
   v1/v2 versioning, proof meaning, network profile, or release labels.
3. Trace each finding to an exact file/symbol or contract paragraph.
4. Flag any requirement that an implementation workstream would still need to
   invent.
5. Check that external human gates are never represented as automated passes.
6. Assess whether the frozen contracts are complete enough for Wave 1
   implementation. Do not mistake contract acceptance for production release
   approval: the runtime and release remain `NO_GO` until all later gates pass.
7. Return exactly `ACCEPT` when no contract blocker remains, or `BLOCK` followed
   by prioritized, actionable contract findings. Runtime defects already
   captured by the baseline audit are not Wave 0 blockers unless the contracts
   fail to specify their replacement.

Do not run write commands, expose secrets, modify branches, merge, deploy, or
weaken a gate to make the review pass.

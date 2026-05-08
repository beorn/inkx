---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine
created_at: 2026-05-08T06:22:51.842Z
---

# [/] Migration and legacy quarantine #P0 @agent/3

Quarantine old runtime/projection paths behind named compatibility boundaries, migrate phase by phase, delete obsolete output gates and renderer-owned inference, and require grep evidence before closing.

## Ownership

This phase owns deletion and only deletion:

- Delete or quarantine old live-path names and adapters.
- Keep cleanup beads filed before substrate phases close.
- Measure exact grep counts before closing.
- Do not introduce new architecture here.

## Known Cleanup Beads

- `delete-output-gate-and-queue-shims`
- `delete-sessionupdatelist-messageentry-routing`
- `delete-chat-channel-and-reasoning-names`
- `delete-legacy-plan-todo-compat`

## Complete Criteria

- Every cleanup bead above is closed with actual grep counts and tests.
- No `@deprecated`, compatibility re-export, fallback, or dual renderer path remains in live Silvercode code.
- Historical docs/beads may keep old names only when clearly marked historical or replacement-map text.

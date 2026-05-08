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

- `delete-output-gate-and-queue-shims` — closed.
- `delete-chat-channel-and-reasoning-names` — closed.
- `chunk-reconciliation-normalization` — closed under phase 04; leaves no live chunk-stitching blockers.
- `delete-sessionupdatelist-messageentry-routing` — open; measured 47 files / 300 app-scope hits, with production `ChatPane` still on `SessionUpdateList`.
- `delete-legacy-plan-todo-compat` — open; app drawer is on projected `ChatPlan`, but public `@km/agent-harness` `AgentPlan*` / `SessionState.todos` deletion requires `/arch`.

## Complete Criteria

- Every cleanup bead above is closed with actual grep counts and tests.
- No `@deprecated`, compatibility re-export, fallback, or dual renderer path remains in live Silvercode code.
- Historical docs/beads may keep old names only when clearly marked historical or replacement-map text.

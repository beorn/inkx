---
id: "@km/tui/asana-recurrence"
aliases:
  - km-tui.asana-recurrence
  - km-tui-asana-recurrence
created_by: claude:d697f216
created_at: 2026-02-25T21:25:39Z
closed_at: 2026-02-25T23:43:38Z
owner: bjorn@stabell.org
---

# [x] Set recur_prev links between Asana recurring task instances during import @km/tui #feature #P2

Asana recurring task instances have `→ ^{parentTaskGid}` in their name, linking to the template task.

The importer currently strips the suffix and creates an `embed_source` link. It should also set `recur_prev` to chain the instances together, preserving the recurring task relationship without trying to infer an RRULE.

## Approach

Use `recur_prev` to link recurring instances:
1. Group tasks by their template parent (via `→ ^GID` pattern)
2. Sort instances by due_at or created_at
3. Set `recur_prev` on each instance pointing to the previous instance
4. First instance's `recur_prev` points to the template task

No RRULE inference needed — the chain of `recur_prev` links preserves the relationship faithfully.

## Files
- `apps/km-cli/src/import/adapters/asana/task-transform.ts` — already extracts parentTaskGid
- `apps/km-cli/src/import/convert.ts` — itemToNodes() where recur_prev would be set
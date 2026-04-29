---
id: "@km/all/node-model-v2/quick-wins"
aliases:
  - km-all.node-model-v2.quick-wins
  - km-all-node-model-v2-quick-wins
created_by: claude:36393b5d
created_at: 2026-02-19T01:24:42Z
closed_at: 2026-02-19T01:54:01Z
---

# [x] Quick wins: Asana import li->oi + reconvert @km/all #task #P2

Quick wins that can be done now without the full model v2 migration.

1. Asana import: change tasks from li to oi (3 lines in convert.ts: lines 161, 221, 647)
2. Re-run Asana import to regenerate markdown files with oi tasks
3. Verify TUI renders the converted data correctly

These changes make Asana tasks proper outline items (cards/columns) instead of checklist items, which fixes the flat-list body problem and improves navigation.
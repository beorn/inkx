---
id: "@km/tui/rename-column-cursor-null"
aliases:
  - km-tui.rename-column-cursor-null
  - km-tui-rename-column-cursor-null
created_by: Bjørn Stabell
created_at: 2026-04-06T19:44:57Z
closed_at: 2026-04-06T20:33:43Z
close_reason: "Fixed: (1) renameNode in real repo + fakeRepo now updates
  node.data.name when present, so getNodeDisplayName reflects the rename instead
  of returning the stale frontmatter title; (2) handleInlineEditConfirm in
  tree-node-edit.tsx now re-anchors the cursor with
  sel.node.select([displayNode.id]) after both the rename and the bare
  content-update branches, so post-rename normalization against a fresh
  walkOrder cannot leave the cursor null (preventing the cursor-not-null
  invariant violation). Regression tests added in
  apps/km-tui/tests/inline-edit.slow.spec.ts under 'Inline Edit — Folder/Section
  Nodes' covering both the sigil-prefixed and plain rename scenarios. Note: the
  bead's hypothesis about node IDs changing on folder rename was incorrect — IDs
  are stable across renames; the actual cursor-null cause is selection
  normalizing against the rebuilt walkOrder. Five Whys analysis identified the
  deeper structural cause as overlapping name/data.name fields and missing
  rename spec — bead candidates for follow-up."
---

# [x] [bug] Renaming column (folder) to sigil name causes cursor-null crash @km/tui #bug #P1 @Bjørn Stabell

Repro: Rename a column from 'name' to '+name' (adding sigil prefix). The column is a folder node.

Error: InvariantViolationError: cursor-not-null — Cursor is null but board has 8 columns with real cards.

Root cause hypothesis: Renaming a folder changes its filesystem path, which changes the node ID (IDs are path-derived). The cursor still references the old ID which no longer exists. The rename pipeline doesn't update the cursor to follow the new ID.

The rename job (jobRunner) likely runs async — the repo updates the node ID but the cursor/selection system isn't notified of the ID change. By the time the next render runs, cursor points to a ghost ID.
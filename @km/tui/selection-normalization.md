---
id: "@km/tui/selection-normalization"
aliases:
  - km-tui.selection-normalization
  - km-tui-selection-normalization
created_by: Bjørn Stabell
created_at: 2026-04-11T00:41:25Z
closed_at: 2026-04-18T08:16:34Z
close_reason: Largely complete via @silvery/selection's sel.transform() — that
  IS the SlateJS-style normalization fixpoint. Called after REPO_MOVE,
  REPO_DELETE, REPO_ADD in board-effect-runner.ts and from executeBatchDelete.
  Manual findNearestSurvivor logic replaced by transformSelection. See
  feat/selection-plateau (and silvery-selection/src/transform.ts).
---

# [x] Selection normalization: auto-adjust selection after tree mutations @km/tui #feature #P1

blocks:: [[@km/silvery/selection-focus-plateau]]

After any tree mutation that invalidates the current selection (deleted node, merged node, moved node), a normalizer auto-adjusts selection to the nearest valid position.

Current: executeDelete has manual cursor-repair logic (findNearestSurvivor). Each operation re-implements "where should the cursor go?" independently.

Target: One normalization function runs after every Tree.apply() batch. If selection points to a nonexistent node, it moves to the nearest valid target. Same logic for all operations — no per-operation cursor repair.

Inspired by SlateJS's normalization fixpoint loop.

Depends on: @km/all/unified-selection, @km/tui/atomic-tree-ops
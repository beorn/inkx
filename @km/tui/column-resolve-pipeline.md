---
id: "@km/tui/column-resolve-pipeline"
aliases:
  - km-tui.column-resolve-pipeline
  - km-tui-column-resolve-pipeline
created_by: claude:f8196c1c
created_at: 2026-03-28T06:25:14Z
closed_at: 2026-03-28T07:20:01Z
close_reason: CardView extends KNode with pre-resolved embed data.
  virtualCardIds deleted. Column construction batch-resolves via getNodesBatch.
  TreeNode uses CardView at depth 0. 4717 tests pass.
---

# [x] Resolve embeds + body/structural at column construction, not render time @km/tui #task #P1 @claude:f8196c1c

Currently scattered across render-time code:
- extractBody called 88x across 10 files (re-derived per TreeNode)
- resolveEmbed called per TreeNode (N+1 lookups)
- virtualCardIds computed at 4 different sites in use-columns.ts
- maxContentLines slices BEFORE extractBody (body competes with structural)
- isBody prop drilled through TreeNode → FoldAwareChild → FoldedChildRow

Fix: useColumns builds column data with embeds resolved, body/structural split done, each card marked with { isBody, isEmbed, resolvedContent }. TreeNode just renders what it's given.

Subtasks:
1. Batch-resolve embed_source in useColumns (one query, not N+1)
2. Move extractBody to column construction
3. Apply maxContentLines AFTER body/structural split (body doesn't compete)
4. Remove isBody prop drilling — card already knows
5. Remove resolveEmbed from TreeNode
6. Consolidate virtualCardIds logic to one site
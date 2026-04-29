---
id: "@km/tui/tree/v4/p5-fold-sticky"
aliases:
  - km-tui.tree.v4.p5-fold-sticky
  - km-tui-tree-v4-p5-fold-sticky
created_by: Bjørn Stabell
created_at: 2026-04-09T04:10:57Z
closed_at: 2026-04-09T04:25:59Z
close_reason: syncFoldDepths + syncStickyFolds inlined in Board.tsx, deleted
  from reactive.ts. Commit 993102171.
owner: bjorn@stabell.org
---

# [x] Phase 5: Eliminate syncFoldDepths + syncStickyFolds — direct signal writes @km/tui #task #P2

## What

Delete syncFoldDepths and syncStickyFolds methods from reactive.ts. Board.tsx writes fold/sticky signals directly, same pattern as Phase 2 (sync method elimination).

## Changes

- \`reactive.ts\` — delete syncFoldDepths (~12 LOC), syncStickyFolds (~15 LOC), remove from return object
- \`Board.tsx\` — replace 2 sync calls (lines 688-704) with inline diff logic writing \`reduced.get(id).foldOverride()\` and \`reduced.get(id).sticky()\` directly

## Delete

- syncFoldDepths method
- syncStickyFolds method
- prevFoldDepthsRef, prevStickyFoldsRef in Board.tsx (if possible — may still need prev-tracking)

## /complete

\`\`\`bash
rg 'syncFoldDepths|syncStickyFolds' --glob '!.beads' --glob '!docs' --glob '!*.md' -t ts -c | wc -l  # 0
bun tsc --noEmit  # 0 new errors
bun vitest run apps/km-tui/tests/board-view.spec.ts apps/km-tui/tests/fold.slow.test.ts  # all pass
\`\`\`
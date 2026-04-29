---
id: "@km/tui/detail-unify-real"
aliases:
  - km-tui.detail-unify-real
  - km-tui-detail-unify-real
created_by: Bjørn Stabell
created_at: 2026-04-09T07:48:31Z
---

# [!] Unify detail view as board viewMode — same lens, same tree, same signals @km/tui #task #P0

blocks:: [[@km/all/surface-freeze]]

## Why

Detail view (DetailView.tsx) is a parallel rendering path with its own component tree (DocContent/DocNode), navigation (createDetailViewNavigation), and viewMode === "detail" branches throughout Board/BoardView/CardColumn. This blocks the quality plateau:

- Board.tsx has viewMode === "detail" branches throughout
- DetailView.tsx is a separate component tree from CardColumn/TreeNode (620 LOC)
- createDetailViewNavigation is separate from board navigation (~90 LOC)
- DocContent/DocNode duplicate what TreeNode already does

## Goal

Detail view should be just-another-viewMode like cards/columns/tabs. Same:
- visibleLens for column derivation
- TreeNode component tree
- NodeStore signals
- Navigation (next/prev/parent/children on the tree)

The differences are LAYOUT only:
- Full-width single column instead of horizontal kanban
- Metadata rows shown above content
- Body block expanded by default

These should be view-mode props on the same components, not a separate code path.

## What gets deleted (REVISED)

- DetailView.tsx (separate component tree) — replace with thin layout wrapper or fold into BoardView
- createDetailViewNavigation (separate nav system) — replace with shared tree-based nav
- viewMode === "detail" special cases in Board/BoardView/CardColumn/board-app/useBoardController
- Possibly ColumnSnapshot (deferred to @km/tui/column-snapshot-delete)

## OUT OF SCOPE (deferred)

Virtual __body__ KNode pattern — see @km/board/body-virtual-cleanup. Removing this without a replacement breaks body content rendering. The virtual KNode is doing real work and a naive "delete it" replaces 1 localized lie with N distributed lies. Tracked separately.

## Approach

Phased refactor in worktree:

- Phase 2: Delete createDetailViewNavigation, route detail mode through shared tree-based navigation
- Phase 3: Replace DocContent/DocNode with TreeNode (with detail-mode props for layout differences)
- Phase 4: Eliminate viewMode === "detail" branches from Board/BoardView/CardColumn/board-app/useBoardController

## /complete

```
rg "function DocContent|function DocNode" apps/km-tui/src/views/DetailView.tsx | wc -l   # 0
rg "createDetailViewNavigation" --glob "!.beads" -t ts -c | wc -l                         # 0
rg "viewMode === ..detail.." apps/km-tui/src/views/Board.tsx | wc -l                      # 0
rg "viewMode === ..detail.." apps/km-tui/src/views/BoardView.tsx | wc -l                  # 0
bun run test:fast  # pass
```

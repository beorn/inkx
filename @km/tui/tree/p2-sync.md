---
mentions:
  - km
id: "@km/tui/tree/p2-sync"
aliases:
  - km-tui.tree.p2-sync
  - km-tui-tree-p2-sync
created_by: Bjørn Stabell
created_at: 2026-04-08T23:58:42Z
closed_at: 2026-04-09T00:27:51Z
close_reason: Sync methods deleted (syncCursor, syncSelected, syncEdit).
  Board.tsx writes signals directly. expandWithDescendants + collectDescendants
  purged from reactive.ts. Commit f63488fa5.
owner: bjorn@stabell.org
---

# [x] Phase 2: Eliminate sync methods — Board.tsx writes signals directly @km/tui #task #P1

## What

Delete syncCursor, syncSelected, syncEdit methods. Board.tsx writes primary signals directly. Delete expandWithDescendants (selectedAncestor signal replaces it). Delete expandedEditCardId bridge (editingDescendant signal replaces it).

## Changes

- \`reactive.ts\` — delete syncCursor (~25 LOC), syncSelected (~40 LOC), syncEdit (~30 LOC), expandWithDescendants + collectDescendants (~30 LOC), expandedEditCardId signal
- \`Board.tsx\` — replace 4 sync calls with direct signal writes: store.cursor(nodeId, true), store.selected(nodeId, true), store.edit(nodeId, editState)
- \`testing.ts\` — replace syncCursor call with direct signal writes
- \`TreeNode.tsx\` — replace expandedEditCardId reads with editingDescendant signal reads

## Delete

- syncCursor, syncSelected, syncEdit methods
- expandWithDescendants, collectDescendants functions (in reactive.ts only — undoable-repo.ts has its own independent collectDescendants)
- expandedEditCardId signal

## /complete

\`\`\`bash
rg 'syncCursor|syncSelected|syncEdit' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
rg 'expandWithDescendants' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0 (reactive.ts only — undoable-repo.ts keeps its own)
rg 'expandedEditCardId' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
bun run test:fast  # all pass
\`\`\`


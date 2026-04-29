---
id: "@km/_orphan/nx8af"
aliases:
  - km-nx8af
created_by: claude:b92140a2
created_at: 2026-03-17T21:51:35Z
closed_at: 2026-03-18T19:32:06Z
close_reason: "Fixed: added getNavigableChildren() that filters index files from
  navigation. Changed 4 call sites in view-navigation.ts + initial cursor in
  state.ts. 7 tests added."
---

# [x] Bug: early-orbit/.md column + ghost cursor on j navigation @km/_orphan #bug #P1 @claude:d29abbfa

Two related bugs at stabell level in Asana vault (bun km view --repo imports/asana launch-academy, then Z Z):

## Bug 1: early-orbit / .md shows as single wide column
At stabell level, the early-orbit folder renders as a single wide column with header 'early-orbit / .md'. Should show the folder with its children as cards (not the index file merged into the column name). The index file detection works (findIndexFile returns the correct node) and sections exist (11 outline children), but the TUI column rendering at the PARENT level merges folder+file incorrectly.

Key: this is about how kNodeToColumnView renders a folder-as-column at the PARENT level, not about expandIndexFileColumns (which works correctly when zoomed INTO the folder).

## Bug 2: Ghost cursor on j navigation  
After Z Z to stabell level, with Launch Academy card selected in the early-orbit column, pressing j once makes the cursor disappear. Pressing j again makes it reappear at the next card below. Likely caused by the folder node and its index file node both being in the navigation list, with the index file being invisible (hidden by our findIndexFile filter) but still navigable.

## Repro
bun km view --repo imports/asana launch-academy
Z Z (zoom out twice to stabell level)
j (cursor disappears — ghost node)
j (cursor reappears at next card)

## Root cause hypothesis
kNodeToColumnView filters out index files from cardNodes (commit 23021143), but the node is still in the navigation index (buildNodeIndex). The cursor can land on the invisible index file node, causing a 'ghost' position.

## Files to investigate
- apps/@km/tui/src/hooks/use-columns.ts — kNodeToColumnView index file filtering
- apps/@km/tui/src/hooks/use-columns.ts — buildNodeIndex  
- apps/@km/tui/src/views/CardColumn.tsx — card rendering
- The deduplicateByFsPath logic — could folder+file be merging
---
id: "@km/silvery/1/1-km-adopts-ag-node-interactive-signals-use-node-sel"
aliases:
  - km-silvery.1.1
  - km-silvery-1-1
  - "@km/silvery/1/1"
created_by: Bjørn Stabell
created_at: 2026-04-04T09:05:51Z
closed_at: 2026-04-05T07:52:28Z
---

# [x] km adopts ag-node interactive signals — use node.selected/hovered/armed/focused throughout km-tui @km/silvery #task #P1

Roll out per-node interactive signals in @km/tui as the first consumer. Flesh out the pattern in a real app before standardizing in silvery.

## What changes

Replace all global selection/hover/focus checks in @km/tui with per-node signal reads:

- Card/TreeNode components: read node.selected instead of sel.node.ids.has(myId)
- Hover effects: read node.hovered instead of hoverId === myId
- Focus ring: read node.focused instead of FocusManager queries
- Armed/pressed state: read node.armed for button-like components (checkboxes, collapse toggles)
- Cursor indicator: read node.selected + isCursor derived signal

## Selection store integration

sel.node.select([id]) internally:
1. Diff old selection vs new
2. Write node.selected = false on removed nodes (typically 1)
3. Write node.selected = true on added nodes (typically 1)
4. Result: 2 signal writes for a cursor move, not a full set recomputation

## What we learn

- Performance: are per-node signals faster than global set checks in practice?
- API ergonomics: is node.selected natural to read in components?
- Lifecycle: what happens when nodes mount/unmount (virtualization)?
- Scope: which signals are worth having (selected, hovered, armed, focused, dropTarget, dragging)?
- Theme: can silvery auto-apply default styles based on node signals?

## After km proves it

Extract the pattern into silvery core:
- ag node gets interactive signal slots
- Selection/pointer/focus systems write to them
- Default theme reads them for base interactive styling
- Apps override by reading signals + applying custom styles
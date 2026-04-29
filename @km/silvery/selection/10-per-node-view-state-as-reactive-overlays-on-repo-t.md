---
id: "@km/silvery/selection/10-per-node-view-state-as-reactive-overlays-on-repo-t"
aliases:
  - km-silvery.selection.10
  - km-silvery-selection-10
  - "@km/silvery/selection/10"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:40:40Z
closed_at: 2026-04-05T17:49:05Z
close_reason: "Exploration complete: per-node reactive overlays rejected in
  favor of current ViewSnapshot + column cache. The procedural build is simpler
  and faster for km's 20-2000 node trees."
---

# [x] Per-node view state as reactive overlays on repo tree @km/silvery #task #P3

Replace ViewTree (parallel tree structure) with per-node reactive view state overlaid on the repo tree.

## Current: ViewTree
- Separate tree rebuilt every key event via buildViewTree()
- Each ViewNode has: role, parent, children, isBody, resolvedEmbed
- Goes stale between key events

## Target: Per-node reactive overlays  
- role: computed from (depth relative to root, node.type)
- visible: computed from (foldDepths, hiddenNodeIds, collapsedNodes)
- selected/cursor/armed: per-node signals (@km/silvery/1)
- Parent/children: repo tree (the real structure)

## What ViewTree provides that overlays need to handle
1. Virtual nodes (__body__ column) — synthetic, not in repo
2. Embed resolution — visual parent ≠ data parent
3. Role assignment — depth-based, changes with zoom

## Design questions
- How do virtual nodes work without a parallel tree?
- Can embeds be handled via a 'resolvedParent' overlay?
- Performance: is per-node computed cheaper than full tree rebuild?
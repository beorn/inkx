---
id: "@km/silvery/ag-scene-ready"
aliases:
  - km-silvery.ag-scene-ready
  - km-silvery-ag-scene-ready
created_by: claude:fed8de9e
created_at: 2026-03-30T17:42:00Z
---

# [ ] ag scene-ready (v2.0 prep): incremental refactors toward SceneNode @km/silvery #epic #P3

Incremental refactors to evolve AgNode toward a v3-ready SceneNode shape. Each step is backwards-compatible or a contained breaking change. Do these now/soon so ag is ready when ag-draw needs it.

## Refactors (in order)

### 1. Dirty flags → bitmask
Replace 7 boolean fields with a single dirtyBits number. Internal refactor, no API change.
- layoutDirty, contentDirty, stylePropsDirty, bgDirty, subtreeDirty, childrenDirty, layoutChangedThisFrame → dirtyBits bitmask
- Faster (bitwise ops), less memory, generic (not terminal-specific)

### 2. Add interaction metadata
Add optional fields to AgNode: hitTestSpec, focusable, tabIndex. Currently focus info is derived from props — making it explicit on the node prepares for the interaction index.

### 3. Add new node kinds
Currently: silvery-root | silvery-box | silvery-text. Add:
- silvery-path (vector drawing, for ag-draw)
- silvery-viewport (pan/zoom container)
- silvery-image (explicit, not overloaded on box)
These are backwards-compatible — existing code ignores unknown types.

### 4. Add layout modes
Currently all nodes use Flexily flex layout. Add:
- absolute: { x, y, width?, height? } — no Flexily, positioned directly
- none: invisible to layout (semantic-only nodes)
Backwards-compatible — default is still flex.

### 5. Collapse dual tree (breaking)
AgNode.children + FlexilyNode.children are kept in sync. Eliminate the duplication:
- FlexilyNode owns the topology (children, parent)
- AgNode references its FlexilyNode but doesn't mirror children/parent
- Reconciler host-config rewrite: appendChild/removeChild operate on FlexilyNode
- Tree queries (focus, events) walk FlexilyNode tree with metadata lookup
This is the biggest change. Do it as one atomic refactor.

### 6. Kind-specific props (breaking)
Replace BoxProps | TextProps union with discriminated types per node kind:
- BoxNode: { background, border, radius, shadow }
- TextNode: { paragraph, color }
- PathNode: { path, fill, stroke }
- etc.
Requires updating every component and consumer. Do after dual-tree collapse.

### 7. Extract terminal render cache
Move prevLayout, prevScreenRect, prevRenderRect, terminal-specific dirty tracking out of the core node into ag-term-owned side tables. Core SceneNode has generic dirtyBits; ag-term adds its own caches.

## Done when
- AgNode is slim: kind, layout mode, flex node, computed rects, dirty bits, interaction metadata
- Terminal-specific fields are in ag-term, not ag
- New node kinds work (path, viewport, image)
- Absolute positioning works alongside flex
- Dual tree is collapsed
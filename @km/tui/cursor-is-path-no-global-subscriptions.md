---
aliases:
  - km-tui.cursor-is-path-no-global-subscriptions
  - km-tui-cursor-is-path-no-global-subscriptions
created_at: 2026-05-08T21:55:02.778Z
---

# Cursor identity is a visual path, not a node id #bug #P0

## Problem

The current cursor identity is still fundamentally `nodeId`-based. Embedded cards make the same logical node render in multiple visual occurrences, so `nodeId` is not enough to decide which occurrence owns the cursor. The recent `nodeId + cursorCardNodeId` hint is a half-step: it still depends on global cursor-to-source lookup and can break for deeper embedded descendants.

## Required Shape

Cursor identity must be an occurrence path in the visible tree, not just a node id. The node id is the payload at the path leaf; render/navigation matching must compare the full path.

No global cursor-to-source subscriptions. Components must not decide cursor ownership by globally asking "does this source node contain cursor id?". The visible-tree occurrence should already carry enough identity for the local render path to know whether it is the cursor path.

## Acceptance

- Cursor state has a first-class visual occurrence path, e.g. root/column/card/subitem path, or an equivalent opaque visible-tree path.
- Navigation operates on visible-tree entries/paths, not a `walkOrder` of bare ids.
- Rendering emits `data-cursor` only when the rendered occurrence path equals the cursor path. Duplicate node ids in embeds/source cards must not both match.
- Cursor-to-node mapping is leaf-path based: the leaf node id is derived from the cursor path, but matching is never by id alone.
- The cursor path type/definition has a comment explaining why path identity is required: embeds/links can render the same node id in multiple visual occurrences, so navigation and cursor rendering must identify the occurrence path, not just the underlying node.
- Remove the half-step global disambiguation pattern as the primary mechanism (`cursorCardNodeId`/source lookup may be derived for compatibility, but cannot be authoritative cursor identity).
- Add failing tests first against the real embedded-card shape that reproduced the issue, preferably `@agent/3.md` or a fixture with the same duplicate-occurrence structure.
- Include termless or tty-backed verification, not only the headless driver.

## Related

![[no-invisible-cursors-render-invariants]]


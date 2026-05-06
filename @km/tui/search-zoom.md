---
mentions:
  - km
  - claude
id: "@km/tui/search-zoom"
aliases:
  - km-tui.search-zoom
  - km-tui-search-zoom
created_at: 2026-02-04T13:59:56Z
closed_at: 2026-02-04T14:17:05Z
assignee: claude:44a381e0
---

# [x] Search zoom/goto doesn't work for content items (sections/paragraphs/bullets) @km/tui #bug #P2 @claude:44a381e0

## Problem

When using search (`/`) to find and navigate to content items like sections, paragraphs, bullets, or lists, pressing Enter does nothing. The dialog closes but the view doesn't change.

## Expected Behavior

Selecting a search result and pressing Enter should zoom to show the item, regardless of node type.

## Actual Behavior

- Works: files, folders
- Broken: sections, paragraphs, bullets, list items, tasks (content items)

## Investigation

Debug logging was added to `use-board-dialogs.ts` - enable with `DEBUG='km:tui:dialogs'` to trace the zoom logic.

Potential causes:

1. `repo.getNode(targetNode.id)` may return null for certain node types
2. The smart zoom ancestor chain walk may not handle deep content properly
3. The ZOOM_IN action may not work correctly for content nodes

## Related

- Search dialog readline editing added in same session
- 3 tests added for Enter navigation (pass with folder-based structures)


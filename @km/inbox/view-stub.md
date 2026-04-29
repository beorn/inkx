---
id: "@km/_orphan/view-stub"
aliases:
  - km-view-stub
created_at: 2026-01-30T16:21:15Z
closed_at: 2026-01-30T16:26:16Z
assignee: claude:cf38b4a6
---

# [x] km view shows empty board when targeting stub file @km/_orphan #bug #P1 @claude:cf38b4a6

When running 'km view docs/principles.md' or any specific file path, the board is empty because:

1. In interactive mode, discoverOnly=true creates stub file nodes (type=file, data._stub=true)
2. Stub nodes have NO children - markdown content is not parsed
3. resolveNode finds the file node correctly
4. buildBoardState calls getChildren(rootId) which returns empty array
5. Result: 'Empty board'

The background parsing eventually parses all files, but the board renders before parsing completes.

Fix: When targeting a specific file that is a stub, parse that file eagerly before rendering the board.
---
id: "@km/ast/core"
aliases:
  - km-ast.core
  - km-ast-core
created_by: claude:124bfbe5
created_at: 2026-02-14T00:10:15Z
closed_at: 2026-02-14T00:16:56Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Core type definitions: NodeType, KNode, predicates @km/ast #task #P1 @claude:124bfbe5

Replace 14-type NodeType with 11-type @km/ast model in packages/@km/_orphan/core/src/types.ts.

Changes:
- NodeType: folder/file/section → oi, paragraph → p, ul/ol/task → li, embed → link, add h/math, remove agent/board
- Add FsType: repo | folder | file | mdfile | mdsection
- KNode: add fstype, list_marker, task_marker (full bracket string). Remove task_mark (single char)
- Add type predicates: isOutline, isItem, isBlock, isLink, isListItem
- Update TaskMark → TaskMarker mapping functions
- Export everything for consumers

Files: packages/@km/_orphan/core/src/types.ts, packages/@km/_orphan/core/src/index.ts
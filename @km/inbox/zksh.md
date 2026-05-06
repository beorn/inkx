---
mentions:
  - km
id: "@km/inbox/zksh"
aliases:
  - km-zksh
  - "@km/_orphan/zksh"
created_at: 2026-01-16T17:03:55Z
closed_at: 2026-01-16T17:20:43Z
---

# [x] App/Board layers should not directly access DBNode @km/_orphan #task #P2

The App and Board layers should work through TNode, not DBNode directly.

Currently App.tsx still uses getNode() to access DBNode in several places:

- Shift operations (opt+hjkl) to get parent_idx for reordering
- Zoom/navigation to check parent_id relationships
- Edit operations to get raw node data

These should be refactored so that:

1. TNode includes all display-needed fields (done - added nodeType, scheduledDate)
2. Mutation operations go through TAction dispatch (done - unified action flow)
3. getNode() calls should be eliminated or isolated to the nodeToTNode conversion layer

The goal is a clean boundary where:

- Storage layer (DBNode, getNode, updateNode) is only accessed during nodeToTNode conversion
- App/Board work purely with TNode for navigation and display
- Mutations flow through TAction → effect layer → storage

Related: @km/_orphan/60gu (unified action flow - completed)


---
id: "@km/tree/operation-log"
aliases:
  - km-tree.operation-log
  - km-tree-operation-log
created_by: Bjørn Stabell
created_at: 2026-04-03T03:56:08Z
closed_at: 2026-04-03T04:23:11Z
close_reason: Shipped c514eb48. OperationLog + replay + wired into withHistory.
owner: bjorn@stabell.org
---

# [x] Phase 7: Operation log — record ops for undo/collaboration/replay @km/tree #task #P3

SlateJS: editor.operations array records every op applied in a batch.
withHistory uses this for undo/redo.

Add: operation log that records every Operation (from Phase 4).
Uses:
- Undo/redo (withHistory plugin replays inverse ops)
- Real-time collaboration (forward ops to peers)
- Event replay (rebuild state from op log)
- Debugging (inspect op sequence that led to state)

Aligns with km's existing event-sourcing model (events.jsonl).
Operations are finer-grained than events — events are domain-level (node_created),
operations are edit-level (insert_text at offset 5).

The two coexist: operations for undo/collab, events for sync/audit.
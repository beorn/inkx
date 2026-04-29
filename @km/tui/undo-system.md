---
id: "@km/tui/undo-system"
aliases:
  - km-tui.undo-system
  - km-tui-undo-system
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:44:22Z
closed_at: 2026-02-15T15:06:08Z
---

# [x] Operation-based undo/redo system (SlateJS-quality) @km/tui #feature #P2 @claude:73c2828f

Redesign undo/redo from manual per-handler closures to automatic operation recording. Two paths to evaluate: (A) SlateJS-style wrapping of Repo mutations with auto-inverse computation, using nodeIds not paths, (B) CRDT/Automerge-compatible operation log. Must capture both node-level ops (add/delete/move/update) and text-level ops (character edits). Must support composition (batch multiple mutations into one undo step), cursor restoration, and debounced text edit grouping.
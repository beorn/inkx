---
mentions:
  - km
id: "@km/tui/outliner-spec"
aliases:
  - km-tui.outliner-spec
  - km-tui-outliner-spec
created_by: Bjørn Stabell
created_at: 2026-04-01T15:10:20Z
closed_at: 2026-04-01T15:38:21Z
close_reason: Spec written at docs/design/outliner-spec.md. withOutliner pattern
  implemented in km-tree/src/outliner.ts with 49 tests. Pro review integrated.
owner: bjorn@stabell.org
---

# [x] Shared outliner behavior spec — Enter, Tab, Delete, Backspace, J/K for every context @km/tui #task #P2

Write a spec document defining every outliner operation's behavior in every cursor context (first child, last child, empty, has children, root). Generate test matrix from spec. Both km and Decker should reference it.

Operations: Enter (4 rules), Tab (indent), Shift+Tab (outdent), Delete, Backspace (degradation chain), J/K (document-order traversal).

Contexts: first child, last child, only child, has children, empty node, root level, edit mode, normal mode.

Each cell = expected behavior or no-op+bell.


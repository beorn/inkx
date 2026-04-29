---
id: "@km/ast"
aliases:
  - km-ast
  - "@km/_orphan/ast"
created_by: claude:124bfbe5
created_at: 2026-02-14T00:09:49Z
closed_at: 2026-02-14T00:59:47Z
---

# [x] TRACKING: km-ast domain model migration @km/ast #epic #P1

Migrate km from 14-type flat NodeType enum to 11-type @km/ast domain model with 3 categories (Block, Item, Link). Replaces extractBody heuristic with type-based children split. Wipe and re-init repos — no migration code needed.

Sub-beads: core → markdown → tree → storage → tui (bottom-up order)

Design spec: docs/design/@km/ast/model.md
Test fixtures: docs/design/@km/ast/fixtures.md
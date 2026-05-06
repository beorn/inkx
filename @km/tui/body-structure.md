---
mentions:
  - km
id: "@km/tui/body-structure"
aliases:
  - km-tui.body-structure
  - km-tui-body-structure
created_by: claude:124bfbe5
created_at: 2026-02-13T17:18:23Z
closed_at: 2026-02-14T00:11:14Z
owner: bjorn@stabell.org
---

# [x] km-ast: domain model for knowledge tree @km/tui #task #P3

Design the @km/ast domain model: a clean, type-based node hierarchy replacing the current 14-type flat enum with extractBody heuristic.

Core changes:

- Two node kinds: Item (oi, li) and Block (p, h, code, quote, table, hr, html, embed)
- OutlineItem (oi) + fstype replaces folder/file/section
- ListItem (li) replaces ul/ol/task — marker field preserves style
- Task is a trait (task_status), not a type
- Items have .blocks[] and .subitems[] (uniform split rule)
- li has .blocks[] (same as oi), no separate .content
- "h" (heading) and "embed" are block types
- Heading level implicit from tree depth
- 14 types → 10 types
- Eliminates extractBody and 12+ duplicate call sites

Deliverables:

1. Finalized type definitions (@km/ast)
2. Test fixtures: markdown → AST transformation examples
3. Migration plan from current types


---
id: "@km/tree/auto-normalize"
aliases:
  - km-tree.auto-normalize
  - km-tree-auto-normalize
created_by: Bjørn Stabell
created_at: 2026-04-03T03:56:05Z
closed_at: 2026-04-03T04:23:10Z
close_reason: Shipped 4e26909e. withNormalization decorator.
owner: bjorn@stabell.org
---

# [x] Phase 3: Auto-normalization — schema enforcement after every tree operation @km/tree #task #P3

SlateJS runs normalizeNode() after every operation. km has schema.ts (canHaveChildren, canParent) but they're opt-in.

Add: normalize(tree) pass that runs after every TreeMutator operation.
Extensible: plugins can add custom normalizers (like SlateJS withNormalization).
Default normalizers:
- Items can only be type "h" (outline)
- Blocks cannot have children
- Tasks require item
- No empty root

Pattern: editor.normalizeNode = (entry, next) => { /* check */ next(entry) }

Related: SlateJS enforces these constraints automatically, preventing illegal states.
km currently allows them and relies on code discipline.
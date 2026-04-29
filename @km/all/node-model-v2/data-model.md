---
id: "@km/all/node-model-v2/data-model"
aliases:
  - km-all.node-model-v2.data-model
  - km-all-node-model-v2-data-model
created_by: claude:36393b5d
created_at: 2026-02-19T01:25:36Z
closed_at: 2026-02-19T21:36:50Z
---

# [x] Data model changes: flat children, li~oi unification, lazy loading @km/all #task #P2 @claude:8f007ba9

Flat children model. No body container node. li ~ oi unified.

## Final Design (confirmed by O3 deep research)
- Items have .children (ordered, mixed types)
- .content = title for items
- No h child node for oi title (heading level from tree depth)
- No body container node (lazy loading via SQL type filtering)
- No .blocks/.subitems derived split in model (view-only helpers if needed)
- Ordering (blocks before subitems) enforced at parser/app level for oi
- li allows interleaving blocks and sub-li in any order

## Work
- Update docs/design/@km/ast/model.md with v2 model
- Parser: stop creating h child for oi, use .content for title
- Remove .blocks/.subitems split (or make view-only helpers)
- Update predicates (isItem = primary structural check)
- Storage: lazy loading queries
- Migration for existing databases
- Update board view split logic
- Remove __body__ virtual node
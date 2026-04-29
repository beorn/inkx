---
id: "@km/ast/tree"
aliases:
  - km-ast.tree
  - km-ast-tree
created_by: claude:124bfbe5
created_at: 2026-02-14T00:10:42Z
closed_at: 2026-02-14T00:59:41Z
---

# [x] Replace extractBody with type predicates in km-tree @km/ast #task #P1

Replace STRUCTURAL_TYPES/extractBody heuristic with @km/ast isOutline predicate.

Changes:
- body.ts: STRUCTURAL_TYPES → isOutline(type) i.e. type === 'oi'
- extractBody: items = children.filter(c => c.type === 'oi'), body = rest
- hasBody/isStructuralType/isBodyType: update or remove
- index.ts: update re-exports if needed

Files: packages/@km/tree/src/body.ts, packages/@km/tree/src/index.ts, packages/@km/tree/tests/body.test.ts
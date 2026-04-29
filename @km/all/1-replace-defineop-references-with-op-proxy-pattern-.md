---
id: "@km/all/1-replace-defineop-references-with-op-proxy-pattern-"
aliases:
  - km-all.1
  - km-all-1
  - "@km/all/1"
created_by: Bjørn Stabell
created_at: 2026-04-04T09:16:07Z
closed_at: 2026-04-04T16:13:01Z
---

# [x] Replace defineOp references with op() proxy pattern in architecture docs @km/all #task #P1 @Bjørn Stabell

The architecture docs (glossary.md, concepts.md, tea-state-machines.md) reference defineOp() as the planned way to reify operations. But the actual era2 design (vendor/internal/silvery/design/v15-tea/app.md) uses op() proxy instead — intercepting method calls via Proxy, routing through apply() as serializable { path, args } data. Same result, much more ergonomic.

defineOp was never implemented in code. op() proxy IS the implementation path.

## Files to update
- docs/glossary.md — defineOp definition, op handler references
- docs/concepts.md — op handler references
- docs/design/tea-state-machines.md — defineOp section

## Changes
- Replace defineOp() references with op() proxy pattern
- Keep the concept of "op handler" (pure function implementing one op type)
- Add op() proxy as the ergonomic way to create ops (method call = op)
- Note: createSlice (vendor/silvery/packages/create/src/core/slice.ts) already exists and defines op handlers + apply — op() proxy wraps this for ergonomics
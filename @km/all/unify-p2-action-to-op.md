---
id: "@km/all/unify-p2-action-to-op"
aliases:
  - km-all.unify-p2-action-to-op
  - km-all-unify-p2-action-to-op
created_by: Bjørn Stabell
created_at: 2026-04-03T23:05:43Z
closed_at: 2026-04-04T20:21:53Z
---

# [x] Terminology Phase 2: *Action → *Op rename @km/all #task #P1 @Bjørn Stabell

Rename all *Action types to *Op across the codebase.

## Renames
- `CommandAction` → `KmOp` (root machine op union)
- `BoardAction` → `BoardOp`
- `TextEditAction` → `TextOp`
- `HistoryAction` → `HistoryOp`
- `TaskSetStatusAction` → `TaskSetStatusOp`
- All remaining `*Action` types → `*Op`
- `Operation` → `TreeOp` (the @km/tree atomic op type)

## Method
- batch-refactor for mechanical renames
- tsc errors guide remaining manual fixes
- No re-exports, no compat aliases

## Delete
All old type names. No `type CommandAction = KmOp` compat.

## Definition of Done
- [ ] grep "CommandAction" in packages/ apps/ → 0 hits
- [ ] grep "BoardAction" in packages/ apps/ → 0 hits
- [ ] grep "type Operation " in packages/@km/tree → 0 hits (renamed to TreeOp)
- [ ] grep "Action" in packages/@km/_orphan/commands/src/types.ts → 0 hits (except prose)
- [ ] bun run test:fast passes
- [ ] docs/architecture.md updated
- [ ] CLAUDE.md updated
---
id: "@km/core/slate-interfaces/p1-position"
aliases:
  - km-core.slate-interfaces.p1-position
  - km-core-slate-interfaces-p1-position
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:17Z
closed_at: 2026-03-28T08:16:44Z
close_reason: All 41 callers migrated, 27 new tests, architecture doc written,
  /code review updated
---

# [x] Phase 1: Position + KNode namespaces to km-core @km/core #task #P2 @claude:ceb7c9cb

## Goal
Establish the SlateJS namespace pattern in @km/_orphan/core. Move Position type AND helpers from @km/tui. Consolidate KNode type guards into a namespace. Write architecture doc alongside code. Update /code review.

## BREAK FIRST, FIX SECOND
Per refactoring.md Lessons 2-4: NO backwards compat. NO dual exports. NO "keep old imports working." Create the new namespace, DELETE the old standalone exports, let tsc find every caller, fix them ALL in one session.

> "With fallbacks available, old patterns persisted. The migration never completed." — Case Study 1
> "LLMs copy whichever pattern they see first." — Lesson 2

## Changes

### @km/_orphan/core/src/interfaces/position.ts (NEW)
```typescript
export interface Position { parentId: string; childIdx: number }
export const Position = {
  of(node): Position | null,      // MOVE from positionOf() in position-resolver.ts
  first(parentId): Position,       // MOVE from firstChild()
  last(parentId): Position,        // MOVE from lastChild()
  equals(a, b): boolean,           // NEW
}
```

### @km/_orphan/core/src/interfaces/node.ts (NEW)
```typescript
// KNode interface stays in types.ts (too many fields to move)
// KNode namespace gets the helpers
export const KNode = {
  isItem(node): boolean,           // MOVE from standalone isItem()
  isOutline(node): boolean,        // MOVE from standalone isOutline()
  isBlock(node): boolean,          // MOVE from standalone isBlock()
  isTask(node): boolean,           // MOVE from standalone isTask()
  isEmbed(node): boolean,          // MOVE from standalone isEmbed()
  isListItem(node): boolean,       // MOVE from standalone isListItem()
  matches(node, props): boolean,   // NEW
}
```
NOTE: helpers take a node-like object, not (type, item) separately. Callers that pass raw fields get a compile error — fix to pass the node.

### Deletions (SAME COMMIT)
- DELETE standalone isItem, isOutline, isBlock, isTask, isEmbed, isListItem from @km/_orphan/core/src/types.ts
- DELETE interface Position from @km/tui/src/board/position-resolver.ts  
- DELETE positionOf, firstChild, lastChild from @km/tui/src/board/position-resolver.ts (moved to Position namespace)

### Fix all callers (tsc-guided)
- 37 files import type guards → change to KNode.isItem(node) pattern
- ~5 files use positionOf/firstChild/lastChild → change to Position.of/first/last
- Fix imports: `import { isItem } from "@km/core"` → `import { KNode } from "@km/core"`

### New tests (SAME COMMIT — era2 lesson)
- @km/_orphan/core/tests/interfaces/position.test.ts — Position.of, .first, .last, .equals
- @km/_orphan/core/tests/interfaces/node.test.ts — KNode.isItem, .isOutline, .matches

### Docs (written AFTER code works, documenting reality)
- docs/design/architecture-layers.md (NEW) — 3-layer rules
- .claude/skills/code/review-code.md — updated Architecture section
- packages/*/CLAUDE.md — Layer annotation

## Definition of Done (from refactoring.md Quick Checklist)
- [ ] Source code uses NewWay
- [ ] Tests use NewWay  
- [ ] CLAUDE.md files use NewWay
- [ ] docs/ references use NewWay
- [ ] skill files use NewWay
- [ ] grep finds NO OldWay patterns
- [ ] New files have tests

## /complete (exact grep commands)
- `grep -rn "export function isItem\|export function isOutline\|export function isBlock\|export function isTask\|export function isEmbed\|export function isListItem" packages/km-core/src/types.ts` → 0 (deleted)
- `grep -rn "import.*{ isItem\|import.*{ isOutline\|import.*{ isBlock" packages/ apps/` → 0 (no standalone imports)
- `grep -rn "isItem(" packages/ apps/ | grep -v "KNode.isItem\|KNode\.isItem"` → 0 (no standalone calls)
- `grep -rn "interface Position" apps/km-tui/src/board/position-resolver.ts` → 0 (moved)
- `grep -rn "positionOf\|firstChild\|lastChild" apps/km-tui/src/board/position-resolver.ts` → 0 (moved to Position namespace)
- `grep -rn "const Position" packages/km-core/src/interfaces/position.ts` → >0
- `grep -rn "const KNode" packages/km-core/src/interfaces/node.ts` → >0
- `ls packages/km-core/tests/interfaces/position.test.ts` → exists
- `ls packages/km-core/tests/interfaces/node.test.ts` → exists
- `ls docs/design/architecture-layers.md` → exists
- All tests pass
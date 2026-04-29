---
id: "@km/all/unify-terminology"
aliases:
  - km-all.unify-terminology
  - km-all-unify-terminology
created_by: Bjørn Stabell
created_at: 2026-04-03T22:08:41Z
closed_at: 2026-04-03T23:12:37Z
close_reason: Children moved under km-silvery.selection — terminology renames
  are prereqs for selection work
owner: bjorn@stabell.org
---

# [x] Unify terminology across the entire project @km/all #task #P2

Refactor the entire codebase to use consistent terminology and flows as defined in docs/glossary.md and docs/concepts.md.

## Unified Pipeline

```
event → command → op → apply() → [state, effects] → change
```

## Phases

### Phase 1: noun-singleton → domain interface ✅ DONE
- docs/design/tea-state-machines.md, phases.md, beads — all renamed

### Phase 2: *Action → *Op (code rename)
- `CommandAction` → `KmOp` (the root machine's op union)
- `BoardAction` → `BoardOp`
- `TextEditAction` → `TextOp`
- `HistoryAction` → `HistoryOp`
- `Operation` → `TreeOp`
- All `*Action` type names → `*Op`
- Update board-actions.ts handler names
- Blast radius: ~200+ files (use batch-refactor)

### Phase 3: Event → Change (storage layer)
- Rename storage `Event` type → `Change`
- `events.jsonl` → `changes.jsonl`
- `commit(events)` → `commit(changes)`
- `emitter` terminology updated
- Blast radius: ~50 files in @km/storage + consumers

### Phase 4: Bare functions → domain interfaces
- `inverse(op)` → `TreeOp.inverse(op)`
- `transformPoint(point, op)` → `Point.transform(point, op)`
- `transformRange(range, op)` → `Range.transform(range, op)`
- `transformSelection(sel, ops)` → `Range.transformThrough(range, ops)`

### Phase 5: Command system → pipeline alignment
- Restructure board-actions.ts into: context prep handler → when routing → command → op → apply
- Extract op handlers from the big switch into per-domain apply() functions
- Separate command decision logic from mechanical execution
- Move toward defineOp() pattern for registering op handlers
- Wire signal DAG as command context source

### Phase 6: Drop stale vocabulary
- Remove "transform" as a compound mutation concept (keep only as position adjustment)
- Remove "action" references from code comments, docs, bead descriptions
- Update architecture.md BoardAction/CommandAction references

## /complete
- `grep -r "CommandAction" packages/ apps/ --include="*.ts"` → 0 hits
- `grep -r "BoardAction" packages/ apps/ --include="*.ts"` → 0 hits  
- `grep -r "noun-singleton" docs/ .claude/` → 0 hits
- `grep -r "type Event " packages/km-storage/` → 0 hits (renamed to Change)
- `grep "inverse(" packages/km-tree/src/ --include="*.ts"` → only TreeOp.inverse
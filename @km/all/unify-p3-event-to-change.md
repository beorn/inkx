---
id: "@km/all/unify-p3-event-to-change"
aliases:
  - km-all.unify-p3-event-to-change
  - km-all-unify-p3-event-to-change
created_by: Bjørn Stabell
created_at: 2026-04-03T23:05:44Z
closed_at: 2026-04-04T09:49:00Z
---

# [x] Terminology Phase 3: Event → Change rename (storage) @km/all #task #P1 @Bjørn Stabell

Rename storage Event type to Change.

## Renames
- `Event` type → `Change` in @km/storage
- `events.jsonl` → `changes.jsonl`
- `commit(events)` → `commit(changes)`
- `emitter` internal references updated

## Method
- batch-refactor for mechanical renames
- tsc errors guide remaining manual fixes

## Delete
Old Event type. No compat alias.

## Definition of Done
- [ ] grep "type Event " in packages/@km/storage → 0 hits
- [ ] grep "events.jsonl" in packages/@km/storage → 0 hits
- [ ] bun run test:fast passes
- [ ] docs updated
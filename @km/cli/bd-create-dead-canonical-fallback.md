---
mentions:
  - km
id: "@km/cli/bd-create-dead-canonical-fallback"
aliases:
  - km-cli.bd-create-dead-canonical-fallback
  - km-cli-bd-create-dead-canonical-fallback
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: task
priority: P3
status: todo
parent: km-cli
_stub: true
closeReason: Dead fallback deleted in bd-split per-family refactor. Pure planner
  (bd-create-plan.ts) now always returns string (non-null); inputs that
  previously fell through to legacy inline-addNode (foo.bar / foo/bar without
  --parent) now route to inbox with literal leaf preserved. L4 invariant test in
  bd-create-plan.test.ts pins every-input-produces-id contract.
---

`apps/km-cli/src/commands/bd.ts` (~line 480-562 → 618) has a 6-step IIFE returning `string | null` for canonical-id resolution. The `null` case falls through to a "legacy inline-addNode path" that's documented as kept "to preserve edge cases nobody currently uses."

## Investigate

1. Trace every code path that reaches the legacy fallback. What inputs hit it?
2. Verify with grep: does any test exercise the fallback? Does any caller depend on it?
3. If nobody hits it: delete the fallback, simplify the IIFE to return `string` (non-null), let TypeScript prove the dead branch is unreachable.

## Acceptance

- [ ] Audit log: enumerated input shapes that reach the fallback (or proof it's unreachable)
- [ ] Either: dead path deleted + IIFE return type tightened to `string`; OR: fallback documented with a current consumer (file path, test name)
- [ ] If deleted, `bd.ts` shrinks by another ~30-40 LOC
- [ ] Regression test pinning whatever invariant survives (e.g., "every bd create input produces a canonical id")

## Why P3

It's working code that nobody complains about. But "documented as nobody uses this" is a smell — it tells us nobody has measured. The fix is bounded (one IIFE) and the win is narrative clarity (one-fewer "we kept it just in case" pattern in the codebase).

## Surfaced by

Code-quality agent in session f9eb64dc.


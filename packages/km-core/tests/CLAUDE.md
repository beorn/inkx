# km-core Tests

**Layer 1 — Behavioral Contracts**: Inputs in, invariants hold. Trust only TypeScript's type system.

## What to Test Here

- Behavioral contracts: short-circuit semantics (Result.andThen), batching logic (ToastQueue), ordering guarantees
- Event system: emission, subscription, cleanup
- Job runner: scheduling, cancellation, error propagation
- Query DSL: parsing, evaluation

## What NOT to Test Here

- Static mappings (`getMarkerForStatus("done") === "[x]"`) — the type system enforces these
- Boolean predicates (`isDone("done") === true`) — trivially covered by types
- Property readback (`createX({a: 1}).a === 1`) — tests nothing

## Patterns

Pure unit tests. No fixtures, no helpers, no setup files. Import directly from `@km/core`.

```typescript
import { andThen, Err, Ok } from "@km/core/result"

test("andThen short-circuits on first error", () => {
  let called = false
  andThen(Err("fail"), () => {
    called = true
    return Ok(1)
  })
  expect(called).toBe(false)
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-core/tests/          # All core tests (~instant)
bun vitest run packages/km-core/tests/ -t "name" # By test name
bun run test:changed                              # Only changed files
```

## Efficiency

These are the lightest tests in the project (~20-50ms import cost). No database, no framework imports. Keep them pure — if a test here needs `@km/storage` or silvery, it belongs in a higher layer.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol

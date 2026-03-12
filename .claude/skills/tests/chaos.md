---
description: Fuzz and chaos testing with vimonkey — property-based testing, auto-shrinking, regression, chaos streams
argument-hint: [quick | seed]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Fuzz & Chaos Testing (vimonkey)

Property-based fuzz testing and chaos stream transformers. Uses vimonkey's `test.fuzz` with `gen()`/`take()` for randomized test generation, auto-shrinking on failure, and automatic regression case saving.

**Keywords**: fuzz, chaos, property-based, gen, take, test.fuzz, shrink, regression, vimonkey, invariant

---

## When to Use Fuzz Testing

| Situation | Use fuzz | Why |
|---|---|---|
| Fixed input → expected output | No — use unit test | Deterministic, faster |
| "Does X work with any valid input?" | **Yes** | Explores input space you didn't think of |
| Differential oracle available (incremental = fresh) | **Yes** | Two implementations to compare |
| Roundtrip property (parse → serialize → parse) | **Yes** | Identity property is easy to check |
| Random navigation shouldn't crash | **Yes** | Explore state space exhaustively |
| Stream processing with unreliable delivery | **Yes — chaos** | Simulate real-world failure modes |

**Rule of thumb**: If you can state an invariant ("X should always be true regardless of input"), fuzz it.

---

## Quick Reference

```bash
# Run ALL fuzz tests
bun run test:fuzz

# Run specific fuzz file
FUZZ=1 bun vitest run path/to/file.fuzz.ts

# Reproduce with specific seed
FUZZ_SEED=12345 FUZZ=1 bun vitest run path/to/file.fuzz.ts

# More iterations (CI)
FUZZ=1 FUZZ_REPEATS=10000 bun vitest run
```

**File suffix**: `.fuzz.ts` — excluded from `test:all`, only runs with `test:fuzz`.

---

## Core API

```typescript
import { test, gen, take } from "vimonkey"
```

### gen() — Random generators

```typescript
gen(["j", "k", "h", "l"])                    // Uniform random from array
gen([[40, "j"], [40, "k"], [20, "Enter"]])   // Weighted random
gen((ctx) => ctx.random.pick([...]))          // Custom picker function
```

### take() — Limit + track for shrinking

```typescript
for await (const key of take(gen(["j", "k"]), 100)) {
  await handle.press(key)
}
```

### test.fuzz() — Auto-shrink + regression

```typescript
test.fuzz("navigation never crashes", async () => {
  const { board } = testEnv(() => item("board", item("col", item("a"), item("b"))))
  for await (const key of take(gen(["j", "k", "h", "l", "Enter", "Escape"]), 200)) {
    board.press(key)
    board.expectNoGhostChars()  // Invariant checked after every action
  }
})
```

On failure: vimonkey auto-shrinks to minimal failing sequence and saves to `__fuzz_cases__/` for regression.

---

## Where Fuzz Testing Is Used

| Area | File | What it fuzzes | Invariant |
|---|---|---|---|
| **TUI navigation** | `apps/km-tui/tests/navigation-fuzz.fuzz.ts` | Random key sequences on board | No crashes, no ghost chars |
| **Markdown roundtrip** | `packages/km-markdown/tests/roundtrip.fuzz.ts` | Random markdown → AST → markdown | Roundtrip preserves structure |
| **Layout consistency** | `vendor/flexily/tests/differential-fuzz.fuzz.ts` | Random layout trees | Incremental relayout = fresh layout |
| **Sync chaos** | `packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts` | FS events with chaos transformers | No duplicates, no orphans, sync matches |
| **Scrollback** | `vendor/silvery/tests/features/scrollback-chaos.fuzz.tsx` | Random scroll operations | Scrollback content integrity |
| **Cross-backend** | `vendor/silvery/tests/features/scrollback-cross-backend.fuzz.tsx` | Same operations, multiple backends | Backends produce identical output |

---

## Writing a New Fuzz Test

### 1. Identify the invariant

What should **always** be true regardless of input?

| Pattern | Invariant | Example |
|---|---|---|
| **Roundtrip** | `f(g(x)) == x` | Parse → serialize → parse |
| **Differential oracle** | `fast(x) == slow(x)` | Incremental = fresh render |
| **No crash** | No exceptions for any valid input | Random navigation |
| **Structural** | Properties hold across mutations | No orphaned nodes after sync |

### 2. Create the fuzz file

```typescript
// my-feature.fuzz.ts
import { test, gen, take } from "vimonkey"

test.fuzz("invariant description", async () => {
  // Setup
  const system = createSystem()

  // Generate random inputs
  for await (const input of take(gen(validInputs), 100)) {
    system.apply(input)
    // Check invariant after EVERY step
    expect(system.isConsistent()).toBe(true)
  }
})
```

### 3. Key principles

- **Check invariants after every action**, not just at the end
- **Use `test.fuzz()`** not `test()` — enables shrinking and regression
- **Keep iteration count reasonable** — 100-500 for fast feedback, 10000+ for CI
- **File must be `.fuzz.ts`** — won't run in normal test suites

---

## Chaos Stream Transformers

For testing systems that process event streams (file sync, real-time updates). Composable async iterable transformers that corrupt the stream in realistic ways.

```typescript
import { chaos, drop, reorder } from "vimonkey/chaos"

const chaotic = chaos(
  source,
  [
    { type: "drop", params: { rate: 0.2 } },
    { type: "reorder", params: { windowSize: 5 } },
  ],
  rng,
)
```

### Available Transformers

| Transformer      | Scenario            | What It Simulates                  |
| ---------------- | ------------------- | ---------------------------------- |
| `drop`           | QUEUE_OVERFLOW      | Skip events with probability       |
| `reorder`        | REORDER_CHAOS       | Shuffle within sliding window      |
| `atomicSave`     | EDITOR_ATOMIC       | Expand change → unlink+add         |
| `duplicate`      | DUPLICATE_EVENTS    | Yield some events twice            |
| `coalesce`       | FSEVENTS_COALESCE   | Replace N file events with dir event |
| `burst`          | EVENT_STORM         | Collect then emit in rapid bursts  |
| `delay`          | SLOW_DISK           | Await before yield                 |
| `partialWrite`   | PARTIAL_WRITES      | Split change into multiple changes |
| `renameChain`    | RENAME_STORM        | Expand rename → chain of renames   |
| `rapidSuccession`| RAPID_SUCCESSION    | Identity passthrough               |
| `initGap`        | INIT_GAP            | Skip first N events               |

---

## Sync Chaos Testing (km-storage)

Chaos testing specifically for km's filesystem sync.

### Run

```bash
FUZZ=1 bun vitest run packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts
FUZZ_SEED=12345 FUZZ=1 bun vitest run packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts
```

### Architecture

```
gen(fsEventPicker) → chaos transformers → take(n) → test loop + invariants
```

### On Failure

1. vimonkey auto-saves failing sequence to `__fuzz_cases__/`
2. Shrinking finds minimal failing event sequence
3. Analyze by invariant:

| Invariant      | Check First                   |
| -------------- | ----------------------------- |
| duplicateNodes | `reconcile.ts`                |
| orphanedNodes  | `reconcile.ts`, `emit.ts`     |
| syncMismatch   | `writequeue.ts`, `watcher.ts` |

### Key Files

| File | Purpose |
| ---- | ------- |
| `chaos-fuzz.fuzz.ts` | Fuzz tests using gen/take + transformers |
| `lifecycle-fuzz.fuzz.ts` | Lifecycle fuzz tests |
| `transformers.ts` | 11 chaos stream transformers + combinator |
| `event-picker.ts` | FS event picker for gen() |
| `verifier.ts` | Invariant checking |
| `fake-fs.ts` | In-memory mock filesystem |

**Full protocol**: See `docs/dev/chaos-testing.md` for detailed phases and templates.

---

## Anti-Patterns

- **Checking invariants only at the end** — bugs hide in intermediate states
- **No shrinking** — use `test.fuzz()`, not raw `test()` with random loops
- **Too few iterations** — 10 iterations won't find much; use 100+ (10000+ for CI)
- **Fuzz file without `.fuzz.ts` suffix** — will accidentally run in `test:all`
- **Stress tests in `.test.ts`** — high iteration counts and large fixtures must be `.bench.ts` or `.fuzz.ts`, never `.test.ts`

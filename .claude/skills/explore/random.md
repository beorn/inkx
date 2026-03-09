# AI-Driven Exploration & Diagnostics

Write ad-hoc test scripts for exploration and diagnostics. Use the primitives.

## Quick Commands

```bash
# Run existing fuzz suite (preferred first step)
bun test:fuzz                                       # All fuzz tests
bun test:fuzz apps/km-tui/tests/navigation-fuzz     # Specific file
FUZZ_SEED=12345 bun test:fuzz                       # Reproducible

# Real vault diagnostics
TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts

# Ad-hoc fuzz file you just wrote
FUZZ=1 bun vitest run apps/km-tui/tests/my-debug.fuzz.ts
```

**NOTE**: `.fuzz.ts` files need `FUZZ=1` env var (or `bun test:fuzz`). They are NOT included in `bun run test:fast`.

## Philosophy

**Don't use a CLI script. Write test files.**

1. First, run `bun test:fuzz` — the existing suite may already catch the issue
2. If not, write a `.fuzz.ts` file with your scenario
3. Run it with `FUZZ=1 bun vitest run <file>`
4. If it finds a bug, the test becomes a regression test
5. If not, delete or keep as part of the fuzz suite

## Fuzz Primitives

### gen/take - Random Sequences

```typescript
import { gen, take } from 'vi-monkey/fuzz'

// Uniform random from array
for await (const key of take(gen(['j', 'k', 'h', 'l']), 100)) {
  board.press(key)
}

// Weighted random
const keys = [
  [40, 'j'],  // 40% down
  [40, 'k'],  // 40% up
  [10, 'v'],  // 10% view switch
  [10, '/'],  // 10% search
] as const
for await (const key of take(gen(keys), 100)) {
  board.press(key)
}

// State-driven picker
for await (const key of take(gen(({ random }) => {
  const state = board.getState()
  if (state.dialogs.search) {
    return random.pick(['Escape', 'Enter', 'j', 'k'])
  }
  return random.pick(['j', 'k', 'h', 'l', '/'])
}), 100)) {
  board.press(key)
}
```

### test.fuzz - Auto-Shrinking Tests

```typescript
import { test, gen, take } from 'vi-monkey/fuzz'

test.fuzz("navigation invariants", async () => {
  const { board } = testEnv(() => item("board", item("col", item("A"), item("B"))))

  for await (const key of take(gen(['j', 'k', 'h', 'l']), 100)) {
    board.press(key)
    const text = board.textContent()

    // These assertions auto-shrink on failure
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError:")
  }
})
```

## Patterns

### Invariant Checking

```typescript
function checkInvariants(board, action) {
  const text = board.textContent()
  expect(text.length).toBeGreaterThan(0)
  expect(text).not.toContain("[object Object]")
  expect(text).not.toContain("TypeError:")
}
```

### Performance Checking

```typescript
for (let i = 0; i < 100; i++) {
  const key = ['j', 'k', 'h', 'l'][i % 4]!
  const start = performance.now()
  board.press(key)
  const elapsed = performance.now() - start
  if (elapsed > 50) {
    console.log(`Slow ${key}: ${elapsed}ms`)
  }
}
```

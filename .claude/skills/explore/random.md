# AI-Driven Exploration & Diagnostics

Write ad-hoc test scripts for exploration and diagnostics. Use the primitives.

## Philosophy

**Don't use a CLI script. Write test files.**

When exploring or debugging:
1. Write a `.fuzz.ts` file with your scenario
2. Run it with vitest
3. If it finds a bug, the test becomes a regression test
4. If not, delete or keep as part of the fuzz suite

The vitest infrastructure gives you:
- **Seeded random**: `FUZZ_SEED=12345` for reproducibility
- **Auto-shrinking**: Finds minimal failing sequence
- **Regression storage**: Saves failing cases to `__fuzz_cases__/`
- **CI integration**: Runs with other tests

## Primitives

You have great primitives - use them to write whatever diagnostics you need:

### createBoardDriver - TUI Control

```typescript
import { createBoardDriver } from '@km/tui/driver.ts'
import { createFakeRepo } from '@km/storage'
import { item } from '@km/tui/tests/helpers/board-test.ts'

// Create driver with fixture
const nodes = item("board", item("col", item("task1"), item("task2")))
const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

// Execute commands
driver.press('j')
driver.press('/')
for (const c of 'query') driver.press(c)

// Introspect state
const state = driver.getState()
state.cursor        // { col: 0, card: 1, level: 'card' }
state.selectedNodeId   // 'task2'
state.viewMode      // 'cards' | 'list' | 'columns' | 'tabs'
state.dialogs       // { search: true, ... }
state.screen        // Full rendered text
state.commands      // Available commands with metadata
```

### gen/take - Random Sequences

```typescript
import { gen, take, createSeededRandom } from '@beorn/vitestx/fuzz'

// Uniform random from array
for await (const key of take(gen(['j', 'k', 'h', 'l']), 100)) {
  driver.press(key)
}

// Weighted random
const keys = [
  [40, 'j'],  // 40% down
  [40, 'k'],  // 40% up
  [10, 'v'],  // 10% view switch
  [10, '/'],  // 10% search
] as const
for await (const key of take(gen(keys), 100)) {
  driver.press(key)
}

// Custom picker with state
for await (const key of take(gen(({ random }) => {
  const state = driver.getState()
  if (state.dialogs.search) {
    return random.pick(['Escape', 'Enter', 'j', 'k'])
  }
  return random.pick(['j', 'k', 'h', 'l', '/'])
}), 100)) {
  driver.press(key)
}
```

### test.fuzz - Auto-Shrinking Tests

```typescript
import { test, gen, take } from '@beorn/vitestx/fuzz'

test.fuzz("navigation invariants", async () => {
  const driver = createBoardDriver(...)

  for await (const key of take(gen(['j', 'k', 'h', 'l']), 100)) {
    const before = driver.getState()
    driver.press(key)
    const after = driver.getState()

    // These assertions auto-shrink on failure
    expect(after.screen).not.toContain("[object Object]")
    expect(after.cursor).toBeDefined()
  }
})
```

### Real Vaults

```typescript
import { createRepo, runGenerator } from '@km/storage'

const repo = await runGenerator(createRepo('/path/to/vault', { loadFiles: true }))
const rootNode = repo.getRepoRootNode()
const driver = createBoardDriver(repo, rootNode.id)
```

## Writing Ad-Hoc Diagnostics

Create a file like `apps/km-tui/tests/debug-search.fuzz.ts`:

```typescript
import { describe, expect } from 'vitest'
import { test, gen, take } from '@beorn/vitestx/fuzz'
import { createBoardDriver } from '../src/driver.ts'
import { createFakeRepo } from '@km/storage'
import { item } from './helpers/board-test.ts'

describe("Search Bug Investigation", () => {
  test.fuzz("cursor after search should move with j", async () => {
    const nodes = item("board", item("col",
      item("Alpha"), item("Justice"), item("Beta")))
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Open search, type, select
    driver.press('/')
    for (const c of 'Justice') driver.press(c)
    driver.press('Enter')

    const afterSearch = driver.getState()
    console.log('After search:', afterSearch.selectedNodeId)

    // Now fuzz navigation
    for await (const key of take(gen(['j', 'k']), 20)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      // Bug check: cursor should move (unless at boundary)
      if (key === 'j' && before.cursor.card !== after.cursor.card) {
        console.log(`j: ${before.selectedNodeId} -> ${after.selectedNodeId}`)
      }
    }
  })
})
```

Run it:
```bash
bun vitest run apps/km-tui/tests/debug-search.fuzz.ts
```

## Patterns

### Invariant Checking

```typescript
function checkInvariants(state, action, before) {
  // Basic sanity
  expect(state.screen.length).toBeGreaterThan(0)
  expect(state.screen).not.toContain("[object Object]")
  expect(state.screen).not.toContain("TypeError:")

  // Cursor existence (unless in dialog)
  if (!state.dialogs.search && !state.dialogs.help) {
    expect(state.cursor).toBeDefined()
  }

  // View mode validity
  expect(["cards", "list", "columns", "tabs"]).toContain(state.viewMode)
}
```

### State-Driven Exploration

```typescript
for await (const action of take(gen(({ random }) => {
  const state = driver.getState()

  // Pick actions based on current state
  if (state.dialogs.search) {
    return random.pick(['Enter', 'Escape', 'ArrowDown', 'ArrowUp'])
  }
  if (state.cursor.level === 'board') {
    return random.pick(['j', 'l'])  // Can only go down or right
  }
  return random.pick(state.commands.filter(c => c.keys.length).map(c => c.keys[0]))
}), 100)) {
  driver.press(action)
  checkInvariants(driver.getState(), action, before)
}
```

### Performance Checking

```typescript
for (let i = 0; i < 100; i++) {
  const key = rng.pick(['j', 'k', 'h', 'l'])
  const start = performance.now()
  driver.press(key)
  const elapsed = performance.now() - start

  if (elapsed > 50) {
    console.log(`Slow ${key}: ${elapsed}ms at`, driver.getState().cursor)
  }
}
```

## Running Diagnostics

**Ad-hoc diagnostics can live anywhere** - even in `/tmp`:

```bash
# Write a quick diagnostic anywhere
cat > /tmp/diagnose-search.ts << 'EOF'
import { test, expect } from 'vitest'
import { createBoardDriver } from '/Users/beorn/Code/pim/km/apps/km-tui/src/driver.ts'
import { createFakeRepo } from '@km/storage'
import { item } from '/Users/beorn/Code/pim/km/apps/km-tui/tests/helpers/board-test.ts'

test("search bug investigation", async () => {
  const nodes = item("board", item("col", item("Alpha"), item("Justice"), item("Beta")))
  const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

  driver.press('/')
  for (const c of 'Justice') driver.press(c)
  driver.press('Enter')
  driver.press('j')

  console.log('State:', driver.getState())
})
EOF

# Run it directly
bun vitest run /tmp/diagnose-search.ts
```

For diagnostics with fuzz testing, use `FUZZ=1` to enable `.fuzz.ts` files:

```bash
# Run the navigation fuzz suite
FUZZ=1 bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts

# With specific seed for reproducibility
FUZZ=1 FUZZ_SEED=12345 bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts

# Watch mode for iteration
FUZZ=1 bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts --watch
```

## When Fuzz Test Finds Bug

1. The test fails with minimal sequence (auto-shrunk)
2. Copy the sequence to a deterministic test in board.spec.ts
3. Fix the bug
4. Both tests pass: fuzz test continues protecting, deterministic test documents the bug

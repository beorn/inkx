# Spec: testBoard() API for /explore Skill

## Problem

The `/explore` skill needs a way to programmatically interact with TUI in test mode. Currently we have inkx test renderer but no convenient way to:
1. Load real vault data into a test instance
2. Control input/output without MCP TTY overhead
3. Write quick ad-hoc scripts to reproduce bugs

## Solution: `testBoard()` Helper

A thin wrapper that creates a controllable TUI instance using inkx's existing `AsyncIterable<Event>` architecture.

```typescript
// Claude writes this, runs with `bun /tmp/test.ts`
import { testBoard } from "km/testing"

const board = await testBoard("/tmp/my-vault")
board.press("j").press("j")
console.log(board.text())
console.log(board.query("[data-cursor]").textContent())
```

## Design Principles (from O3 Research)

### Key Insight: No UI Logic Duplication

We use 100% real BoardApp code. The testBoard() helper only provides:
1. A custom `AsyncIterable<Event>` that we can push events into
2. A way to flush React after each event (for sync-looking behavior)
3. Access to the rendered output

### Recommended Approach: Sync-Looking with Internal Flush

Based on O3's research, the most ergonomic approach combines:

1. **Cypress-style command queue** - `press()` returns `this` for chaining
2. **Internal flush after each event** - Uses inkx's `updateContainerSync`
3. **Game loop pattern** - Each `press()` is one "tick" of the event loop

```typescript
// This just works - each press() flushes before returning
board.press("j").press("j")
const text = board.text()  // Already reflects both presses
```

## API

### `testBoard(source?, options?)`

```typescript
function testBoard(vaultPath?: string, options?: {
  width?: number   // Default: 80
  height?: number  // Default: 24
}): Promise<TestBoard>
```

### `TestBoard` Interface

```typescript
interface TestBoard {
  // Input (chainable, sync-flushing)
  press(key: string): this
  type(text: string): this

  // Output
  text(): string                           // Plain text (stripped ANSI)
  ansi(): string                           // With ANSI codes

  // DOM queries (via inkx App)
  query(selector: string): Element | null
  locator(selector: string): Locator       // Auto-refreshing

  // State inspection
  cursorOn(): string | null                // ID of element with cursor

  // Cleanup
  [Symbol.dispose](): void
}
```

## Implementation

### Core Principle: Inject Events, Flush, Return

```typescript
export async function testBoard(vaultPath?: string, options?) {
  // 1. Load repo (real or memory)
  const repo = vaultPath
    ? await createRepo({ rootPath: vaultPath })
    : await createMemoryRepo()

  // 2. Create pushable event source
  const { events, push } = createPushableEvents()

  // 3. Render REAL BoardApp with custom TermDef
  const app = await render(
    <RepoProvider repo={repo}>
      <BoardApp initialState={await initBoardState(repo)} />
    </RepoProvider>,
    {
      width: options?.width ?? 80,
      height: options?.height ?? 24,
      events,        // Our controllable source
      stdout: null   // Don't write to terminal
    }
  )

  // 4. Return thin wrapper
  return {
    press(key: string) {
      push(keyToEvent(key))  // Push event
      app.flush()            // Wait for React to process
      return this            // Enable chaining
    },
    text: () => app.text,
    query: (s: string) => app.locator(s).first(),
    locator: (s: string) => app.locator(s),
    [Symbol.dispose]: () => app.unmount()
  }
}
```

### createPushableEvents() - Standard Pattern

```typescript
function createPushableEvents() {
  const queue: Event[] = []
  let waiting: ((e: Event) => void) | null = null

  return {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: () => queue.length
          ? Promise.resolve({ value: queue.shift()!, done: false })
          : new Promise(r => { waiting = (e) => r({ value: e, done: false }) })
      })
    },
    push: (e: Event) => {
      if (waiting) { waiting(e); waiting = null }
      else queue.push(e)
    }
  }
}
```

### app.flush() - The Key Innovation

inkx already has `updateContainerSync` in the reconciler. We expose a `flush()` method that:
1. Processes the pushed event through the async iterator
2. Forces React to process all updates synchronously
3. Returns when the render is complete

This makes `press()` appear synchronous even though the underlying system is async.

## Files

| File | Description |
|------|-------------|
| `apps/km-tui/tests/helpers/test-board.ts` | Main testBoard() function |
| `vendor/beorn-inkx/src/testing/flush.ts` | Expose flush() on App |
| `.claude/skills/tests/adhoc.md` | Documentation for Claude |

## How /explore Uses This

```typescript
// Targeted scenario testing
const board = await testBoard("/tmp/tst-vault-linking")

// Navigate to specific item
board.press("/").type("Justice").press("Enter")
const before = board.query("[data-cursor]")?.textContent()

// Test the interaction
board.press("j")
const after = board.query("[data-cursor]")?.textContent()

console.log({ before, after })
// Report if cursor jumped unexpectedly
```

## Verification

```bash
# Minimal test
bun -e '
import { testBoard } from "./apps/km-tui/tests/helpers/test-board"
const b = await testBoard()
b.press("j")
console.log(b.text())
'
```

## Open Questions

1. **Does inkx already expose flush()?**
   - Need to check if `updateContainerSync` is accessible from App
   - May need to add a method to expose it

2. **Memory repo for fixtures?**
   - Start with real vaults only
   - Add memory repo later if needed for isolation

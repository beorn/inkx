# Random Exploration

Setup, exploration loop, and verification for randomized bug hunting.

## Setup

### Parse Arguments

From `$ARGUMENTS`:
- Extract iteration count (number, default 100)
- Check for `--gui` flag
- Extract `--seed <n>` if present
- Extract `--path <vault>` if present

### Generate Test Data (if no --path)

**TUI Mode with fixtures** - use `testEnv()` with `item()`:

```typescript
import { testEnv, item } from "apps/km-tui/tests/helpers/board-test"

const { board } = testEnv(() =>
  item("board",
    item("col1", item("task1"), item("task2")),
    item("col2", item("task3"))
  ),
  { rows: 24, columns: 80 }
)
```

**TUI Mode with real vault** - use `createRepo`:

```typescript
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { createRepo, runGenerator } from "@km/storage"
import { Board } from "../src/views/Board.tsx"
import { buildBoardState } from "../src/state.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../src/command-bridge.ts"

// Load real vault
const repo = await runGenerator(createRepo(vaultPath, { loadFiles: true }))
const rootNode = repo.getRepoRootNode()
const initialState = buildBoardState(repo, rootNode.id)

ensureCommandSystemInitialized()

// Render with inkx test renderer
const render = createTestRenderer({ columns: 80, rows: 24 })
const result = render(
  React.createElement(RepoProvider, { repo,
    children: React.createElement(Board, {
      initialState,
      initialViewMode: "cards",
      dimensions: { columns: 80, rows: 24 },
      onExit: () => {},
      layoutRegistry: createLayoutRegistry(),
    })
  })
)

// Now use result.text for screenshots, result.press(key) for actions
```

**GUI Mode** - use MCP TTY tools:

```typescript
// Start session with km view
const { sessionId } = await mcp__tty__start({
  command: ["bun", "km", "view", vaultPath]
})

// Wait for initial render
await mcp__tty__wait({ sessionId, for: "VIEW" })
```

### Initialize Random with Seed

```typescript
class SeededRandom {
  private seed: number
  constructor(seed: number) { this.seed = seed }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  weighted<T>(items: { weight: number; value: T }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let r = this.next() * total
    for (const item of items) {
      r -= item.weight
      if (r <= 0) return item.value
    }
    return items[items.length - 1].value
  }
}
```

---

## Exploration Loop

```
for iteration = 1 to N:
  1. Read current state
  2. Select action (weighted + context-aware)
  3. Execute action
  4. Verify invariants
  5. Log issues (don't abort)
  6. Progress report every 10 iterations
```

### Action Categories & Weights

| Category | Weight | Keys |
|----------|--------|------|
| Navigation | 40% | `j`, `k`, `h`, `l`, `g`, `G`, `Control+d`, `Control+u` |
| View Modes | 15% | `v`, `+`, `-`, `<`, `>` |
| Zoom/Fold | 15% | `o` (zoom in), `u` (zoom out), `z` (fold) |
| Dialogs | 10% | `/` (search), `n` (new), `p` (project), `?` (help) |
| Selection | 10% | `A`, `Shift+ArrowDown`, `Shift+ArrowUp` |
| Edit | 5% | `Space` (toggle), `x` (archive), `m` (move) |
| Board Switch | 5% | `1`-`9` (favorites) |

### Context-Aware Adjustments

```typescript
function selectAction(rng: SeededRandom, context: Context): string {
  const actions = [...baseActions]

  // In dialog: boost navigation + escape
  if (context.inDialog) {
    boost(actions, ["j", "k", "Enter", "Escape"], 2.0)
  }

  // At boundary: boost opposite direction
  if (context.atTopBoundary) boost(actions, ["j", "G", "Control+d"], 1.5)
  if (context.atBottomBoundary) boost(actions, ["k", "g", "Control+u"], 1.5)
  if (context.atLeftBoundary) boost(actions, ["l"], 1.5)
  if (context.atRightBoundary) boost(actions, ["h"], 1.5)

  // Deep in tree: boost zoom-out
  if (context.zoomDepth > 2) boost(actions, ["u"], 2.0)

  // Every 10th iteration: boost view mode cycling
  if (context.iteration % 10 === 0) boost(actions, ["v"], 3.0)

  return rng.weighted(actions)
}
```

### Execute Action

**TUI Mode:**
```typescript
const before = board.screenshot()
const startTime = performance.now()
board.press(action)
const renderTime = performance.now() - startTime
const after = board.screenshot()
```

**GUI Mode:**
```typescript
const before = await mcp__tty__text({ sessionId })
await mcp__tty__press({ sessionId, key: action })
await mcp__tty__wait({ sessionId, stable: 100 })
const after = await mcp__tty__text({ sessionId })
```

---

## Verification

### Invariants to Check After Each Action

**TUI Mode (DOM-level):**
```typescript
// 1. No crash - content exists
const text = board.screenshot()
expect(text.length).toBeGreaterThan(0)

// 2. Cursor exists (unless in dialog)
if (!context.inDialog) {
  board.expect("[data-cursor]").toExist()
}

// 3. No error strings
expect(text).not.toContain("undefined")
expect(text).not.toContain("[object Object]")
expect(text).not.toMatch(/Error:|TypeError:|ReferenceError:/)

// 4. Bell only on boundary (expected)
if (board.bell && !context.atBoundary) {
  issues.push({ type: "unexpected-bell", iteration, action })
}

// 5. Content changed OR bell (something happened)
if (before === after && !board.bell) {
  issues.push({ type: "no-effect", iteration, action })
}
```

**GUI Mode (text/visual):**
```typescript
const text = await mcp__tty__text({ sessionId })

// 1. Terminal has content
expect(text.length).toBeGreaterThan(0)

// 2. No error messages
expect(text).not.toContain("Error:")
expect(text).not.toContain("undefined")

// 3. Visual check (periodic)
if (iteration % 10 === 0) {
  const screenshot = await mcp__tty__screenshot({ sessionId })
  // Inspect for visual glitches
}
```

### Performance Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Navigation (j/k/h/l) | >50ms = slow | Basic cursor movement |
| View mode switch | >200ms = slow | Cycling cards/list/columns/tabs |
| Zoom in/out | >150ms = slow | Drill in/out latency |
| Dialog open | >200ms = slow | Search, new item, project picker |
| Scroll (Ctrl+D/U) | >100ms = slow | Page up/down |

```typescript
if (renderTime > threshold) {
  performance.push({
    iteration,
    action,
    time: renderTime,
    threshold,
    context: { viewMode, nodeCount, zoomDepth }
  })
}
```

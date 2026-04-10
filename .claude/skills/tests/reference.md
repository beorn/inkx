---
description: Test API reference - createTestApp, AutoLocator, withDiagnostics, termless matchers, fuzz invariants, test review
---

# Test API Reference

Detailed API reference for km testing infrastructure. For when-to-use guidance, see [SKILL.md](SKILL.md).

---

## createTestApp() -- Backend-Agnostic km Tests (RECOMMENDED)

The unified API for km board tests. Write once, run on either backend:

- **headless** (default): wraps `createBoardDriver` + `withDiagnostics`. Synchronous, fast (~5ms/op), incremental rendering checks. Phases 1-4.
- **termless**: wraps `createBoardApp.run() + createTermless()`. Real xterm.js emulator, full 5-phase pipeline (~50ms/op). Catches ANSI bugs that headless misses.

Switch backend via `TEST_BACKEND=termless` env var or `backend` option.

```typescript
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

test("D opens detail pane", async () => {
  using app = await createTestApp(item("board", item("col1", item.task("Buy milk"))))

  app.expect("#buy-milk[data-cursor]").toExist()
  await app.command("toggle_detail_pane")
  app.expectScreen("Buy milk")
  await app.press("D")  // close
  app.expectScreenNot("DETAIL VIEW")
})
```

### Factory

```typescript
createTestApp(nodes: KNode[] | (() => KNode[]), opts?: TestAppOptions): TestApp
```

Accepts both a node array and a fixture function: `createTestApp(item.simpleBoard)` works.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cols` | number | 120 | Terminal width |
| `rows` | number | 30 | Terminal height |
| `backend` | "headless" \| "termless" | env `TEST_BACKEND` or "headless" | Backend selection |
| `viewMode` | "cards" \| "columns" \| "list" \| "tabs" | "cards" | Initial view mode |
| `checkIncremental` | boolean | true | Verify incremental matches fresh render (headless only) |
| `incremental` | boolean | true | Enable incremental rendering (headless only) |

### TestApp API

**Actions** (async — must `await`; chainable via thenable):

| Method | Description |
|--------|-------------|
| `app.press(key)` | Send keypress (e.g. `"j"`, `"Enter"`, `"Control+d"`) |
| `app.type(text)` | Type a string (each char as a keypress) |
| `app.command(commandId)` | Dispatch command by ID (e.g. `"cursor_down"`, `"fold_more"`) |
| `app.dispatch(commandId)` | Dispatch orphan command (no key binding, e.g. `"search"`) |
| `app.navigateTo(target)` | Press `j` until cursor reaches target node (max 50 steps) |

**Chaining**: Actions return a `TestAppChain` (thenable). Queue multiple and await once:

```typescript
await app.command("cursor_down").command("cursor_right").press("z")
```

**Async `not.toThrow()`**: Use Vitest's `.resolves` matcher:

```typescript
await expect(app.press("H")).resolves.not.toThrow()
```

**Locator assertions** (synchronous):

| Method | Description |
|--------|-------------|
| `app.expect(selector).toExist()` | Assert locator finds at least one node |
| `app.expect(selector).not.toExist()` | Assert locator finds no nodes |
| `app.expect(selector).toHaveCount(n)` | Assert exact count |
| `app.locator(selector)` | Return AutoLocator |
| `app.q(selector)` | Alias for locator |
| `app.getByText(text)` | Locator by text content |
| `app.getByTestId(id)` | Locator by testID |

**Screen assertions** (synchronous, chainable):

| Method | Description |
|--------|-------------|
| `app.expectScreen(text)` | Assert screen contains text |
| `app.expectScreenNot(text)` | Assert screen does NOT contain text |
| `app.expectRow(n, pattern)` | Row n contains text or matches regex |
| `app.expectCellChar(x, y, char)` | Cell at position has char |
| `app.expectCellColor(x, y, {fg, bg})` | Cell colors match |

**Feedback** (synchronous):

| Method | Description |
|--------|-------------|
| `app.bell` | Boolean — true if boundary hit (e.g. cursor at edge) |
| `app.hasStatus` | Boolean — true if status bar is showing a message |
| `app.getStatus()` | `{level, message}` or null — current status bar content |

**Read access** (synchronous):

| Method | Description |
|--------|-------------|
| `app.text` | Plain text screen content |
| `app.cell(col, row)` | Cell info `{char, fg, bg, bold, dim, italic}` |
| `app.screen.text` | Same as `app.text` |
| `app.screen.rows` | Lines split by `\n` |
| `app.screen.row(n)` | Row n text |
| `app.screen.cell(x, y)` | Same as `app.cell()` |
| `app.screen.nodePos(id)` | Top-left of node `{x, y}` or null |
| `app.screen.nodeBox(id)` | Bounding box `{x, y, width, height}` or null |
| `app.screen.findRow(text)` | First row index containing text (-1 if none) |
| `app.screen.width` / `height` | Terminal dimensions |
| `app.repo` | Full Repo for persistence assertions (`app.repo.getNode(id)`, etc.) |

**Backend-specific** (use sparingly):

| Method | Description |
|--------|-------------|
| `app.driver` | Underlying BoardDriver (headless only — throws on termless) |

**Cleanup**: `using` declaration handles disposal automatically. No `unmount()` needed.

### Migration from createDriverTest

```typescript
// BEFORE (createDriverTest)
import { item, createDriverTest } from "./helpers/board-test.ts"

test("foo", () => {
  const { board, repo } = createDriverTest(() => item("board", item("col1")))
  board.command("cursor_down")
  expect(repo.getNode("col1")).toBeDefined()
})

// AFTER (createTestApp)
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

test("foo", async () => {
  using app = await createTestApp(item("board", item("col1")))
  await app.command("cursor_down")
  expect(app.repo.getNode("col1")).toBeDefined()
})
```

Key differences:
- `createDriverTest(() => item(...))` → `createTestApp(item(...))` — strip `() =>` wrapper
- `const { board, repo } = createDriverTest(...)` → `using app = await createTestApp(...)` — `using` for auto-cleanup
- `board.command(...)` → `await app.command(...)` — async
- `repo.getNode(...)` → `app.repo.getNode(...)`
- `{ columns: 80 }` → `{ cols: 80 }` — option name change

### When to leave on createDriverTest

`createTestApp` does NOT yet support:
- `store` (Zustand store) — for tests that read internal `workspace.panes`, `ui.*` state
- `board.click(x, y)`, mouse events
- `board.expectNodeBorder/Color/Gutter` — node-level styling assertions
- `board.bell`, `board.hasStatus()`, `board.getStatus()`
- `board.expectNoGhostChars()`, `board.expectNoBlankCards()` — visual integrity
- `board.screen.ansi` — raw ANSI output

For tests using these, keep `createDriverTest()` (you can mix both in the same file).

---

## createRenderer() -- Silvery Component Tests

```typescript
import { createRenderer } from "@silvery/test"
const render = createRenderer({ cols: 80, rows: 24 })
const app = render(<MyComponent />)
```

### Options

`cols`, `rows`, `incremental`, `singlePassLayout`, `kittyMode`, `debug`, `wrapRoot`.

### App API

| Method | Return | Description |
|--------|--------|-------------|
| `app.text` | `string` | Plain text (no ANSI) |
| `app.ansi` | `string` | Text with ANSI codes |
| `app.press(key)` | `Promise<void>` | Send keypress |
| `app.type(text)` | `Promise<void>` | Type text |
| `app.resize(cols, rows)` | `void` | Resize |
| `app.getByTestId(id)` | `Locator` | Auto-refreshing locator |
| `app.getByText(text)` | `Locator` | Auto-refreshing locator |
| `app.locator(selector)` | `Locator` | CSS-like selector |
| `app.screenshot()` | `Promise<Buffer>` | PNG screenshot (lazy Playwright) |
| `app.rerender(element)` | `void` | Re-render with new element |
| `app.unmount()` | `void` | Cleanup |

### Auto-Refreshing Locators

Locators re-evaluate on every access -- no stale references:

```typescript
const cursor = app.locator('[data-cursor]')
expect(cursor.textContent()).toBe("item1")
await app.press("j")
expect(cursor.textContent()).toBe("item2")  // Same locator, fresh result
```

---

## createDriverTest() -- km Board Tests

```typescript
import { createDriverTest, item } from "./helpers"

const { board, repo } = createDriverTest(() =>
  item("board",
    item("col1", item("1a"), item("1b")),
    item("col2", item("2a")),
  )
)
```

### Board API

| Method | Description |
|--------|-------------|
| `board.press(key)` | Send keyboard input |
| `board.expect(selector).toExist()` | Assert element exists |
| `board.expect(selector).toHaveCount(n)` | Assert count |
| `board.q(selector).boundingBox()` | Get position/size |
| `board.screen.cell(x,y)` | Raw cell data |
| `board.screen.row(n)` | Row text |
| `board.textContent()` | Full screen text |
| `board.screenshot()` | PNG screenshot |

### CSS Selectors

```typescript
board.expect("#task-1[data-cursor]").toExist()    // Cursor on task-1
board.expect("#col1 > #1a").toExist()             // 1a is child of col1
board.expect("[data-selected]").toHaveCount(1)    // One selected
```

---

## Layout Matchers (InkxLocator)

```typescript
import { createLocator } from "silvery/testing"
const locator = createLocator(result.getContainer())

// Text
expect(col1).toHaveText("To Do")
expect(col1).toContainText("Do")

// Visibility
expect(col1).toBeVisible()
expect(col1).toBeHidden()

// Layout
expect(col1).toBeLeftOf(col2)
expect(col2).toBeRightOf(col1)
expect(header).toBeAbove(content)
expect(footer).toBeBelow(content)
expect(card).toBeContainedIn(column)

// Dimensions
expect(col1).toHaveWidth(20)
expect(row).toHaveHeight(1)
```

---

## createTermless() -- Terminal Emulator Tests

```typescript
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

const term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
```

### Terminal API

| Method | Description |
|--------|-------------|
| `term.feed(ansi)` | Feed raw ANSI |
| `term.press(key)` | Press key |
| `term.type(text)` | Type text |
| `term.resize(cols, rows)` | Resize |
| `term.find(text)` | Search: `{row, col, text}` or null |
| `term.findAll(regex)` | All matches with positions |

### Region Selectors

| Selector | Description |
|----------|-------------|
| `term.screen` | Visible area only |
| `term.scrollback` | History above visible |
| `term.buffer` | Everything |
| `term.viewport` | Current scroll offset |
| `term.row(n)` | Nth visible row |
| `term.row(-1)` | Last visible row |
| `term.cell(row, col)` | Single cell |
| `term.range(r1, c1, r2, c2)` | Rectangle region |

### RegionView Methods

```typescript
region.getText()           // Plain text
region.getLines()          // Split by newline
region.containsText("foo") // Boolean search
```

### CellView Properties

| Property | Type | Description |
|----------|------|-------------|
| `cell.char` | `string` | Character (grapheme cluster) |
| `cell.fg` | `{r,g,b} \| null` | Foreground color |
| `cell.bg` | `{r,g,b} \| null` | Background color |
| `cell.bold` | `boolean` | Bold |
| `cell.dim` | `boolean` | Faint (ECMA-48) |
| `cell.italic` | `boolean` | Italic |
| `cell.underline` | `false \| "single" \| "double" \| "curly" \| "dotted" \| "dashed"` | Underline style |
| `cell.strikethrough` | `boolean` | Strikethrough |
| `cell.inverse` | `boolean` | Inverse |
| `cell.wide` | `boolean` | CJK/emoji (2 cells) |

---

## @termless/test Matchers

Import: `import "@termless/test/matchers"`

### Text Matchers (on RegionView)

Auto-retry when awaited.

```typescript
expect(term.screen).toContainText("Dashboard")
await expect(term.screen).toContainText("Dashboard")       // auto-retry up to 5s
expect(term.row(0)).toHaveText("Title")
expect(term.screen).toMatchLines(["line1", "line2"])
expect(term.screen).toHaveTextCount("error", 0)
```

### Cell Style Matchers (on CellView)

Always sync.

```typescript
expect(term.cell(0, 0)).toBeBold()
expect(term.cell(0, 0)).toBeItalic()
expect(term.cell(0, 0)).toBeDim()
expect(term.cell(0, 0)).toBeStrikethrough()
expect(term.cell(0, 0)).toBeInverse()
expect(term.cell(0, 0)).toBeWide()
expect(term.cell(0, 0)).toHaveUnderline("curly")
expect(term.cell(0, 0)).toHaveFg("#ff0000")
expect(term.cell(0, 0)).toHaveBg({ r: 0, g: 0, b: 0 })
```

### Terminal State Matchers

Auto-retry when awaited.

```typescript
expect(term).toHaveCursorAt(5, 10)
expect(term).toHaveCursorStyle("beam")      // "block" | "underline" | "beam"
expect(term).toHaveCursorVisible()
expect(term).toHaveCursorHidden()
expect(term).toBeInMode("altScreen")
expect(term).toHaveTitle("My App")
expect(term).toHaveScrollbackLines(100)
expect(term).toBeAtBottomOfScrollback()
await expect(term).toHaveVisibleText("Ready!")
await expect(term).toHaveHiddenText("old output")
```

### Auto-Retry (Playwright-Style)

```typescript
// Retry until pass or timeout (default 5s)
await expect(term.screen).toContainText("Ready!")

// .not retry
await expect(term.screen).not.toContainText("Loading...")

// Custom timeout
await expect(term.screen).toContainText("loaded", { timeout: 10_000 })

// Multiple assertions together
import { pollFor } from "@termless/test"
await pollFor(() => {
  expect(term.screen).toContainText("ready")
  expect(term).toHaveCursorAt(0, 5)
})
```

### Terminal Modes

```
altScreen, cursorVisible, bracketedPaste, applicationCursor,
applicationKeypad, autoWrap, mouseTracking, focusTracking,
originMode, insertMode, reverseVideo
```

### Snapshots

```typescript
expect(term).toMatchTerminalSnapshot()
expect(term).toMatchSvgSnapshot({ theme: { background: "#1e1e1e" } })
```

---

## createTerminalFixture() -- PTY Tests

```typescript
import { createTerminalFixture } from "@termless/test"
import "@termless/test/matchers"

test("km app starts and navigates", async () => {
  const term = createTerminalFixture({ cols: 120, rows: 40 })
  await term.spawn(["bun", "km", "view", "/path"])
  await term.waitForStable(1000, 15000)

  expect(term.screen).toContainText("Board")
  term.press("j")
  await term.waitForStable(500)
})
```

### Waiting

```typescript
await term.waitFor("Board View", 5000)     // Poll until text appears
await term.waitForStable(200, 5000)        // Wait until content stops changing
```

---

## withDiagnostics()

Enable diagnostic checks on board drivers:

```typescript
const driver = withDiagnostics(createBoardDriver(repo, rootId), {
  checkReplay: true,         // Catches ANSI output bugs (ghost chars)
  checkIncremental: true,    // Catches buffer-level bugs (stale pixels)
  checkStability: true,      // Catches content shifts on cursor moves
  captureOnFailure: true,    // Screenshot on diagnostic failure
  screenshotDir: "/tmp/silvery-diagnostics",
})
```

**In createDriverTest()**: `checkIncremental` is ON by default. Never add `checkIncremental: false` unless deliberately testing a known-broken path.

---

## Multi-Backend Testing

Run same tests against multiple terminal emulators:

```typescript
// vitest.workspace.ts
export default [
  { test: { name: "xterm", setupFiles: ["./test/setup-xterm.ts"] } },
  { test: { name: "ghostty", setupFiles: ["./test/setup-ghostty.ts"] } },
  { test: { name: "vt100", setupFiles: ["./test/setup-vt100.ts"] } },
]
```

### Packages

| Package | What |
|---|---|
| `@termless/core` | Core abstractions |
| `@termless/test` | Vitest integration (auto-cleanup) |
| `@termless/xtermjs` | xterm.js headless (default) |
| `@termless/ghostty` | Ghostty via WASM |
| `@termless/vt100` | Pure TypeScript VT100 |
| `@termless/peekaboo` | OS-level automation |
| `@silvery/test` | Silvery-specific wrapper |

---

## Screenshots

```typescript
// SVG
const svg = term.screenshotSvg({
  fontFamily: "Iosevka",
  fontSize: 14,
  theme: { foreground: "#d4d4d4", background: "#1e1e1e" },
})

// PNG (requires resvg)
const png = await term.screenshotPng({ scale: 2 })
```

---

## Recording & Replay

```typescript
import { startRecording, replayRecording } from "@termless/core"

const handle = startRecording(term)
// ... interact ...
const recording = handle.stop()
await replayRecording(anotherTerm, recording)
```

---

## Fuzz Invariant Library

### Available Invariants

| Invariant | Check |
|-----------|-------|
| No garbage | No `[object Object]`, `TypeError:`, `NaN` in output |
| Valid cursor | level, col, card indices within bounds |
| Valid view mode | Recognized mode value |
| Mutually exclusive dialogs | At most one dialog open |
| Non-negative scroll | Scroll offset >= 0 |
| No total screen replacement | Render didn't blank the whole screen |

### Invariant Patterns

| Pattern | What to verify |
|---------|---------------|
| **Roundtrip** | `f(g(x)) == x` (parse --> serialize --> parse) |
| **Differential oracle** | `fast(x) == slow(x)` (incremental = fresh render) |
| **No crash** | No exceptions for any valid input |
| **Structural** | Properties hold across mutations (no orphaned nodes) |

### Where Fuzz Tests Live

| Area | File |
|---|---|
| TUI navigation | `apps/km-tui/tests/navigation-fuzz.fuzz.ts` |
| Markdown roundtrip | `packages/km-markdown/tests/roundtrip.fuzz.ts` |
| Layout consistency | `vendor/flexily/tests/differential-fuzz.fuzz.ts` |
| Sync chaos | `packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts` |
| Rendering invariants | `vendor/silvery/tests/features/property-invariants.fuzz.tsx` |
| Scrollback | `vendor/silvery/tests/features/scrollback-chaos.fuzz.tsx` |
| Cross-backend | `vendor/silvery/tests/features/scrollback-cross-backend.fuzz.tsx` |

---

## Test Review (Periodic)

Infrequent audit for test health. See the full protocol at `docs/dev/test-review.md`.

### Quick Checks

```bash
# Stray debug/repro files
find apps/km-tui/tests packages/*/tests -name "*.test.ts" -o -name "*.spec.ts" | \
  grep -iE 'repro|debug|profile|analysis|scratch|temp|wip'

# test:fast timing (target: <20s)
time bun run test:fast 2>&1 | tail -5

# Stale .only() calls
grep -rn "\.only(" apps/*/tests/*.test.ts apps/*/tests/*.spec.ts packages/*/tests/*.test.ts 2>/dev/null | grep -v node_modules

# DI compliance (should be 0)
grep -r "getDb()\|setDb(" packages/*/tests/*.test.ts apps/*/tests/*.test.ts 2>/dev/null | wc -l

# Console output in tests (should be 0)
grep -rn "console\.\(log\|info\|warn\|debug\)" packages/*/tests/*.test.ts apps/*/tests/*.test.ts 2>/dev/null | grep -v ".slow." | wc -l
```

### Domain -> File Mapping (km-tui)

| Domain | File |
|--------|------|
| Body navigation | `body-nav.slow.test.ts` |
| Fold/collapse | `fold.slow.test.ts` |
| HR rendering | `hr.test.ts` |
| Sticky cursor | `sticky-cursor.test.ts` |
| Dates | `date.slow.test.ts` |
| Zoom | `board-zoom.slow.spec.ts` |
| Board navigation | `board-nav.slow.spec.ts` |
| Collapse columns | `collapse.slow.test.ts` |
| Embeds | `embed.test.ts` |
| Layout bugs | `layout-bugs.slow.test.ts` |
| Card rendering | `card-rendering.slow.test.ts` |
| Cursor colors | `cursor-colors.test.ts` |
| Cursor stability | `cursor-stability.slow.spec.ts` |
| Inline edit | `inline-edit.slow.spec.ts` |
| Scroll | `scroll.test.ts` |
| Search | `search.slow.spec.ts` |
| Undo/redo | `undo-redo.slow.spec.ts` |
| Crash regressions | `crash-regressions.test.ts` |
| Card layout | `card-layout.test.tsx` |
| Column rendering | `column-rendering.test.ts` |
| Overflow indicators | `overflow.test.tsx` |
| Visual rendering | `visual.test.ts` |

---

## Performance

| Operation | Time |
|---|---|
| `createRenderer()` | ~5ms |
| `createDriverTest()` setup | ~200ms |
| `createTermless()` | ~5ms |
| `createTerminalFixture()` | ~5ms |
| `term.feed()` (small) | <1ms |
| `term.spawn()` + stable | 1-15s |
| Cell/region assertions | <1ms |
| SVG screenshot | ~10ms |
| PNG screenshot | ~100ms |

---

## Mock Timer

```typescript
import { createMockTimer } from "@termless/core"

const timer = createMockTimer()
timer.setTimeout(() => { /* fires sync */ }, 100)
timer.advanceTime(100)
timer.dispose()
```

---

## CLI Tests (mdspec)

Command output testing via the mdspec vitest plugin. Always acceptance-level (user-facing).

**File pattern**: `*.spec.md` (fast) / `*.slow.spec.md` (subprocess, real I/O). Location: `apps/km-cli/tests/sh/*.spec.md`.

**Required frontmatter** — the `memory: true` flag is CRITICAL for fast tests (without it: 16x slower, 190ms vs 12ms per command):

```yaml
---
mdspec:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true
---
```

**Example**:

```markdown
# Navigation Test

## Setup

$ km sync
✓ Synced ...

## Test

$ km sh board.md -c 'j; state'
cursor: [1]
```

**How it works**: km-repl plugin creates isolated `/tmp/kmtest-*` directory, `memory: true` sets `KM_DB_PATH=:memory:`, `executeKmCommand()` runs km commands in-process (no subprocess), plugin cleans up after all tests.

**Use subprocess (`$ bun km ...`) only when testing**: CLI exit codes, environment variable handling, actual binary execution. These go in separate `.slow.spec.md` files.

**Doctrine**: mdspec asserts semantic output, not formatting or layout. Don't assert spacing, ANSI colors, or cursor position in mdspec. See [mdspec README](../../../vendor/mdtest/README.md).

---

## Benchmarks (vitest bench)

Performance measurement via vitest benchmarks. Benchmarks are **not tests** — they measure performance, not correctness. Never say "benchmark test" — say "benchmark" or "bench".

**File pattern**: `benchmarks/*.bench.ts`.

**Commands**:

| Command | Use case |
|---|---|
| `bun run bench` | Run all benchmarks |
| `bun run bench:baseline` | Create baseline for comparison (after optimization) |
| `bun run bench:compare` | Compare against baseline (detect regressions) |

**Current benchmarks**: `sync.bench.ts` (file sync), `parser.bench.ts` (markdown), `layout.bench.ts` (TUI layout), `queries.bench.ts` (database).

**Example**:

```typescript
import { bench, describe } from "vitest"

describe("parser", () => {
  bench("parse small file", () => { parseMarkdown(smallContent) })
  bench("parse large file", () => { parseMarkdown(largeContent) })
})
```

**When to use**: after optimization work (baseline → compare), before releases (check for regressions), investigating slow operations (isolate bottlenecks).

**Fast iteration** — full runs take minutes, so for quick dev feedback use a dedicated quick-compare script with minimal iterations (3–5, ~1s runtime). See `vendor/flexily/bench/quick-compare.ts` for a reference implementation. Only run full `bun run bench` for final validation.

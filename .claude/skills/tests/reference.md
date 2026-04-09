---
description: Test API reference - createTestApp, AutoLocator, withDiagnostics, termless matchers, fuzz invariants, test review
---

# Test API Reference

Detailed API reference for km testing infrastructure. For when-to-use guidance, see [SKILL.md](SKILL.md).

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

## testEnv() -- km Board Tests

```typescript
import { testEnv, item } from "./helpers"

const { board, repo } = testEnv(() =>
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

**In testEnv()**: `checkIncremental` is ON by default. Never add `checkIncremental: false` unless deliberately testing a known-broken path.

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
| `testEnv()` setup | ~200ms |
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

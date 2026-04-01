---
description: TUI testing with silvery - character-level terminal buffer testing
---

# TUI Tests (silvery)

Character-level terminal buffer testing via silvery.

**Keywords**: TUI test, silvery, board.spec, testEnv, acceptance, component, unit

---

## FIRST CHECK: Is Incremental Rendering Verification ON?

**Before any other investigation**, verify `checkIncremental` is enabled. Since 2026-02-17, `testEnv()` and `testEnvWithRepo()` compare incremental vs fresh render **on every press()** by default. If your test has `checkIncremental: false`, fix that first.

```typescript
// GOOD: checkIncremental is ON by default — catches ghost pixels, stale regions
const { board } = testEnv(() => item("board", item("col1", item("1a"))))

// BAD: opted out — won't catch rendering bugs
const { board } = testEnv(() => ..., { checkIncremental: false })
```

**When writing new tests**: DO NOT add `checkIncremental: false` unless the test deliberately tests a known-broken incremental path.

## Diagnostic Mode

**For runtime debugging**, run with `SILVERY_STRICT=1` (catches bugs in the production `createApp` path that testEnv may not catch):

```bash
# In the real app
SILVERY_STRICT=1 bun km view /path/to/vault

# In tests
SILVERY_STRICT=1 bun vitest run apps/km-tui/tests/

# Real vault with diagnostics
SILVERY_STRICT=1 TEST_VAULT=/tmp/tst-vault bun vitest run apps/km-tui/tests/real-vault.test.ts
```

**What these checks catch:**
- Incremental vs fresh render mismatches (ghost pixels from dialog/toast unmount)
- Stale background colors from overlay components
- Blank cards after fold/unfold
- Buffer divergence after outline depth changes (`<` / `>`)

**For targeted bug reproduction**, use `withDiagnostics` directly (see [tui/fix.md](../tui/fix.md)):
- `checkReplay: true` — catches ANSI output bugs (ghost chars)
- `checkIncremental: true` — catches buffer-level bugs (stale pixels)
- `checkStability: true` — catches content shifts on cursor moves

---

## Test Levels

| Level | Tool | Suffix | What | Example |
|-------|------|--------|------|---------|
| **Acceptance** | `testEnv()` | `.spec.ts` | Full km board, end-user POV | press keys, verify DOM + buffer |
| **Component** | `createRenderer()` | `.test.ts` | Single silvery component | render, check text/layout |
| **ANSI verification** | `createTermless()` | `.test.ts` | Real terminal emulator | verify colors, cursor, modes |
| **Unit** | none | `.test.ts` | Pure functions, no render | `truncateText()` |

### Choosing Between testEnv and createTermless

| Bug reported as... | Use | Why |
|---|---|---|
| "I pressed X and saw Y" (visual) | **`createTermless()`** | Tests what reaches the terminal |
| "Cursor jumped to wrong place" | **`createTermless()`** | Real cursor position from emulator |
| "Alt screen didn't switch" | **`createTermless()`** | Terminal mode detection |
| "Card disappeared after indent" | **`testEnv()`** first, **`createTermless()`** if testEnv passes | May be DOM or ANSI bug |
| "Undo doesn't restore fold state" | **`testEnv()`** | Internal state, no terminal feature |
| "Command doesn't dispatch" | **`testEnv()`** | State machine, no rendering |

**Rule**: If the user describes what they **saw on screen** or the bug involves **terminal features** (alt screen, scrollback, cursor style, colors, escape sequences), use termless. If they describe **behavior** (undo, navigation logic, command dispatch), use testEnv.

---

## Rendering Tools

### createRenderer() — Silvery component tests

For testing silvery components in isolation. Fast (~5ms), no ANSI processing — tests the virtual buffer.

```typescript
import { createRenderer } from "@silvery/test"

const render = createRenderer({ cols: 80, rows: 24 })

test("help dialog renders sections", async () => {
  const app = render(<Help />)
  expect(app.text).toContain("NAVIGATION")

  await app.press("j")
  expect(app.getByText("SCROLL").count()).toBe(1)
})
```

**Key APIs on App** (returned by render):
- `app.text` — plain text (no ANSI)
- `app.ansi` — text with ANSI codes
- `app.press("key")` — send keypress (async)
- `app.type("text")` — type text
- `app.resize(cols, rows)` — resize
- `app.getByTestId("id")` — auto-refreshing locator
- `app.getByText("text")` — auto-refreshing locator
- `app.locator("[selector]")` — CSS-like selector
- `app.screenshot()` — PNG screenshot (lazy Playwright)
- `app.rerender(<NewElement />)` — re-render with new element
- `app.unmount()` — cleanup

**Auto-refreshing locators** re-evaluate on every access — no stale references:
```typescript
const cursor = app.locator('[data-cursor]')
expect(cursor.textContent()).toBe("item1")
await app.press("j")
expect(cursor.textContent()).toBe("item2")  // Same locator, fresh result
```

**createRenderer options**: `cols`, `rows`, `incremental`, `singlePassLayout`, `kittyMode`, `debug`, `wrapRoot`.

### testEnv() — km board tests

For testing km-tui board behavior with fixtures. Wraps createRenderer with board state + repo.

```typescript
import { testEnv, item } from "./helpers"

const { board } = testEnv(() =>
  item("board",
    item("col1", item("1a"), item("1b")),
    item("col2", item("2a")),
  )
)
```

### createTermless() — ANSI verification

When you need to verify actual ANSI output through a real terminal emulator (xterm.js). See [termless.md](termless.md).

```typescript
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

const term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
expect(term.cell(0, 0)).toBeBold()
expect(term.cell(0, 0)).toHaveFg("#00ff00")
```

---

## Setup Pattern

```typescript
import { testEnv, item } from "./helpers"

test("navigation works", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a")),
    ),
  )

  board.press("ArrowDown") // Playwright-style key name
  board.expect("#1a[data-cursor]").toExist()
})
```

---

## Keyboard Input (Playwright-style)

Use Playwright-style key names instead of raw ANSI codes:

```typescript
// Navigation keys
board.press("ArrowDown") // Instead of "\x1b[B"
board.press("ArrowUp") // Instead of "\x1b[A"
board.press("ArrowLeft") // Instead of "\x1b[D"
board.press("ArrowRight") // Instead of "\x1b[C"

// Action keys
board.press("Enter") // Instead of "\r"
board.press("Escape") // Instead of "\x1b"
board.press("Tab") // Instead of "\t"
board.press("Space") // Instead of " "
board.press("Backspace") // Instead of "\x08"

// Modifier combinations
board.press("Control+c") // Ctrl+C
board.press("Shift+Tab") // Shift+Tab

// Single characters work as-is
board.press("j") // vim-style down
board.press("k") // vim-style up
```

---

## Key APIs

### DOM/State Assertions

| Method | Purpose |
|--------|---------|
| `board.press("ArrowDown")` | Send keyboard input |
| `board.expect(selector).toExist()` | Assert element exists |
| `board.expect(selector).toHaveCount(n)` | Assert count |
| `board.q(selector).boundingBox()` | Get position/size |

<a name="buffer-assertions"></a>

### Buffer Assertions

For rendering bugs (wrong colors, missing borders, bad layout), use the buffer assertion toolbelt:

| Method | What it checks |
|--------|---------------|
| `board.screen.cell(x,y)` | Raw cell: `{char, fg, bg, attrs}` |
| `board.screen.row(n)` | Text of row n |
| `board.screen.nodePos(id)` | Screen position of a node |
| `board.screen.nodeBox(id)` | Bounding box of a node |
| `board.screen.findRow(text)` | Find row containing text |
| `board.expectScreen(text)` | Screen contains text |
| `board.expectRow(n, pattern)` | Row contains/matches |
| `board.expectCellChar(x,y,c)` | Character at position |
| `board.expectCellColor(x,y,{fg,bg})` | Colors at position |
| `board.expectNodeColor(id,{fg,bg,attrs})` | Colors on node's text |
| `board.expectNodeBorder(id)` | Node has border chars |
| `board.expectNodeNoBorder(id)` | Node has no border |
| `board.expectBorderContinuous(id)` | All 4 sides have unbroken border chars |
| `board.expectHorizontalBorder(id, side)` | Top or bottom border exists |
| `board.expectAdjacentBorders(id)` | Node + neighbors have intact borders |
| `board.expectNoGhostChars(region?)` | No NUL, control chars, "[object Object]" |
| `board.expectBlankRegion(x,y,w,h)` | Region is all spaces |
| `board.expectNoBlankLine(from?,to?)` | No fully blank rows in range |
| `board.expectNoContentGaps(rows?)` | No blank rows within content area |
| `board.expectCursorVisible()` | Cursor exists and within screen bounds |
| `board.expectTextNotOverflowing(id)` | Text doesn't bleed past node's right edge |
| `board.expectTextTruncated(id)` | Long text is truncated within bounds |
| `board.expectColumnsAligned(ids[])` | Columns ordered, non-overlapping, same height |
| `board.expectIncrementalMatchesFresh()` | Incremental buffer matches fresh render |

**Color numbers**: 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white

**When to use buffer assertions**: Prefer buffer assertions for any bug involving colors, borders, alignment, or layout. State assertions (`board.expect("#id").toExist()`) only verify DOM presence — they pass even when rendering is broken. Buffer assertions verify what the render buffer contains.

---

## CSS Selectors

```typescript
board.expect("#task-1[data-cursor]").toExist() // Cursor on task-1
board.expect("#col1 > #1a").toExist() // 1a is child of col1
board.expect("[data-selected]").toHaveCount(1) // One selected item
```

---

## Custom Matchers

Layout and visibility matchers for InkxLocator elements:

```typescript
import { createLocator } from "silvery/testing"

const locator = createLocator(result.getContainer())
const col1 = locator.getByTestId("col1")
const col2 = locator.getByTestId("col2")

// Text assertions
expect(col1).toHaveText("To Do")
expect(col1).toContainText("Do")

// Visibility
expect(col1).toBeVisible()
expect(col1).toBeHidden()

// Layout assertions
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

## Debugging Tests

When a test fails, use `debug()` to inspect the component tree:

```typescript
test("debugging example", () => {
  const { board } = testEnv(() => item("board", item("col1", item("1a"))))

  // Print component tree to console (useful during test development)
  board._result.debug()

  // Get screenshot of current frame
  console.log(board.screenshot())
})
```

---

## Bug Classification — Choose the Right Test Type

| Bug Type | Test Approach | Example |
|----------|--------------|---------|
| **State bug** (wrong cursor, missing node, bad logic) | DOM assertions: `board.expect("#id").toExist()` | Cursor lands on wrong card |
| **Rendering bug** (wrong color, missing border, bad layout) | Buffer assertions: `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` | Selected card text is wrong color |
| **Mixed** (state + rendering symptoms) | Both: DOM + buffer assertions | Card exists but border is missing |

**CRITICAL**: For rendering bugs, state-only assertions (`toExist()`) are insufficient — they pass even when the rendering is broken. Always use buffer assertions for rendering issues.

## Node-Type-Specific Testing

When editing rendering for a specific node type (HR, code, quote, link, etc.), **always include that node type in the test fixture**. Generic fixtures miss type-specific layout interactions.

```typescript
// BAD: testing HR rendering with generic items
const { board } = testEnv(() => item("board", item("col", item("card"))))

// GOOD: include the actual node type being changed
const { board } = testEnv(() =>
  item("board", item("col",
    item("card above"),
    item.hr(),           // actual HR node
    item("card below"),  // verify adjacent integrity
  ))
)
```

**Why**: HR nodes use auto-height, padding-based layout (matching border width). Code blocks use verbatim rendering. Link nodes resolve via `link_to`. Each has different layout rules that can interact with surrounding elements. Tests that don't include the actual node type miss these interactions.

---

## When to Use

| Need | Use |
|------|-----|
| TUI interaction/navigation | Acceptance test `.spec.ts` |
| Component rendering | Component test `.test.ts` |
| Rendering bugs | Buffer assertions in `.test.ts` |
| Pure functions | Unit test `.test.ts` |

---

## Common Testing Pitfalls (Lessons from Recent Regressions)

### Inline mode tests must simulate real terminal conditions
Inline mode bugs (cursor overshoot, screen clearing) only manifest when the terminal has existing scrollback above the app. Tests that start with an empty terminal miss these.

```typescript
// BAD: empty terminal — doesn't match real inline usage
const term = createTermless({ cols: 80, rows: 24 })

// GOOD: pre-populate scrollback like a real terminal
const term = createTermless({ cols: 80, rows: 24 })
term.write("$ previous-command\r\n$ another-command\r\n")
```

### Multi-pass layout tests
Some component structures trigger layout feedback loops (multiple `doRender` passes). Standard tests don't exercise this. If a bug involves layout feedback (pass 2 uses incremental rendering on pass 1's buffer with consumed dirty flags), create a component that deliberately triggers multi-pass layout (e.g., content that changes height based on measured width).

### Test fixtures must match production complexity
All 1106 TUI tests pass with `SILVERY_STRICT=1`, but real vault data triggers mismatches. When investigating bugs that only appear with real data, use large fixtures (50+ items, scroll containers, sticky headers, mixed node types) or load actual vault snapshots.

### Init-sequence bugs need startup tests
Startup timing bugs (like focus reporting before stdin listener) can't be caught by tests that start with everything initialized. Use `createTermless` tests that verify the startup ANSI sequence order.

---

## Fuzz / Property-Invariant Tests

Fuzz tests run only with `FUZZ=1` and are not part of CI. They surface pre-existing incremental rendering bugs under randomized conditions.

| File | What |
|------|------|
| `vendor/silvery/tests/features/property-invariants.fuzz.tsx` | 7 property invariants: idempotence, no-op, inverse operations (2), viewport clipping (2), combined |
| `vendor/silvery/tests/features/incremental-rendering.fuzz.tsx` | Stress: scrollable lists, nested bg inheritance, wrap boundaries, absolute positioning, multi-column boards |
| `apps/km-tui/tests/render-fuzz.fuzz.ts` | km-specific: large/nested fixtures, scrolling at various sizes, mutation keys (z/Z/f/F/Enter/Escape/Tab) |

**Property-invariant testing pattern**: Tests that verify mathematical properties of the rendering system (e.g., rendering twice produces identical output, a resize followed by resize-back produces the original, clipping never renders outside viewport bounds). These complement deterministic regression tests by exploring the state space randomly.

## Location

- Acceptance tests: `apps/km-tui/tests/board.spec.ts`
- Component/unit tests: `apps/km-tui/tests/*.test.ts`

---
description: TUI testing with inkx - character-level terminal buffer testing
---

# TUI Tests (inkx)

Character-level terminal buffer testing via inkx.

**Keywords**: TUI test, inkx, board.spec, testEnv, acceptance, component, unit

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

**For runtime debugging**, run with `INKX_STRICT=1` (catches bugs in the production `createApp` path that testEnv may not catch):

```bash
# In the real app
INKX_STRICT=1 bun km view /path/to/vault

# In tests
INKX_STRICT=1 bun vitest run apps/km-tui/tests/

# Real vault with diagnostics
INKX_STRICT=1 TEST_VAULT=/tmp/tst-vault bun vitest run apps/km-tui/tests/real-vault.test.ts
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

| Level | Suffix | What | Example |
|-------|--------|------|---------|
| **Acceptance** | `.spec.ts` | Full app, end-user POV | `render(<Board>)`, press keys, verify DOM |
| **Component** | `.test.ts` | Single component rendering | `render(<SearchDialog>)`, verify output |
| **Unit** | `.test.ts` | Pure functions, no render | `truncateText()`, `makeSelectionKey()` |

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
import { createLocator } from "inkx/testing"

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

## Location

- Acceptance tests: `apps/km-tui/tests/board.spec.ts`
- Component/unit tests: `apps/km-tui/tests/*.test.ts`

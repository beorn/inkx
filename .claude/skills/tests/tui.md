---
description: TUI testing with inkx - character-level terminal buffer testing
---

# TUI Tests (inkx)

Character-level terminal buffer testing via inkx.

**Keywords**: TUI test, inkx, board.spec, testEnv, acceptance, component, unit

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

| Method | Purpose |
|--------|---------|
| `board.press("ArrowDown")` | Send keyboard input |
| `board.expect(selector).toExist()` | Assert element exists |
| `board.expect(selector).toHaveCount(n)` | Assert count |
| `board.q(selector).boundingBox()` | Get position/size |

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

## When to Use

| Need | Use |
|------|-----|
| TUI interaction/navigation | Acceptance test `.spec.ts` |
| Component rendering | Component test `.test.ts` |
| Pure functions | Unit test `.test.ts` |

---

## Location

- Acceptance tests: `apps/km-tui/tests/board.spec.ts`
- Component/unit tests: `apps/km-tui/tests/*.test.ts`

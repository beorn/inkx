---
description: TUI testing and visual debugging
---

# Visual Testing

**Primary**: inkx createTestRenderer for automated tests
**Secondary**: ttyd + Playwright for manual debugging/screenshots

**Keywords**: visual test, TUI test, inkx, board.spec, testEnv, ttyd, screenshot

---

## 1. Automated Tests: inkx Test Renderer

All TUI acceptance tests use inkx. See `apps/km-tui/tests/board.spec.ts`.

### Setup Pattern

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

  board.press("j")
  board.expect("#1a[data-cursor]").toExist()
})
```

### Key APIs

| Method                                  | Purpose               |
| --------------------------------------- | --------------------- |
| `board.press("j")`                      | Send keyboard input   |
| `board.expect(selector).toExist()`      | Assert element exists |
| `board.expect(selector).toHaveCount(n)` | Assert count          |
| `board.q(selector).boundingBox()`       | Get position/size     |

### CSS Selectors

```typescript
board.expect("#task-1[data-cursor]").toExist() // Cursor on task-1
board.expect("#col1 > #1a").toExist() // 1a is child of col1
board.expect("[data-selected]").toHaveCount(1) // One selected item
```

---

## 2. Visual Inspection: Storybook

For visual component catalog (not automated tests):

```bash
bun storybook
```

---

## 3. Manual Debugging: ttyd + Playwright

For capturing screenshots during debugging (NOT for automated tests):

```bash
# 1. Prepare test data
rm -rf /tmp/test-repo && mkdir -p /tmp/test-repo
echo -e "# Test\n- [ ] Task 1\n- [x] Task 2" > /tmp/test-repo/test.md

# 2. Get free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start TUI
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-repo test.md &
sleep 3

# 4. Capture
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:$TTYD_PORT /tmp/tui.png

# 5. Cleanup
pkill -f ttyd
```

### Troubleshooting

| Problem            | Solution                            |
| ------------------ | ----------------------------------- |
| Blank screenshot   | Increase sleep (3→5→10)             |
| Port in use        | Use dynamic port allocation         |
| Playwright missing | `bun x playwright install chromium` |
| ttyd missing       | `brew install ttyd`                 |

---

## 4. CLI Debugging: `km screenshot`

```bash
km screenshot /path/to/repo --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

---

## When to Use What

| Need                          | Use                     |
| ----------------------------- | ----------------------- |
| Automated TUI tests           | inkx createTestRenderer |
| Component catalog             | Storybook               |
| Debug visual issue            | ttyd + Playwright       |
| Share TUI state in bug report | km screenshot           |

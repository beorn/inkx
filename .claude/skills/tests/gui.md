---
description: GUI testing with TTY MCP - pixel-level screenshot verification
---

# GUI Tests (Playwright TTY)

Pixel-level screenshot verification for regression testing using the `tty` MCP server.

**Keywords**: GUI test, pixel-level, screenshot, ttyd, playwright, visual

---

## When to Use

- Verify exact pixel rendering
- Check fonts, colors, alignment
- Pixel-level regression detection
- Interactive terminal debugging

---

## File Pattern

- `*.slow.spec.ts` (always slow - involves browser automation)
- `*.playwright-test.ts` (standalone Playwright tests)

---

## MCP Interactive Workflow

Use `mcp__tty__*` tools from the `tty` MCP server:

```
1. mcp__tty__start({ command: ["bun", "km", "view", "/path"] })
   -> { sessionId: "abc123", url: "http://127.0.0.1:7701" }

2. mcp__tty__wait({ sessionId: "abc123", for: "BOARD VIEW" })
   -> { success: true }

3. mcp__tty__press({ sessionId: "abc123", key: "j" })
   -> { success: true }

4. mcp__tty__screenshot({ sessionId: "abc123" })
   -> Returns PNG image

5. mcp__tty__stop({ sessionId: "abc123" })
   -> { success: true }
```

### Available Tools

| Tool | Description |
|------|-------------|
| `mcp__tty__start` | Start ttyd + connect browser |
| `mcp__tty__reset` | Restart TTY, keep browser open |
| `mcp__tty__stop` | Close browser + stop ttyd |
| `mcp__tty__press` | Press keyboard key(s) |
| `mcp__tty__type` | Type text |
| `mcp__tty__screenshot` | Capture screenshot |
| `mcp__tty__text` | Get terminal text |
| `mcp__tty__wait` | Wait for text/stability |
| `mcp__tty__list` | List active sessions |

### Key Formats

```
Enter, Escape, Tab, Backspace
ArrowUp, ArrowDown, ArrowLeft, ArrowRight
j, k, q (single chars)
Control+c, Control+d, Shift+Tab (modifiers)
```

---

## Playwright Test Files

For repeatable regression tests, generate a `.playwright-test.ts` file:

```typescript
import { test, expect } from "@playwright/test"
import { createTTY } from "@beorn/claude-tools/playwright-tty"

test("board view renders correctly", async ({ page }) => {
  await using ttyd = createTTY({
    command: ["bun", "km", "view", "/tmp/test"],
  })
  await ttyd.ready

  await page.goto(ttyd.url)
  await page.setViewportSize({ width: 1000, height: 700 })

  await expect(page.locator("body")).toContainText("BOARD VIEW")

  await page.keyboard.press("j")
  await page.keyboard.press("j")

  await expect(page).toHaveScreenshot("board-after-navigation.png")
})
```

Run with: `bunx playwright test example.playwright-test.ts`

---

## When to Use MCP vs Test Files

| Scenario | Use MCP | Use Test File |
|----------|---------|---------------|
| Ad-hoc debugging | Yes | |
| Quick screenshot | Yes | |
| Repeatable regression test | | Yes |
| Complex multi-step test | | Yes |
| CI integration | | Yes |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Chromium not found | Installed automatically on first `mcp__tty__start` |
| Session not found | Use `mcp__tty__list` to check active sessions |
| Blank screenshot | Use `mcp__tty__wait` before screenshot |
| ttyd missing | `brew install ttyd` |

---

## CLI Debugging Alternative

For quick capture without browser automation:

```bash
km screenshot /path/to/repo --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

---

## When to Use What

| Need | Use |
|------|-----|
| Automated TUI tests | [TUI tests (inkx)](tui.md) |
| Pixel-level verification | GUI tests (this) |
| Debug visual issue | TTY MCP |
| Share TUI state in bug report | km screenshot |

---
description: GUI/TTY testing with TTY MCP - pixel-level screenshot verification
---

# GUI/TTY Tests (TTY MCP)

Pixel-level screenshot verification for regression testing using the `tty` MCP server.

**Keywords**: GUI/TTY test, pixel-level, screenshot, playwright, visual

---

## When to Use

- Verify exact pixel rendering
- Check fonts, colors, alignment
- Pixel-level regression detection
- Interactive terminal debugging

---

## File Pattern

- `*.slow.spec.ts` (always slow - involves browser automation)

---

## MCP Interactive Workflow

Use `mcp__tty__*` tools from the `tty` MCP server.

**Architecture**: Bun PTY + xterm-headless (in-process terminal emulation). Browser is only launched lazily for screenshots.

```
1. mcp__tty__start({ command: ["bun", "km", "view", "/path"] })
   -> { sessionId: "abc123" }

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
| `mcp__tty__start` | Start PTY + xterm-headless emulator |
| `mcp__tty__stop` | Close session and kill process |
| `mcp__tty__press` | Press keyboard key(s) |
| `mcp__tty__type` | Type text |
| `mcp__tty__screenshot` | Capture screenshot (lazy browser launch) |
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

### start Parameters

```typescript
{
  command: string[]              // Required: ["bun", "km", "view", "/path"]
  env?: Record<string, string>   // Optional: { DEBUG: "hightea:*" }
  cols?: number                  // Terminal columns (default: 120)
  rows?: number                  // Terminal rows (default: 40)
  cwd?: string                   // Working directory
  waitFor?: "content" | "stable" | string  // Wait condition
  timeout?: number               // Wait timeout in ms (default: 5000)
}
```

---

## In-Process Screenshots (Preferred)

For most cases, prefer in-process `app.screenshot()` over TTY MCP. The hightea App now supports direct screenshot capture:

```typescript
const driver = createBoardDriver(repo, rootId)
await driver.cmd.down()
const png = await driver.screenshot('/tmp/board.png')
```

This uses `bufferToHTML()` + lazy Playwright rendering — no PTY, no external processes.

### withDiagnostics Screenshot Capture

Enable automatic screenshot capture on diagnostic failures:

```typescript
const driver = withDiagnostics(createBoardDriver(repo, rootId), {
  checkIncremental: true,
  checkStability: true,
  captureOnFailure: true,              // Capture screenshot on failure
  screenshotDir: "/tmp/hightea-diagnostics", // Default directory
})
```

When a diagnostic check fails, the screenshot is saved and its path is included in the error message.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Tool call hangs | Stop session, start fresh |
| Chromium not found | Installed automatically on first `mcp__tty__screenshot` |
| Session not found | Use `mcp__tty__list` to check active sessions |
| Blank screenshot | Use `mcp__tty__wait` before screenshot |

---

## CLI Alternative

For one-shot capture without the MCP server:

```bash
# Text + screenshot
bun tools/tty.ts capture --command "bun km view /path" --keys "j,Enter" --screenshot /tmp/out.png --text

# Text-only (no Chromium needed)
bun tools/tty.ts capture --command "bun km view /path" --wait-for "BOARD" --text
```

---

## When to Use What

| Need | Use |
|------|-----|
| Automated TUI tests | [TUI tests (hightea)](tui.md) |
| In-process screenshots | `app.screenshot()` / `withDiagnostics({ captureOnFailure })` |
| Pixel-level verification | TTY MCP `mcp__tty__screenshot` |
| Debug visual issue | TTY MCP |
| One-shot capture | `bun tools/tty.ts capture` |

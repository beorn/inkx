---
description: Terminal emulator testing with termless - ANSI verification, cell-level assertions, multi-backend conformance
---

# Termless Testing

Headless terminal testing library (like Playwright for terminal apps). Tests TUI output against real terminal emulators — verifies ANSI rendering, colors, cursor, scrollback, and terminal modes that virtual rendering can't catch.

**Keywords**: termless, terminal, ANSI, cell, color, cursor, scrollback, screenshot, PTY

---

## When to Use Termless vs Other Tools

| I want to test... | Use | Why |
|---|---|---|
| Component logic, state, DOM structure | `createRenderer()` from `@silvery/test` | Fast (~5ms), no ANSI processing |
| km board navigation, key sequences | `testEnv()` from km-tui helpers | Board state + silvery render |
| ANSI output correctness (colors, cursor, modes) | **termless** `createTermless()` | Real terminal emulator processes ANSI |
| Real process output (spawned km app) | **termless** `createTerminalFixture()` + `spawn()` | PTY + xterm.js emulator |
| Cross-emulator conformance | **termless** multi-backend workspace | Same test, 5 different emulators |
| Visual pixel screenshots (manual debugging) | TTY MCP tools | Browser rendering |

**Rule of thumb**: Use `createRenderer()` for most tests. Use termless when the bug is in ANSI output — wrong escape sequences, cursor positioning, terminal mode handling, scrollback behavior, or color rendering. If `createRenderer()` tests pass but the app looks wrong in a real terminal, you need termless.

---

## Quick Start

### In-process (silvery component → termless)

```typescript
import { createTermless } from "@silvery/test"
import { run } from "@silvery/term/runtime"
import "@termless/test/matchers"

test("renders header with correct colors", async () => {
  const term = createTermless({ cols: 80, rows: 24 })
  const handle = await run(<MyApp />, term)

  expect(term.screen).toContainText("Dashboard")
  expect(term.cell(0, 0)).toBeBold()
  expect(term.cell(0, 0)).toHaveFg("#00ff00")

  await handle.press("j")
  expect(term).toHaveCursorAt(0, 1)
})
```

### PTY (spawn real process)

```typescript
import { createTerminalFixture } from "@termless/test"
import "@termless/test/matchers"

test("km app starts and navigates", async () => {
  const term = createTerminalFixture({ cols: 120, rows: 40 })
  await term.spawn(["bun", "km", "view", "/path/to/vault"])
  await term.waitForStable(1000, 15000)

  expect(term.screen).toContainText("Board")

  term.press("j")
  await term.waitForStable(500)
  expect(term).toHaveCursorVisible()
})
```

---

## Packages

| Package | Import | What |
|---|---|---|
| `@termless/core` | Types, Terminal, views | Core abstractions |
| `@termless/test` | `createTerminalFixture` | Vitest integration (auto-cleanup) |
| `@termless/xtermjs` | `createXtermBackend` | xterm.js headless (default) |
| `@termless/ghostty` | `createGhosttyBackend` | Ghostty via WASM |
| `@termless/vt100` | `createVt100Backend` | Pure TypeScript VT100 |
| `@termless/peekaboo` | `createPeekabooBackend` | OS-level automation (real terminal window) |
| `@silvery/test` | `createTermless` | Silvery-specific wrapper (creates xterm.js terminal) |

---

## Terminal API

### Creating

```typescript
// Option 1: Vitest fixture (auto-cleanup in afterEach)
const term = createTerminalFixture({ cols: 80, rows: 24 })

// Option 2: Silvery wrapper (for component tests)
const term = createTermless({ cols: 80, rows: 24 })

// Option 3: Custom backend
import { createTerminal } from "@termless/core"
import { createGhosttyBackend } from "@termless/ghostty"
const term = createTerminal(createGhosttyBackend(), { cols: 80, rows: 24 })
```

### Data Feed (no PTY)

```typescript
term.feed("\x1b[1;31mRed bold text\x1b[0m")  // Feed raw ANSI
```

### PTY (spawn process)

```typescript
await term.spawn(["bun", "km", "view", "/path"], {
  env: { DEBUG: "silvery:*" },
  cwd: "/path/to/project",
})
```

### Input

```typescript
term.press("j")           // Single key
term.press("Enter")       // Named key
term.press("ctrl+c")      // Modifier chord
term.type("jjjjj")        // Rapid sequence (for chord recognition)
```

### Waiting

```typescript
await term.waitFor("Board View", 5000)       // Poll until text appears
await term.waitForStable(200, 5000)          // Wait until content stops changing
```

### Search

```typescript
const pos = term.find("Dashboard")           // { row, col, text } or null
const matches = term.findAll(/error/i)       // All matches with positions
```

### Resize

```typescript
term.resize(120, 40)                         // Resize terminal + PTY
```

---

## Region Selectors (WHERE to assert)

```typescript
term.screen       // Visible area only
term.scrollback   // History above visible area
term.buffer       // Everything (scrollback + screen)
term.viewport     // Current scroll offset view

term.row(0)              // First visible row (RowView)
term.row(-1)             // Last visible row
term.cell(0, 5)          // Cell at row 0, col 5 (CellView)
term.range(0, 0, 5, 40)  // Rectangle region
term.firstRow()          // Alias for row(0)
term.lastRow()           // Alias for row(rows-1)
```

### RegionView methods

```typescript
region.getText()              // Plain text, no styles
region.getLines()             // Split by newline
region.containsText("foo")   // Boolean search
```

### CellView properties

```typescript
const cell = term.cell(0, 5)
cell.text          // Character
cell.fg            // { r, g, b } | null
cell.bg            // { r, g, b } | null
cell.bold          // boolean
cell.faint         // boolean
cell.italic        // boolean
cell.underline     // "none" | "single" | "double" | "curly" | "dotted" | "dashed"
cell.strikethrough // boolean
cell.inverse       // boolean
cell.wide          // boolean (CJK, emoji)
```

---

## Matchers

Import: `import "@termless/test/matchers"`

### Text (on RegionView)

```typescript
expect(term.screen).toContainText("Dashboard")
expect(term.row(0)).toHaveText("Title")          // Exact after trim
expect(term.screen).toMatchLines(["line1", "line2"])
```

### Cell Style (on CellView)

```typescript
expect(term.cell(0, 0)).toBeBold()
expect(term.cell(0, 0)).toBeItalic()
expect(term.cell(0, 0)).toBeFaint()
expect(term.cell(0, 0)).toBeStrikethrough()
expect(term.cell(0, 0)).toBeInverse()
expect(term.cell(0, 0)).toBeWide()
expect(term.cell(0, 0)).toHaveUnderline("curly")
expect(term.cell(0, 0)).toHaveFg("#ff0000")      // Hex or { r, g, b }
expect(term.cell(0, 0)).toHaveBg({ r: 0, g: 0, b: 0 })
```

### Terminal State

```typescript
expect(term).toHaveCursorAt(5, 10)               // x, y
expect(term).toHaveCursorStyle("beam")            // "block" | "underline" | "beam"
expect(term).toHaveCursorVisible()
expect(term).toHaveCursorHidden()
expect(term).toBeInMode("altScreen")
expect(term).toHaveTitle("My App")
expect(term).toHaveScrollbackLines(100)
expect(term).toBeAtBottomOfScrollback()
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

## Screenshots

```typescript
const svg = term.screenshotSvg({
  fontFamily: "Iosevka",
  fontSize: 14,
  theme: { foreground: "#d4d4d4", background: "#1e1e1e" },
})

const png = await term.screenshotPng({ scale: 2 })  // Retina
```

---

## Recording & Replay

```typescript
import { startRecording, replayRecording } from "@termless/core"

const handle = startRecording(term)
// ... interact with terminal ...
const recording = handle.stop()
// { version: 1, cols, rows, duration, events: [{ timestamp, type, data }] }

await replayRecording(anotherTerm, recording)
```

---

## Mock Timer

```typescript
import { createMockTimer } from "@termless/core"

const timer = createMockTimer()
timer.setTimeout(() => { /* fires sync */ }, 100)
timer.advanceTime(100)  // Fires callback synchronously
timer.dispose()
```

---

## Multi-Backend Testing

Run the same tests against multiple terminal emulators via vitest workspaces:

```typescript
// vitest.workspace.ts
export default [
  { test: { name: "xterm", setupFiles: ["./test/setup-xterm.ts"] } },
  { test: { name: "ghostty", setupFiles: ["./test/setup-ghostty.ts"] } },
  { test: { name: "vt100", setupFiles: ["./test/setup-vt100.ts"] } },
]
```

Each setup file sets `globalThis.createBackend`, tests use `createTerminalFixture({ backend: globalThis.createBackend?.() })`.

---

## Performance

| Operation | Time |
|---|---|
| `createTerminalFixture()` | ~5ms |
| `term.feed()` (small output) | <1ms |
| `term.spawn()` + `waitForStable()` | 1-15s (process startup) |
| Cell/region assertions | <1ms |
| SVG screenshot | ~10ms |
| PNG screenshot | ~100ms (requires resvg) |

---

## Peekaboo (OS-Level Automation)

For testing against a real terminal window (not headless):

```typescript
import { createPeekabooBackend } from "@termless/peekaboo"

const backend = createPeekabooBackend({ visual: true, app: "ghostty" })
// Opens a real Ghostty window, spawns the process, captures screenshots
```

Use when headless testing isn't enough — font rendering, ligatures, GPU-accelerated output.

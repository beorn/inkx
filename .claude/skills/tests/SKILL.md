---
description: Test-driven development for km. Use when writing tests, running test suites, fixing test failures, or following TDD workflow.
argument-hint: [fast|all|buffer|chaos]
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Testing

**Keywords**: test, TDD, bun test, test:fast, test:all, buffer assertions, chaos, silvery, createTestApp

---

## Test-First Protocol

Every bug fix, feature, and refactor follows this protocol:

1. **Value check** -- does this test belong at this layer? See [test layers](#test-layers) below.
2. **Write a failing test FIRST** -- before any fix/implementation code
3. **Verify it fails for the right reason** -- the test must demonstrate the actual bug/missing feature
4. **Implement the minimal change** -- fix only what's broken, no extras
5. **Verify the test passes** -- run `bun run test:fast`
6. **Run full suite** -- `bun run test:fast` must stay green

For rendering bugs, use **buffer assertions** (not just state assertions):
- `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` -- see [buffer assertions](#buffer-assertions)

**Never**: theorize without a test, skip the failing-test step, guess at fixes, or close a bead without a test that specifically targets the issue.

**Non-obvious tests need rationale**: If the test guards a subtle edge case, add a comment explaining why it exists and when it's safe to remove.

---

## Assertion Hierarchy (Strictest First)

Three tiers, from strictest to most lenient. Use the strictest tier that fits your need.

### 1. Invariants (backbone) -- auto-checked, SILVERY_STRICT controlled

Structural correctness verified after every action. Catches bugs that no individual assertion would.

```typescript
// board.app() checks defaultInvariants automatically after every press/type/search
const app = board.app(["Inbox > Task 1", "Projects > Alpha"])
app.press("j")  // rendering, cursor, selection, cursorVisible auto-checked

// Explicit invariant check with all invariants
app.check(...allInvariants)
```

`SILVERY_STRICT=1` (enabled globally in vitest setup) verifies incremental rendering matches fresh on every frame. Use `bun run test:strictest` for STRICT=2 (every-action invariants + border integrity).

### 2. Typed assertions (intent) -- app.card(), app.state, custom matchers

Express what the test is checking in domain terms. See [apps/km-tui/tests/CLAUDE.md](../../../apps/km-tui/tests/CLAUDE.md) for the full API.

```typescript
// Typed node handles
expect(app.card("Buy groceries").isCursor).toBe(true)
expect(app.column("Todo").visible).toBe(true)
expect(app.node("task1").exists).toBe(true)

// Declarative state snapshot
expect(app.state).toMatchObject({ cursor: "task1", view: "cards", overlay: null })

// Custom matchers (spatial, content, visibility)
expect(app.q("#col1")).toBeLeftOf(app.q("#col2"))
expect(app.q("#task1")).toHaveText("Buy milk")
expect(app.q("#task1")).toBeVisible()
```

### 3. Snapshots (drift detection) -- app.expectSnapshot()

Broad visual regression coverage. Best for stable layouts, not dynamic content.

```typescript
app.expectSnapshot("initial-kanban")    // golden file comparison
app.command("cursor_down")
app.expectSnapshot("after-cursor-down") // layout should be stable
```

**Canonical example**: `apps/km-tui/tests/showcase.spec.ts` -- demonstrates all three tiers in specification-style tests.

---

## Commands

### Coding Iteration (every change)

```bash
bun run test:changed                  # Preferred: sub-second when focused on a few files
bun vitest related src/foo.ts         # Tests importing a specific file
bun vitest run apps/km-tui/tests/     # All tests in a directory
```

### Before Commit

```bash
bun fix                    # Lint + format (must pass)
bun run test:all           # Full suite (must pass) ~2-3min
```

### Comprehensive CI (periodic)

```bash
bun run test:ci            # 6-phase suite: typecheck, lint, fast, slow, vendor, fuzz (~3-5min)
```

Run `test:ci` before pushing significant changes, after large refactors, or when the pre-push hook reminds you. A successful run writes a timestamp to `/tmp/km-test-ci-last-run`.

### Working on Specific Areas

| Working on...        | Run during iteration                    |
| -------------------- | --------------------------------------- |
| Current changes      | `bun run test:changed`                  |
| Specific changes     | `bun vitest run --changed`              |
| Specific file        | `bun vitest related src/foo.ts`         |
| Sync, watcher, chaos | `bun run test:slow`                     |
| Broad non-vendor     | `bun run test:fast`                     |
| Package iteration    | `bun vitest run vendor/silvery/tests/`  |

**NEVER use bare `bun test`** -- picks up archived tests.

---

## Test Commands

| Command            | What it runs                                                  | Notes                |
| ------------------ | ------------------------------------------------------------- | -------------------- |
| `test:fast`        | Default project (excludes `*.slow.*` and `vendor/**`)         | Fast feedback        |
| `test:slow`        | `--project slow` -- `*.slow.{test,spec}.*` only               | Integration tests    |
| `test:all`         | `--project default --project slow --project vendor`           | Before commit        |
| `test:fuzz`        | `FUZZ=1` -- `*.fuzz.ts` files only                             | Exploratory testing  |
| `test:vendor`      | `--project vendor` -- vendor tests only                        | Vendor isolation     |
| `test:fast:html`   | Fast tests + HTML report + performance tracking               | Performance analysis |
| `test:all:html`    | All tests + HTML report + performance tracking                | Full analysis        |
| `test:ci`          | 6-phase: typecheck, lint, fast, slow, vendor, fuzz            | Before push          |
| `test:changed`     | Changed files only (via vitest --changed)                     | Fastest iteration    |
| `test:fast:serial` | Fast tests without parallelization                            | Accurate timing      |

## Benchmark Commands

| Command          | What it does                   | Use case            |
| ---------------- | ------------------------------ | ------------------- |
| `bench`          | Run all benchmarks             | Measure performance |
| `bench:baseline` | Create baseline for comparison | After optimization  |
| `bench:compare`  | Compare against baseline       | Detect regressions  |

---

## Three Testing Modes

### 1. Regression (headless/termless) -- automated, CI-friendly

Deterministic tests that run in CI. Two rendering backends:

```
React reconcile --> measure --> layout --> content --> output --> terminal
headless: ____________________________________________/  (phases 1-4, ~5ms/op)
termless: ______________________________________________________/  (all 5, ~50ms/op)
TTY MCP:  ______________________________________________________________/  (real terminal)
```

**Preferred for new km tests**: `createTestApp()` — backend-agnostic. Write once, switch backend via `TEST_BACKEND=termless`. See [reference.md#createTestApp](reference.md#createtestapp----backend-agnostic-km-tests-recommended).

- **createTestApp()** (km-tui helpers): Backend-agnostic km board tests. Default headless (`~5ms/op`), switch to termless (`~50ms/op`) via env var. Same test code runs on either.
- **createRenderer()** (`@silvery/test`): Generic silvery component tests. Tests virtual buffer. Use for non-km components.
- **createDriverTest()** (km-tui helpers): Legacy km board API. Still used by ~50 existing tests. New tests should prefer `createTestApp()`.
- **createTermless()** (`@silvery/test`): Generic terminal emulator tests. Use for testing ANSI output of silvery components without km board state.

### 2. Exploratory (TTY screenshots) -- adaptive, judgment-based

AI-driven interactive exploration of the running TUI. Not scripted -- observe, hypothesize, investigate. See [exploratory.md](exploratory.md).

### 3. Fuzz (property-based) -- randomized invariant checking

Randomized inputs with invariant assertions after every action. Auto-shrinks on failure. See [fuzz section](#fuzz--chaos-testing) below.

---

## Which Tool? Decision Tree

```
I want to test...
+-- Component rendering / state / navigation
|   +-- km board behavior --> createDriverTest() + item()
|   +-- Silvery component --> createRenderer()
|
+-- ANSI output correctness (colors, cursor, escape sequences)
|   +-- Silvery component --> createTermless()
|   +-- Spawned process --> createTerminalFixture() + spawn()
|
+-- CLI command output
|   +-- mdspec (.spec.md files) [cli.md]
|
+-- Visual pixel verification / manual debugging
|   +-- TTY MCP tools (mcp__tty__screenshot) or app.screenshot()
|
+-- Fuzz / chaos / property-based
    +-- vimonkey (gen/take/test.fuzz)
```

### Tool Comparison

| Tool | Import | Speed | Tests what | Use for |
|---|---|---|---|---|
| `createRenderer()` | `@silvery/test` | ~5ms | Virtual buffer (no ANSI) | Component logic, layout, text |
| `createDriverTest()` | km-tui helpers | ~200ms | Board state + virtual buffer | km navigation, board features |
| `createTermless()` | `@silvery/test` | ~10ms | Real xterm.js emulator | ANSI correctness, colors, cursor |
| `createTerminalFixture()` | `@termless/test` | ~5ms+ | xterm.js + auto-cleanup | Termless tests in vitest |
| `.spawn()` | Terminal method | 1-15s | Real PTY process | Integration / E2E |
| TTY MCP | `mcp__tty__*` | seconds | Browser screenshots | Visual debugging, pixel-level |

### Choosing the Backend (createTestApp)

For new km tests, always use `createTestApp()`. The question is which backend (`headless` default vs `TEST_BACKEND=termless`):

| Bug reported as... | Backend | Why |
|---|---|---|
| "I pressed X and saw Y" (visual) | **termless** | Tests what reaches the terminal |
| "Cursor jumped to wrong place" | **termless** | Real cursor position from emulator |
| "Alt screen didn't switch" | **termless** | Terminal mode detection |
| "Card disappeared after indent" | **headless first**, run termless to verify | May be DOM or ANSI bug |
| "Undo doesn't restore fold state" | **headless** | Internal state, no terminal feature |
| "Command doesn't dispatch" | **headless** | State machine, no rendering |

**Rule**: For visual or terminal feature bugs, run the test on both backends (headless for fast iteration, termless for terminal-level verification). For behavioral bugs, headless is sufficient.

`createTestApp` defaults to headless. CI also runs headless. Run `TEST_BACKEND=termless bun run test:slow` periodically and after touching ANSI output, color resolution, or terminal mode handling.

---

## Headless Testing (createRenderer / createDriverTest)

### createRenderer() -- Silvery component tests

Fast (~5ms), no ANSI processing -- tests the virtual buffer.

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

**Key APIs**: `app.text`, `app.ansi`, `app.press()`, `app.type()`, `app.resize()`, `app.getByTestId()`, `app.getByText()`, `app.locator()`, `app.screenshot()`, `app.rerender()`, `app.unmount()`.

**Auto-refreshing locators** re-evaluate on every access:
```typescript
const cursor = app.locator('[data-cursor]')
expect(cursor.textContent()).toBe("item1")
await app.press("j")
expect(cursor.textContent()).toBe("item2")  // Same locator, fresh result
```

### createDriverTest() -- km board tests

Wraps createRenderer with board state + repo.

```typescript
import { createDriverTest, item } from "./helpers"

const { board } = createDriverTest(() =>
  item("board",
    item("col1", item("1a"), item("1b")),
    item("col2", item("2a")),
  )
)

board.press("ArrowDown")
board.expect("#1a[data-cursor]").toExist()
```

### Keyboard Input (Playwright-style)

```typescript
board.press("ArrowDown")     // Instead of "\x1b[B"
board.press("Enter")         // Instead of "\r"
board.press("Control+c")    // Ctrl+C
board.press("Shift+Tab")    // Shift+Tab
board.press("j")             // Single character
```

<a name="buffer-assertions"></a>

### Buffer Assertions

For rendering bugs, use buffer assertions -- state assertions (`toExist()`) pass even when rendering is broken.

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
| `board.expectBorderContinuous(id)` | All 4 sides unbroken |
| `board.expectHorizontalBorder(id, side)` | Top or bottom border |
| `board.expectAdjacentBorders(id)` | Node + neighbors intact |
| `board.expectNoGhostChars(region?)` | No NUL, control chars |
| `board.expectBlankRegion(x,y,w,h)` | Region is all spaces |
| `board.expectNoBlankLine(from?,to?)` | No fully blank rows |
| `board.expectNoContentGaps(rows?)` | No blank rows in content |
| `board.expectCursorVisible()` | Cursor within bounds |
| `board.expectTextNotOverflowing(id)` | Text within node bounds |
| `board.expectTextTruncated(id)` | Long text truncated |
| `board.expectColumnsAligned(ids[])` | Columns ordered, non-overlapping |
| `board.expectIncrementalMatchesFresh()` | Incremental matches fresh render |

**Color numbers**: 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white

---

## Termless Testing (createTermless)

When you need to verify actual ANSI output through a real terminal emulator (xterm.js). Use for bugs involving colors, cursor position, terminal modes, scrollback, escape sequences.

### Quick Start

```typescript
import { createTermless } from "@silvery/test"
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

### 3-Layer Verification Pattern

For terminal feature bugs, verify all three layers:

```typescript
test("feature works end-to-end", async () => {
  using term = createTermless({ cols: 40, rows: 10 })
  const handle = await run(<App />, term, { alternateScreen: true })
  await settle()

  expect(term.screen).toContainText("BOARD VIEW")    // Screen content
  expect(term).toBeInMode("altScreen")                // Terminal state
  expect(appState.mode).toBe("board")                 // App state
})
```

### What Only Termless Can Test

| Capability | Matcher / API |
|---|---|
| Scrollback content | `term.scrollback`, `toHaveScrollbackLines(n)` |
| Cursor position | `toHaveCursorAt(x, y)` |
| Cursor style | `toHaveCursorStyle("beam")` |
| Cursor visibility | `toHaveCursorVisible()`, `toHaveCursorHidden()` |
| Terminal modes (11 modes) | `toBeInMode("altScreen")` |
| Resolved RGB colors | `toHaveFg("#ff0000")`, `toHaveBg({r,g,b})` |
| Cell attributes | `toBeBold()`, `toBeItalic()`, `toBeDim()` |
| ANSI sequence correctness | Feed raw ANSI, assert rendered result |
| Wide character / emoji | `toBeWide()` |
| Terminal title | `toHaveTitle("My App")` |
| Cross-emulator conformance | Multi-backend workspace |
| Real PTY process output | `term.spawn()` + `waitForStable()` |

### Region Selectors

```typescript
term.screen       // Visible area only
term.scrollback   // History above visible area
term.buffer       // Everything (scrollback + screen)
term.row(0)       // First visible row
term.cell(0, 5)   // Cell at row 0, col 5
```

### Matchers

Import: `import "@termless/test/matchers"`

**Text** (auto-retry when awaited): `toContainText()`, `toHaveText()`, `toMatchLines()`, `toHaveTextCount()`

**Cell style**: `toBeBold()`, `toBeItalic()`, `toBeDim()`, `toBeStrikethrough()`, `toBeInverse()`, `toHaveUnderline("curly")`, `toHaveFg("#ff0000")`, `toHaveBg({r,g,b})`

**Terminal state** (auto-retry when awaited): `toHaveCursorAt()`, `toHaveCursorStyle()`, `toHaveCursorVisible()`, `toBeInMode()`, `toHaveTitle()`, `toHaveScrollbackLines()`

### Inline Mode Testing

Inline mode bugs only manifest when the terminal has existing scrollback. Pre-populate it:

```typescript
// BAD: empty terminal
const term = createTermless({ cols: 80, rows: 24 })

// GOOD: pre-populate scrollback like a real terminal
const term = createTermless({ cols: 80, rows: 24 })
term.write("$ previous-command\r\n$ another-command\r\n")
```

---

## Fuzz & Chaos Testing

Property-based fuzz testing with auto-shrinking. Uses vimonkey's `test.fuzz` with `gen()`/`take()`.

### When to Use

If you can state an invariant ("X should always be true regardless of input"), fuzz it.

### Quick Reference

```bash
bun run test:fuzz                               # All fuzz tests
FUZZ=1 bun vitest run path/to/file.fuzz.ts      # Specific file
FUZZ_SEED=12345 FUZZ=1 bun vitest run           # Reproducible run
```

**File suffix**: `.fuzz.ts` -- excluded from `test:all`, only runs with `test:fuzz` or `test:ci`.

### Core API

```typescript
import { test, gen, take } from "vimonkey"

test.fuzz("navigation never crashes", async () => {
  const { board } = createDriverTest(() => item("board", item("col", item("a"), item("b"))))
  for await (const key of take(gen(["j", "k", "h", "l", "Enter", "Escape"]), 200)) {
    board.press(key)
    board.expectNoGhostChars()  // Invariant checked after every action
  }
})
```

On failure: vimonkey auto-shrinks to minimal failing sequence and saves to `__fuzz_cases__/` for regression.

### Chaos Stream Transformers

For testing event stream systems (file sync, real-time updates):

| Transformer | What It Simulates |
|---|---|
| `drop` | Skip events with probability |
| `reorder` | Shuffle within sliding window |
| `duplicate` | Yield some events twice |
| `coalesce` | Replace N events with summary |
| `burst` | Collect then emit in rapid bursts |
| `delay` | Await before yield |
| `partialWrite` | Split change into multiple |
| `renameChain` | Expand rename into chain |

### Anti-Patterns

- **Checking invariants only at the end** -- bugs hide in intermediate states
- **No shrinking** -- use `test.fuzz()`, not raw `test()` with random loops
- **Too few iterations** -- 100+ for dev, 10000+ for CI
- **Fuzz file without `.fuzz.ts` suffix** -- will accidentally run in `test:all`
- **Stress tests in `.test.ts`** -- high iteration counts must be `.bench.ts` or `.fuzz.ts`

---

## GUI/TTY Testing (Screenshots)

For pixel-level verification and interactive debugging using the `tty` MCP server.

### In-Process Screenshots (Preferred)

```typescript
const png = await driver.screenshot('/tmp/board.png')
```

Uses `bufferToHTML()` + lazy Playwright rendering -- no PTY needed.

### TTY MCP (Interactive Debugging)

```
mcp__tty__start({ command: ["bun", "km", "view", "/path"] })
mcp__tty__wait({ sessionId, for: "BOARD VIEW" })
mcp__tty__press({ sessionId, key: "j" })
mcp__tty__screenshot({ sessionId })     // ALWAYS use screenshots for verification
mcp__tty__stop({ sessionId })
```

**Use screenshots** (`mcp__tty__screenshot`) for visual verification -- not `mcp__tty__text`.

For automated tests, prefer termless over TTY MCP. Termless runs in-process, is faster, and deterministic. TTY MCP is for interactive debugging where you need visual inspection.

---

## SILVERY_STRICT Enforcement

`SILVERY_STRICT=1` is enabled globally in `packages/km-infra/vitest/setup.ts`. Every render frame is compared incremental vs fresh. **Unknown mismatches fail the test.**

If a test fails with `IncrementalRenderMismatchError`:

1. **Fix the renderer bug** -- do not disable STRICT or skip the test
2. If the mismatch is a known bug, whitelist it:
   - **Per-run**: `SILVERY_STRICT_KNOWN="*zoom*,*garble*" bun vitest run ...`
   - **Permanent**: Add to `getKnownPatterns()` in `setup.ts`

### Diagnostic Mode

```bash
SILVERY_STRICT=1 bun km view /path/to/vault       # Real app
SILVERY_STRICT=1 bun vitest run apps/km-tui/tests/ # Tests
```

**What it catches**: incremental vs fresh render mismatches, ghost pixels, stale background colors, blank cards after fold/unfold, buffer divergence after outline depth changes.

---

## Test File Organization

**Always add regression tests to existing thematic files.** The km-tui test suite is organized by domain (fold, zoom, scroll, etc.), not by bug ID.

**Rules:**
1. Search for an existing file that matches your bug's domain before creating a new file
2. Only create a new file if: no domain match exists AND the test seeds 5+ related cases
3. Name new files by domain (`fold.test.ts`), not by bug (`fold-border-blank.test.ts`)
4. Group related tests under `describe()` blocks

### Test File Suffixes

| Suffix          | What It Tests                   | Layer |
| --------------- | ------------------------------- | ----- |
| `.spec.ts`      | **User-level journeys** -- keys in, observations out | km-tui (Layer 5) |
| `.test.ts`      | Unit/component/pipeline -- internal API | All layers |
| `.slow.test.ts` | Heavy TUI tests (>5s), sync, real vault | Layers 3-5 |
| `.slow.spec.ts` | Heavy user-level journeys (>5s) | km-tui (Layer 5) |
| `.bench.ts`     | Performance measurement (vitest bench) | Any |
| `.fuzz.ts`      | Fuzz + chaos tests (excluded from test:all) | Any |
| `.spec.md`      | CLI commands via mdspec         | km-cli |

**Rules**:
- Tests taking >5s should be `.slow.test.ts` or `.slow.spec.ts`
- Stress tests, large fixtures (100+ nodes), high iteration counts (100+) MUST be `.bench.ts`
- Ad-hoc debugging tests that aren't evergreen should be deleted, not committed

### When to Use .spec.ts vs .test.ts

If your test presses keys and asserts what the user sees, use `.spec.ts`. If it calls internal functions or checks internal state, use `.test.ts`.

---

<a name="test-layers"></a>

## Test Layers

Every test should answer: **"Does this test what THIS layer adds?"**

### Priority: Acceptance Tests First

**The most valuable tests are closest to the user.** Journey tests (`.spec.ts`) that press keys and verify what the user sees + what got saved are the highest priority.

### The Layers

```
-- km app --
Layer 5b: Termless (.termless.test.ts) --> ANSI output verification
Layer 5a: km-tui (.spec.ts)           --> User journeys (TOP PRIORITY)
Layer 4: km-board (.test.ts)          --> Action sequences, state transitions
Layer 3: km-storage (.test.ts)        --> Pipeline integrity: files <-> nodes
Layer 2: km-markdown (.test.ts)       --> Parse fidelity: markdown <-> AST
Layer 1: km-core (.test.ts)           --> Contracts: invariants hold

-- vendor --
Layer 0a-d: silvery, flexily, ansi    --> Rendering, layout, terminal primitives
Layer 0e+: infrastructure             --> Logger, vimonkey, mdspec, tools, etc.
```

### Value Check (before writing any test)

1. **Layer check**: Does this test belong at this layer?
2. **Addition check**: Does it verify what THIS layer adds?
3. **Observation check**: Is the assertion at the right abstraction level?

### Anti-Pattern: Cross-Layer Re-Testing

**Bad**: Storage test verifying markdown heading parse (belongs in km-markdown). TUI test asserting board reducer state shape (belongs in km-board).

**Good**: TUI test pressing keys and checking screen + saved data. Storage test writing a file, syncing, editing DB, syncing back.

### Import Cost Layers

| Layer | Import Cost | Example |
|---|---|---|
| 0: Pure Logic | ~20-50ms | `text-utils.test.ts` |
| 0+: Module imports | ~500-700ms | `input-mode.test.ts` |
| 1: Component Unit | ~200ms | `node-view.test.tsx` |
| 2+: Integration | ~1.8s | `hr.test.ts`, `fold.slow.test.ts` |

Layer 2+ files share ~1.8s import cost. Consolidating them saves ~1.8s per eliminated file. Don't merge Layer 0 tests into Layer 2 files.

---

## Output Rules

**km project tests must be silent on success.** Any stdout/stderr output fails the test.

- `console.log/info/debug` are intercepted and fail the test
- If your test needs output, use `vi.spyOn(console, "log").mockImplementation(() => {})`
- Debug with: `SKIP_OUTPUT_CHECK=1 bun test path/to/test.ts`

Vendor tests do not have console enforcement.

---

## TEST_MODE

| Mode      | Database | When to Use                   |
| --------- | -------- | ----------------------------- |
| (default) | :memory: | Normal development            |
| `real`    | Disk     | CI, releases, drift detection |

---

## TDD Cycle

1. Write failing test (test-first protocol)
2. Implement feature
3. `test:fast` passes
4. `bun fix` passes
5. `test:all` passes
6. Clean up: keep as `.test.ts` or delete if ad-hoc (`.scratch.ts` for vitest-ignored scratch)
7. Commit

**Test Safety**: Tests use `/tmp/kmtest-*` (auto-cleaned). NEVER test on real user data. `km sync --to-fs` can corrupt files -- always isolate.

---

## Timing Guard

**test:fast target: <20s wall-clock** (30s warning threshold).
If it exceeds 30s:
1. Check `ps aux | grep vitest` for stale processes
2. Find hanging test with per-file runs, fix or mark `.slow.test.ts`
3. New TUI tests >5s should be `.slow.test.ts`

---

## Vitest Config

Single config at `vitest.config.ts` with named projects:
- **`default`** -- excludes `*.slow.*`, `*.pty.*`, and `vendor/**` (= fast tests)
- **`slow`** -- only `*.slow.{test,spec}.*` files
- **`vendor`** -- only `vendor/**`

Reporter: `dot` (minimal). All imports use `vitest` (not `bun:test`), run with `bunx --bun`.

---

## Bug Classification

| Bug Type | Test Approach | Example |
|----------|--------------|---------|
| **State bug** (wrong cursor, missing node) | DOM assertions: `board.expect("#id").toExist()` | Cursor on wrong card |
| **Rendering bug** (wrong color, missing border) | Buffer assertions: `board.expectNodeColor()` | Wrong selected color |
| **Terminal bug** (cursor, modes, ANSI) | Termless: `term.cell()`, `toBeInMode()` | Alt screen wrong |
| **Mixed** (state + rendering) | Both: DOM + buffer assertions | Card exists but no border |

**CRITICAL**: For rendering bugs, state-only assertions are insufficient. Always use buffer assertions.

---

## Node-Type-Specific Testing

Include the actual node type being tested in fixtures:

```typescript
// BAD: generic items
const { board } = createDriverTest(() => item("board", item("col", item("card"))))

// GOOD: include the actual node type
const { board } = createDriverTest(() =>
  item("board", item("col",
    item("card above"),
    item.hr(),           // actual HR node
    item("card below"),  // verify adjacent integrity
  ))
)
```

---

## Common Pitfalls

- **Multi-pass layout**: Some components trigger layout feedback loops. Test with components that change height based on measured width.
- **Fixtures must match production complexity**: Real vault data triggers mismatches that synthetic fixtures miss. Use large fixtures (50+ items) for suspected real-data bugs.
- **Init-sequence bugs**: Startup timing bugs need `createTermless` tests that verify ANSI sequence order.
- **checkIncremental must be ON**: Default in `createDriverTest()`. Never create tests with `checkIncremental: false` unless deliberately testing a known-broken path.

---

## Sub-Skills

| Need                              | Load                                  |
| --------------------------------- | ------------------------------------- |
| Exploratory testing               | [exploratory.md](exploratory.md)      |
| API reference (full interfaces)   | [reference.md](reference.md)          |
| CLI testing (mdspec)              | [cli.md](cli.md)                      |
| Benchmarks                        | [bench.md](bench.md)                  |

**Full reference**: [docs/dev/testing.md](../../docs/dev/testing.md)

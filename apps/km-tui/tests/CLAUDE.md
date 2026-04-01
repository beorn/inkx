# km-tui Tests

**Layer 5 — User Journeys**: Keys in, screen + persistence out. Trust everything below.

This is the largest test directory (~112 files). Tests here verify what the user sees and what gets saved — the full pipeline from keypress to rendered screen to persisted data.

## What to Test Here

- User journeys: multi-step sequences of keypresses → verify screen output AND persisted data
- Visual rendering: colors, borders, overflow indicators, layout
- Navigation: cursor movement, column switching, zoom in/out
- Editing: inline edit, detail pane, undo/redo

## What NOT to Test Here

- Board reducer state shape without checking the screen — that's km-board
- File ↔ DB sync without user interaction — that's km-storage
- Markdown parsing — that's km-markdown

## Key Helpers

### `helpers/board-test.ts` — Core testing API

| Helper                                     | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `item(title, ...children)`                 | Fluent tree builder for test fixtures                |
| `testEnv(builder)`                         | Create virtual board with fake repo + silvery buffer |
| `testEnvWithRepo(builder)`                 | testEnv with repo access for persistence checks      |
| `renderBoard(nodes, opts)`                 | Static render without interaction                    |
| `renderBoardWithStore(repo, rootId, opts)` | Static render with store context                     |

```typescript
const { board, repo } = testEnv(() => item("board", item("Todo", item("Buy milk")), item("Done")))
board.press("Enter") // interact
board.expect("#Buy milk").toExist() // verify screen
expect(repo.getNode("Buy milk")).toBeDefined() // verify persistence
```

### `helpers/board-app.ts` — Driver pattern (for AI/exploration)

| Helper                  | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `board.app(dsl)`        | Create board from string DSL                |
| `board.load(vaultPath)` | Load from real vault                        |
| `board.fixture(name)`   | Named fixtures: kanban, nested, empty, etc. |
| `defaultInvariants`     | Auto-checked: rendering, cursor, selection  |
| `allInvariants`         | + parent links, node links, layout          |

```typescript
const app = board.app(["Inbox > Task 1", "Projects > Alpha"])
app.press("j") // invariants auto-checked
app.columns() // spatial query: what's on screen
app.cards() // all visible cards with positions
```

### Other Helpers

| File                         | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `fixtures/board-fixtures.ts` | Pure data factories                        |
| `helpers/real-board.ts`      | Load real vaults (async, for .slow. tests) |
| `helpers/fuzz-invariants.ts` | Invariant checkers for fuzz/chaos          |
| `helpers/matchers.ts`        | Custom vitest matchers                     |

## Termless Tests for Visual & Terminal Bugs

**When the user reports a visual bug** (something they saw or did), use `createTermless()` — not `testEnv()`. testEnv tests the virtual buffer; termless tests what the terminal actually renders.

```typescript
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "silvery/runtime"

test("feature works end-to-end", async () => {
  using term = createTermless({ cols: 40, rows: 10 })
  const handle = await run(<App />, term, { alternateScreen: true })
  await settle()

  // Layer 1: Screen content (what the user sees)
  expect(term.screen).toContainText("BOARD VIEW")
  // Layer 2: Terminal state (what the terminal is doing)
  expect(term).toBeInMode("altScreen")
  // Layer 3: App state (internal consistency)
  expect(appState.consoleOpen).toBe(false)
})
```

**Canonical example**: `console-toggle-repro.test.tsx` — full 3-layer verification across a toggle cycle.

See [termless.md](../../../.claude/skills/tests/termless.md) for the full API and decision guide.

## Fixture Best Practices

### Shared Fixtures

Use shared fixture factories instead of repeating common `item()` trees:

```typescript
// Use shared fixtures instead of repeating common item() trees:
const { board } = testEnv(item.simpleBoard) // 1 col, 3 cards (1a, 1b, 1c)
const { board } = testEnv(item.multiColBoard) // 3 cols, 1 card each
const { board } = testEnv(item.nestedBoard) // 1 col, folder + sibling
```

### `navigateTo` Helper

Navigate directly to a card by name instead of chaining cursor commands:

```typescript
board.navigateTo("task-name") // instead of repeated board.command("cursor_down")
```

### Prefer `board.app()` for New Tests

The `board.app()` DSL (from `helpers/board-app.ts`) is the preferred way to set up fixtures in new tests — it's concise and supports spatial queries:

```typescript
const app = board.app(["Todo > Task 1", "Done > Task 2"])
app.press("j")
app.columns() // spatial queries
```

### Journey Tests Over Single-Step Tests

Prefer 3-5 step journey tests over many 1-step tests with identical fixtures. Each `testEnv()` costs ~1.8s — combine related assertions into a single journey that tells a coherent user story.

### Consolidation Guidelines

- Files <100 lines should merge into their domain parent
- Current target: ~50-60 files (from ~112)
- Before creating a new test file, check if the domain already has one

### Anti-patterns

- **Don't repeat `item("board", item("col1", item("1a"), item("1b"), item("1c")))`** — use `item.simpleBoard`
- **Don't create new test files for <3 tests** — add to an existing domain file
- **Don't use 10+ separate `testEnv()` calls with identical fixtures** — combine into journey tests

## Test File Organization

Tests are organized **by domain, not by bug**. Always add to an existing thematic file first.

See the [domain → file mapping](../../../.claude/skills/tests/test-first-protocol.md#domain--file-mapping-km-tui) for the full list.

**Anti-pattern**: Creating `fold-border-blank.test.ts` — merge into `fold.slow.test.ts` instead.

### Consolidation Target

Current: ~112 files. Target: **~50-60 files** through domain-based consolidation. The domain mapping lists ~25-30 distinct areas — aim for roughly one file per domain.

Each eliminated file saves ~1.8s of import overhead. Merging 20 files saves ~4s wall-clock time (distributed across 9 vitest workers).

**How to consolidate**: Merge files sharing a domain prefix (e.g., all `cursor-*` files → `cursor.slow.test.ts`), absorb tiny files (<50 lines) into their domain file, combine tests with identical fixtures into journey tests. Use `describe` blocks to preserve logical grouping within the merged file.

### Boundary Coverage

Journey tests are the primary guard against bugs at layer boundaries (board↔storage, storage↔markdown). Ensure every major user action has a journey test that verifies **both** screen output AND persisted data — not just one or the other. If a journey test only checks screen state, a persistence bug slips through. If it only checks DB state, a rendering bug slips through.

## File Suffixes

| Suffix                            | When                                      | Example                   |
| --------------------------------- | ----------------------------------------- | ------------------------- |
| `.spec.ts`                        | Keys in, screen out — user-level journeys | `board-edit.slow.spec.ts` |
| `.test.ts`                        | Internal API, component rendering         | `card-layout.test.tsx`    |
| `.slow.test.ts` / `.slow.spec.ts` | Takes >5s (heavy TUI setup)               | `fold.slow.test.ts`       |
| `.bench.ts`                       | Performance measurement                   | `scroll-perf.bench.ts`    |
| `.fuzz.ts`                        | Chaos/randomized testing                  | `monkey.fuzz.ts`          |

## Journey Test Pattern

**One user story per test**, 3-5 steps that naturally go together. If you're starting a second story, split into another test. Too short (1 step) loses integration benefit; too long (10+ steps) makes failures hard to diagnose.

```typescript
test("edit card, move column, undo restores both", () => {
  const { board, repo } = testEnv(() => item("board", item("Todo", item("Buy milk")), item("Done")))
  board.press("Enter") // edit mode
  board.type(" (organic)") // modify
  board.press("Escape") // save
  board.press("opt+l") // move to Done

  // Verify BOTH screen and persistence
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk (organic)")
  board.expect("#Buy milk").toExist()

  board.press("Control+z") // undo move
  board.press("Control+z") // undo edit
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk")
})
```

Prefer this over 5 separate tests each creating their own `testEnv()`.

## Snapshot Testing (Layout Regression)

For broad visual regression coverage, use **golden file snapshots** — capture the full buffer content and compare against a baseline. This catches unintended layout changes that point assertions miss.

```typescript
// Capture full screen as golden file
test("kanban board renders correctly", () => {
  const { board } = testEnv(() => item("board", item("Todo", item("Task 1"), item("Task 2")), item("Done")))
  expect(board.screen.toString()).toMatchSnapshot()
})

// After navigation — verify layout didn't break
test("zoom into column preserves layout", () => {
  const { board } = testEnv(() => kanbanFixture())
  board.press("z") // zoom in
  expect(board.screen.toString()).toMatchSnapshot()
})
```

**Trade-offs**: Snapshots are brittle if UI text or layout changes often — update them intentionally with `--update`. Best for stable layout structures, not dynamic content. Use alongside point assertions, not instead of them.

## Resize Testing

Test at different terminal sizes to catch layout bugs. Column widths, overflow indicators, and scroll behavior can break at non-default dimensions.

```typescript
test.each([
  { cols: 40, rows: 10, name: "tiny" },
  { cols: 80, rows: 24, name: "standard" },
  { cols: 200, rows: 50, name: "wide" },
])("board renders at $name terminal ($cols x $rows)", ({ cols, rows }) => {
  const { board } = testEnv(() => kanbanFixture(), { columns: cols, rows })
  // Verify no crash, cards visible, overflow indicators correct
  board.expect("#Todo").toExist()
  expect(board.screen.width).toBe(cols)
})
```

## Ad-Hoc Testing (Quick Verification)

When you need to quickly verify a behavior without writing a permanent test:

```bash
# Run a single test file
bun vitest run apps/km-tui/tests/fold.slow.test.ts

# Run tests matching a name pattern
bun vitest run apps/km-tui/tests/ -t "fold last card"

# Run only tests affected by your changes
bun run test:changed

# Run tests importing a specific source file
bun vitest related apps/km-tui/src/board/Board.tsx
```

For interactive visual verification, use TTY MCP tools:

```
mcp__tty__start(command: ["bun", "km", "view", "/path/to/vault"])
mcp__tty__press(key: "j")       # navigate
mcp__tty__screenshot()           # see the screen
mcp__tty__stop()                 # cleanup
```

**Important**: Ad-hoc test files created during debugging should NOT be committed. If the test has lasting value, merge it into the appropriate thematic file. If it was just for investigation, delete it before committing.

## Buffer Assertions

For rendering bugs, use buffer assertions — not just state checks. See [tui.md](../../../.claude/skills/tests/tui.md#buffer-assertions) for the full method list.

```typescript
board.expect("#card-title").toHaveStyle({ color: "cyan" })
board.expectRow(0).toContain("Todo")
board.expectNodeColor("Buy milk", "whiteBright")
```

## Efficiency

- **Use `testEnv()` with `createFakeRepo()`** — in-memory, no disk I/O. Never use `withTestEnv()` (real DB) in fast TUI tests.
- **Share fixtures**: If multiple tests use the same `item()` tree, combine into a journey test with one `testEnv()` call. Each `testEnv()` costs ~1.8s import overhead per file.
- **Prefer lower layers**: If your test doesn't need screen assertions, write it in km-board (pure state) or km-storage (pipeline) instead — cheaper and faster.
- **Tests >5s → `.slow.test.ts`** or `.slow.spec.ts`. The fast suite is capped at 20s.
- **Tests with >100 nodes or >100 iterations → `.bench.ts`**. Never `.test.ts`.

## Termless TTY Regression Tests

Tests that feed Silvery ANSI output through a real terminal emulator (xterm.js/Ghostty WASM) and assert on the resulting terminal state. Catches bugs that virtual buffer tests miss: ANSI generation errors, style leaks across frames, cursor positioning after diff output, wide character rendering.

**Speed**: ~30-100ms per test (WASM, in-process, deterministic). Fast enough for CI.

```typescript
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import "@termless/test/matchers"

test("board renders correct colors through real terminal", () => {
  // Render a board, capture ANSI output from Silvery
  const { board } = testEnv(() => item("board", item("Todo", item("Buy milk"))))
  const ansiOutput = board.ansi // raw ANSI from Silvery output phase

  // Feed to real terminal emulator
  const term = createTerminal({ backend: createXtermBackend({ cols: 80, rows: 24 }) })
  term.feed(ansiOutput)

  // Assert on terminal state (not Silvery buffer — the actual parsed result)
  expect(term.screen).toContainText("Buy milk")
  expect(term.cell(0, 0)).toBeBold()
  expect(term.cell(0, 0)).toHaveFg("#cyan")
  term.close()
})
```

**Canonical examples**: `vendor/silvery/tests/output-termless.test.ts` (fullscreen diff), `inline-termless.test.ts` (inline mode), `scrollback-termless.test.ts` (scrollback + cursor).

**@termless/test matchers** (auto-registered via `import "@termless/test/matchers"`):

| Category          | Matchers                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Text (RegionView) | `toContainText()`, `toHaveText()`, `toMatchLines()`                                         |
| Cell style        | `toBeBold()`, `toBeItalic()`, `toHaveFg()`, `toHaveBg()`, `toHaveUnderline()`, `toBeWide()` |
| Terminal          | `toHaveCursorAt()`, `toHaveCursorVisible()`, `toBeInMode()`, `toHaveTitle()`                |
| Snapshot          | `toMatchTerminalSnapshot()`, `toMatchSvgSnapshot()`                                         |

**Region selectors**: `term.screen`, `term.scrollback`, `term.row(n)`, `term.cell(r, c)`, `term.range(r1, c1, r2, c2)`.

**File suffix**: `.termless.test.ts` for termless-specific tests.

## Related Test Types

| Type                    | Location                | When                                                                                       |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| **Termless**            | `*.termless.test.ts`    | ANSI output verification through real terminal emulator (CI-friendly).                     |
| **Fuzz/chaos**          | `*.fuzz.ts`             | Randomized keypresses, monkey testing. Run with `FUZZ=1`.                                  |
| **Property invariants** | `*.fuzz.tsx` (silvery)  | Mathematical rendering invariants (idempotence, inverse ops, clipping). Run with `FUZZ=1`. |
| **Benchmarks**          | `*.bench.ts`            | Rendering, scroll, navigation perf. Run with `bun run bench`.                              |
| **GUI/TTY**             | Via `mcp__tty__*` tools | Real terminal verification for visual bugs (not in CI).                                    |
| **Storybook**           | `bun storybook`         | Interactive component catalog for visual inspection.                                       |

## Fuzz Testing Patterns

`render-fuzz.fuzz.ts` uses several patterns for randomized rendering validation (run with `FUZZ=1`):

- **Large fixtures** (`largeFixture`, 100 items) — stress test incremental rendering at scale
- **Nested fixtures** (`nestedFixture`) — deeply nested tree structures
- **Extended fixtures** — `scrolling-tiny` (30x10) and `scrolling-wide` (200x50) terminal sizes
- **Mutation keys** — `z/Z` (zoom), `f/F` (fold), `Enter/Escape`, `Tab` — keys that trigger structural DOM changes, not just cursor moves
- **Property invariants** (in silvery's `property-invariants.fuzz.tsx`) — idempotence, no-op stability, inverse operations, viewport clipping bounds

## See Also

- [Test layering philosophy](../../../.claude/skills/tests/test-layers.md)
- [TUI testing skill](../../../.claude/skills/tests/tui.md)
- [Buffer assertions](../../../.claude/skills/tests/tui.md#buffer-assertions)
- [Benchmarks](../../../.claude/skills/tests/bench.md)

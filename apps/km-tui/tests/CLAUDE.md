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

| Helper | Purpose |
|--------|---------|
| `item(title, ...children)` | Fluent tree builder for test fixtures |
| `testEnv(builder)` | Create virtual board with fake repo + inkx buffer |
| `testEnvWithRepo(builder)` | testEnv with repo access for persistence checks |
| `renderBoard(nodes, opts)` | Static render without interaction |
| `renderBoardWithStore(repo, rootId, opts)` | Static render with store context |

```typescript
const { board, repo } = testEnv(() =>
  item("board", item("Todo", item("Buy milk")), item("Done"))
)
board.press("Enter")          // interact
board.expect("#Buy milk").toExist()  // verify screen
expect(repo.getNode("Buy milk")).toBeDefined()  // verify persistence
```

### `helpers/board-app.ts` — Driver pattern (for AI/exploration)

| Helper | Purpose |
|--------|---------|
| `board.app(dsl)` | Create board from string DSL |
| `board.load(vaultPath)` | Load from real vault |
| `board.fixture(name)` | Named fixtures: kanban, nested, empty, etc. |
| `defaultInvariants` | Auto-checked: rendering, cursor, selection |
| `allInvariants` | + parent links, node links, layout |

```typescript
const app = board.app(["Inbox > Task 1", "Projects > Alpha"])
app.press("j")               // invariants auto-checked
app.columns()                 // spatial query: what's on screen
app.cards()                   // all visible cards with positions
```

### Other Helpers

| File | Purpose |
|------|---------|
| `fixtures/board-fixtures.ts` | Pure data factories |
| `helpers/real-board.ts` | Load real vaults (async, for .slow. tests) |
| `helpers/fuzz-invariants.ts` | Invariant checkers for fuzz/chaos |
| `helpers/matchers.ts` | Custom vitest matchers |

## Test File Organization

Tests are organized **by domain, not by bug**. Always add to an existing thematic file first.

See the [domain → file mapping](../../../.claude/skills/tests/test-first-protocol.md#domain--file-mapping-km-tui) for the full list.

**Anti-pattern**: Creating `fold-border-blank.test.ts` — merge into `fold.slow.test.ts` instead.

## File Suffixes

| Suffix | When | Example |
|--------|------|---------|
| `.spec.ts` | Keys in, screen out — user-level journeys | `board-edit.slow.spec.ts` |
| `.test.ts` | Internal API, component rendering | `card-layout.test.tsx` |
| `.slow.test.ts` / `.slow.spec.ts` | Takes >5s (heavy TUI setup) | `fold.slow.test.ts` |
| `.bench.ts` | Performance measurement | `scroll-perf.bench.ts` |
| `.fuzz.ts` | Chaos/randomized testing | `monkey.fuzz.ts` |

## Journey Test Pattern

One well-designed journey test exercises multiple behaviors with a single fixture:

```typescript
test("edit card, move column, undo restores both", () => {
  const { board, repo } = testEnv(() =>
    item("board", item("Todo", item("Buy milk")), item("Done"))
  )
  board.press("Enter")           // edit mode
  board.type(" (organic)")       // modify
  board.press("Escape")          // save
  board.press("opt+l")           // move to Done

  // Verify BOTH screen and persistence
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk (organic)")
  board.expect("#Buy milk").toExist()

  board.press("Control+z")       // undo move
  board.press("Control+z")       // undo edit
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk")
})
```

Prefer this over 5 separate tests each creating their own `testEnv()`.

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

## Related Test Types

| Type | Location | When |
|------|----------|------|
| **Fuzz/chaos** | `*.fuzz.ts` | Randomized keypresses, monkey testing. Run with `bun run test:fuzz`. |
| **Benchmarks** | `*.bench.ts` | Rendering, scroll, navigation perf. Run with `bun run bench`. |
| **GUI/TTY** | Via `mcp__tty__*` tools | Real terminal verification for visual bugs (not in CI). |
| **Storybook** | `bun storybook` | Interactive component catalog for visual inspection. |

## See Also

- [Test layering philosophy](../../../.claude/skills/tests/test-layers.md)
- [TUI testing skill](../../../.claude/skills/tests/tui.md)
- [Buffer assertions](../../../.claude/skills/tests/tui.md#buffer-assertions)
- [Benchmarks](../../../.claude/skills/tests/bench.md)

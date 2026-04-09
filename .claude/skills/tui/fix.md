---
description: Debug and fix TUI rendering issues using TUI tests
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
---

# Fix TUI Rendering Issues

**Issue**: $ARGUMENTS

## Rules

Follow the [test-first protocol](../tests/SKILL.md#test-first-protocol). No code analysis or theorizing until you have a failing test.

0. **Verify incremental checking is ON** — `testEnv()` has `checkIncremental: true` by default. If the test uses `checkIncremental: false`, remove it first. Incremental checking catches stale-pixel bugs that are invisible to other assertions.
1. **Use withDiagnostics** — it has checkIncremental, checkReplay, checkStability
2. **Write to /tmp/** — diagnostics are exploratory, promote when stable
3. **If tests pass but bug is visible** — fix the diagnostic tooling, don't blame terminals
4. **Search history first** — `bun recall "bug keywords"` before writing tests. Prior sessions may have diagnosed the same area.
5. **Root cause after fix** — after fixing, analyze: why did this happen? Why didn't tests catch it? What structural change prevents this class of bug? Create a prevention bead if non-trivial.

## Rendering Bugs (Ghost Chars, Stale Pixels, Wrong Content)

**ALWAYS start with `withDiagnostics`** — it catches 95% of rendering bugs automatically:

```typescript
// /tmp/diag-rendering.test.ts
import { createBoardDriver } from "@km/tui/driver.ts"
import { createFakeRepo } from "@km/storage"
import { withDiagnostics } from "silvery"
import { item } from "@km/tui/tests/helpers/board-test.ts"

const nodes = item.root("board",
  item("Col1", item("Task 1"), item("Task 2")),
  item("Col2", item("Task 3"), item("Task 4")),
)
const driver = withDiagnostics(
  createBoardDriver(createFakeRepo({ nodes }), "board"),
  { checkIncremental: true, checkReplay: true, checkStability: true }
)

// Every command is automatically checked for:
// 1. Buffer correctness (incremental vs fresh render)
// 2. ANSI replay correctness (what terminal sees matches buffer)
// 3. Content stability (cursor moves don't change content)
await driver.cmd.down()
await driver.cmd.down()
await driver.cmd.up()
// Add view switches, level navigation, etc.
```

**Three diagnostic checks explained:**

| Check | What it catches | How |
|-------|----------------|-----|
| `checkIncremental` | Stale pixels, wrong clearing | Compares incremental render buffer vs fresh render buffer |
| `checkReplay` | Ghost chars, ANSI output bugs | Simulates terminal receiving ANSI diff, compares to buffer |
| `checkStability` | Content shifts on cursor move | Compares text before/after cursor commands |

**If all three pass but bug still visible**: The diagnostic tooling has a gap. Fix the tooling (add new checks), don't blame the terminal.

**NEVER:**
- Theorize about root causes without a failing test
- Assume "terminal emulator bug" — 99% of the time you're wrong
- Hand-roll ANSI tests when `withDiagnostics` exists

## When User Mentions a Vault Path

**IMMEDIATELY** load the real vault - don't start with synthetic data:

```typescript
// /tmp/diag-cursor-bug.spec.ts
import { test, expect } from 'vitest'
import { loadTestBoard, check } from '@km/tui/test'

test("reproduce bug with real vault", async () => {
  const board = await loadTestBoard("/tmp/v2")  // LOAD IMMEDIATELY

  // Capture initial state
  const before = { cursor: board.cursor, text: board.text }

  // Reproduce the issue
  board.press("k").press("k")  // Navigate to board level

  // Check what changed
  expect(board.text).toContain("expected content")
  check.rendering(board)
})
```

Run: `bun vitest run /tmp/diag-cursor-bug.spec.ts`

## Ad-hoc Diagnostics Workflow

1. **Write to /tmp first** - diagnostics are exploratory
2. **Load real vault** if user mentions a path
3. **Reproduce the bug** - if test fails, bug confirmed
4. **Fix the code** - iterate on the fix
5. **Promote to existing thematic file** - move the test into the matching domain file in `apps/km-tui/tests/` (e.g., fold bug → `fold.test.ts`, scroll bug → `scroll.test.ts`). See the [tests skill](../tests/SKILL.md) for the full domain→file mapping.
6. **Clean up** - after the bug is fixed, the repro test MUST be either:
   - **Promoted**: merged into the existing thematic test file for its domain
   - **Deleted**: if the bug is already covered by other tests
   Never leave `*-repro*`, `*-debug*`, or `*-profile*` test files in the repo.
   Never create a new per-bug file (e.g., `fold-border-blank.test.ts`) — always merge into the domain file.
   Use `.scratch.ts` (not `.test.ts`) for temporary investigation files so they don't run in test suites.

## Buffer Assertion Toolbelt

**You MUST read and use** the [buffer assertion API](../tests/SKILL.md#buffer-assertions) for rendering bugs — it has the full method list, color codes, and usage guidance.

```typescript
const { board } = testEnv(() => item("board", item("col", item("task"))))
board.expectNodeColor("task", { fg: 0, bg: 3 }) // black on yellow (selected)
board.expectNodeBorder("task")                    // has border chars on edges
```

## Definition of Done (Mandatory)

Every bug fix MUST satisfy all items before the bead can be closed:

- [ ] Failing test written BEFORE the fix (test-first mandatory)
- [ ] Buffer assertions used for rendering bugs (`expectNodeColor`, `expectRow`, `expectCellColor`, etc.)
- [ ] Test passes after fix
- [ ] `bun vitest run apps/km-tui/tests/` — no NEW failures introduced
- [ ] `bun run test:fast` — full suite green
- [ ] **GUI/TTY visual verification for rendering/visual bugs** — TUI tests alone are NOT sufficient
- [ ] **User confirmed fixed** — user visually verified the fix on their own terminal
- [ ] Close reason uses structured format — **read** [bugs.md](../pm/workflows/bugs.md#close-reason-template) for the mandatory format

<a name="three-layer-verification"></a>

### Three-Layer Verification (MANDATORY for visual/rendering bugs)

TUI tests check DOM content and computed colors, but they do NOT catch all terminal
rendering issues (pixel alignment, actual ANSI rendering, layout proportions, border
continuity). Any bug that affects what the user **sees on screen** requires ALL THREE:

1. **TUI regression test** (fast, runs in CI) — catches the bug programmatically so
   it never regresses. Must be fast enough for `test:fast`. This is the ongoing guard.
2. **GUI/TTY verification by AI** (one-time) — AI launches TUI via TTY MCP, reproduces
   the scenario, takes a screenshot proving the fix looks correct.
3. **User confirmation** — the user visually verifies the fix on their own terminal.
   The bead is NOT closed until the user confirms.

```
Fixer confirms fixed (TUI tests pass)
  → AI confirms fixed (GUI/TTY screenshot)
    → User confirms fixed (visual check)
      → Bead closed
```

```bash
# Use mcp_tty tools to launch TUI, reproduce scenario, screenshot
# Save as /tmp/verify-<bead-id>.png
# Close reason must reference all three layers
```

**After GUI/TTY verification, calibrate the regression test:**
- If the TUI test passes but GUI/TTY still shows the bug, the test is insufficient.
  Improve it with better buffer assertions (`expectNodeColor`, `expectCellColor`,
  `expectRow`, `expectNodeBorder`).
- Goal: the TUI test should catch future regressions without needing GUI/TTY verification again.
  GUI/TTY is the calibration step, not the ongoing guard.

**Pure logic bugs** (wrong state, bad cursor position, missing data) can skip GUI/TTY and
user confirmation. The close reason should state: `Verified: TUI tests only — no visual component`.

### Couple Targeted Fixes with Focused Tests

Small, targeted UI fixes (e.g., normalizing two columns after a swap, fixing a width estimate) can yield large stability gains — but only if paired with a focused regression test. Every fix, no matter how small, MUST have a test that would fail without the fix. This prevents the fix from being silently reverted by future refactors.

**Do NOT close a visual bead until the user has confirmed.** If the user hasn't verified yet,
the bead stays open (mark as "awaiting user confirmation" in notes).

#### Status Flow for Visual Bugs

```
1. in_progress — working on fix
2. in_progress + note "TUI test passes" — Layer 1 done
3. in_progress + note "GUI/TTY verified: /tmp/verify-X.png" — Layer 2 done
4. in_progress + note "Awaiting user confirmation" — waiting for Layer 3
5. closed — ONLY after user says fixed
```

#### Anti-Patterns: Case Studies from Session 0215b

These bugs were all closed prematurely — learn from them:

| Bug | What happened | Root cause of premature closure |
|-----|---------------|-------------------------------|
| **virtual-nav** | TTY showed "no scrolling" — closed anyway | state-only test (cursor text, not visual movement); layer-2-skipped (TTY evidence contradicted closure) |
| **col-shift** | Failing tests (1/8, 4/24) documented in bead — closed anyway | single-operation test (1 shift, bug needs 7+); tests-insufficient |
| **card-border-missing** | User reported still broken after close | synthetic-data (2-col layout, real vault has wide columns); layer-3-skipped |
| **hr-edit** | Close reason says "awaiting user confirmation" but marked CLOSED | "Awaiting" = not done = not closable. Contradiction in close reason. |
| **fold-border-blank** | Tests check dash continuity but not adjacent card integrity | tests-insufficient — checks mutated element but not neighboring elements |

**Rule**: If your close reason contains "awaiting" anything, the bead is NOT closable.

### When the User Says "Not Fixed"

If the user rejects a fix (says it's not actually fixed or not right):

1. **Distinguish**: Is this a **process failure** (AI verified but missed the issue) or
   **iterative refinement** (user changed their mind / wants something different after seeing it)?
2. **Process failure** → run a retrospective:
   - Why did TUI tests pass but the bug is still visible?
   - Why did AI's GUI/TTY verification miss it?
   - What buffer assertion or GUI/TTY check would have caught it?
   - Update tests/assertions/process to prevent this class of miss
   - Log the retrospective in the bead notes
3. **Iterative refinement** → normal re-work, no retrospective needed. User is refining
   requirements based on seeing the result — this is expected and healthy.

## Quick Start (Synthetic Data)

For issues without a specific vault:

```typescript
import { createTestBoard, check } from '@km/tui/test'

const board = createTestBoard(["Col > Task A", "Col > Task B", "Col > Task C"])

board.press("j").press("j")
expect(board.cursor.card).toBe(2)

check.all(board)  // Verify nothing broke
```

## The API

```typescript
// Load real vault (PREFERRED when path mentioned)
const board = await loadTestBoard("/path/to/vault")

// Create with string DSL (for quick synthetic tests)
const board = createTestBoard(["Inbox > Task 1", "Projects > Alpha"])

// Actions (chainable)
board.press("j").press("k").press("l")
board.search("query")  // Opens search, types, hits Enter

// State
board.text       // Screen text
board.cursor     // { col: 0, card: 1, level: 'card' }
board.nodeId     // Selected node ID
board.columns()  // Column info with titles
board.cards()    // Card info with text

// Checks
check.rendering(board)   // No errors in screen
check.cursor(board)      // Cursor exists
check.all(board)         // Everything (synthetic repos only)
```

## Available Checks

```typescript
check.rendering(board)    // Screen not empty, no [object Object], no errors
check.cursor(board)       // Cursor exists (unless in dialog)
check.selection(board)    // Selected node exists in repo
check.parentLinks(board)  // All parent references valid (synthetic only)
check.nodeLinks(board)    // All link_to references valid (synthetic only)
check.all(board)          // All of the above (synthetic only)
```

## Debugging Tips

| Symptom | Check |
|---------|-------|
| Screen garbled | `check.rendering(board)` |
| Cursor disappears | `check.cursor(board)` |
| Wrong node selected | `expect(board.nodeId).toBe("expected-id")` |
| Column missing | `expect(board.columns().map(c => c.title)).toContain("name")` |

## Layout Bugs (Wrong Dimensions, Text Overflow, Card Sizing)

If the bug is about **wrong sizes or positions** (not wrong pixels), it may be a **Flexily layout caching bug** rather than a silvery rendering bug. Layout bugs manifest as incorrect `width`/`height` computations during re-layout of partially-dirty trees.

**Quick check**: Does the bug only appear after navigation (re-layout), not on initial render? → Likely a layout caching bug.

```bash
# Run the Flexily re-layout fuzz suite (1100+ tests, differential oracle)
bun vitest run vendor/flexily/tests/relayout-consistency.test.ts

# If all pass, the caching logic is correct for known patterns.
# Create a targeted test mirroring the real component structure.
```

**Bug taxonomy** (3 classes found so far):
1. **Measurement side effects** — `measureNode` overwriting layout on clean nodes
2. **Sentinel collisions** — NaN used as both "invalidated" and "unconstrained"
3. **Fingerprint incompleteness** — parent override not captured in cache key

See `vendor/flexily/docs/incremental-layout-bugs.md` for full details, industry context, and debugging methodology.

## See Also

- [explore/random.md](../explore/random.md) — Fuzz testing
- `docs/lessons/layout-caching.md` — Layout caching bugs lesson
- `vendor/flexily/docs/testing.md` — Flexily test infrastructure

## TUI Test Accuracy

TUI tests check DOM content and computed colors (Phase 3), but bugs often live in Phase 4 (ANSI diff) and Phase 5 (terminal rendering). Two mechanisms make tests catch what users see:

- `withDiagnostics(..., { checkReplay: true })` — replays ANSI output through a virtual terminal and compares to buffer. Catches diff algorithm bugs.
- `SILVERY_STRICT=1` / `checkIncremental: true` — runs BOTH incremental and fresh renders, compares cell-by-cell. Catches stale-pixel bugs.

### Guidelines for Visual Bug Tests

1. **Enable `checkReplay` on all visual bug regression tests** — add `withDiagnostics(driver, { checkReplay: true })` to any test for a rendering/visual bug. This catches ANSI diff algorithm bugs that buffer inspection alone misses.

2. **Enable `checkIncremental` on navigation/fold/scroll tests** — catches stale pixels where incremental render diverges from fresh render.

3. **Test with realistic data, not minimal fixtures** — use 5+ columns, long content, mixed node types. Minimal 2-column fixtures miss real-world layout bugs.

4. **Test exhaustive sequences, not single operations** — bugs like col-shift only appear after 7+ consecutive shifts. Add loop/stress variants for operations that accumulate state (shift, scroll, fold sequences).

5. **Verify edit mode component lifecycle** — for edit/input bugs, assert that the input component is mounted and focused, not just that final rendered text is correct.

6. **Check adjacent element integrity** — fold-border-blank was about the card *below* the folded card losing its border. Tests should verify neighboring elements after mutations, not just the mutated element.

7. **Prefer layout invariants over fixed-height checks** — When validating inline editing, use content-driven sizing invariants (e.g., "height >= line count", "width fills column") rather than hard-coded expected heights. Fixed heights drift when content, prefixes, or wrapping rules change. The HR editing flow broke because tests asserted exact pixel heights instead of structural invariants.

8. **Use border-based focus cues** — Isolate focus cues as borders (cyan) rather than broad background color changes. This reduces UI noise and improves accessibility during editing workflows.

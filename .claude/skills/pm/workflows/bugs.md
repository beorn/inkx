---
description: Bug fix workflow - reproduce, test, fix minimally
---

# Bug Implementation Workflow

Test-driven bug fixes following TDD principles.

## Common TDD Cycle

All bug fixes follow this pattern:

```
Write/verify test
  ↓
Implement incrementally
  ↓
bun run test:fast → GREEN
  ↓
Refine if needed
  ↓
Close bead with evidence
```

**Core commands:**

```bash
bun run test:fast    # Quick iteration (~8s)
bun fix              # Lint + format
bd close <id> --reason "<evidence>"
```

---

## Step 1: Verify Reproduction

Check if steps are clear:

- What happened? (actual behavior)
- What should happen? (expected)
- How to reproduce? (concrete steps)

**If unclear:**

```bash
bd update <id> --notes "Need reproduction steps. Attempted: <what you tried>"
```

Ask user: "Can you provide steps to reproduce? I need to see the bug before fixing."

## Step 1.5: Search History

**Before writing code, search for prior context:**

```bash
bun recall "keywords from bug description"
bun recall --raw "affected module or function"
```

Prior sessions may have:
- Already diagnosed this exact bug
- Documented root causes or attempted fixes
- Recorded architectural decisions that explain the behavior
- Noted known limitations or tech debt in the area

Skip only if recall auto-context (hook) already surfaced relevant results.

## Step 2: Reproduce the Bug

**CRITICAL: Must see bug before fixing.**

**IMPORTANT: When a bug is reproducible with live data, STICK WITH IT until fixed.**
Live data may change, files may be deleted, or conditions may shift such that the bug
is no longer reproducible. If you can reproduce a bug now, prioritize fixing it
immediately rather than deferring. Create a test that captures the reproduction
conditions if possible.

**For TUI bugs** - headless capture:

```bash
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault <file> &
sleep 3
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:7681 /tmp/bug-before.png
```

**For logic bugs** - failing test:

```typescript
test("reproduces <bug>", () => {
  const result = buggyFunction()
  expect(result).toBe(expected) // Will fail
})
```

**If can't reproduce:**

```bash
bd update <id> --notes "Cannot reproduce. Tried: <steps>. Need more info."
```

Report to user. DO NOT guess at fixes.

## Step 3: Write Failing Test (MANDATORY — test-first)

**CRITICAL: The test must fail BEFORE you write any fix code.** This confirms:
1. You understand the bug (you can reproduce it)
2. You'll know when it's fixed (the test passes)
3. It won't regress (the test stays in the suite)

**Classify the bug** to choose the right test type:

| Bug Type | Test Approach | Example |
|----------|--------------|---------|
| **State bug** (wrong cursor, missing node, bad logic) | DOM assertions: `board.expect("#id").toExist()` | Cursor lands on wrong card |
| **Visual bug** (wrong color, missing border, bad layout) | Visual assertions: `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` | Selected card text is wrong color |
| **Mixed** (state + visual symptoms) | Both: DOM + visual assertions | Card exists but border is missing |

### State test example

```typescript
test("reproduces <bug>", () => {
  const { board } = testEnv(() => item("board", item("col", item("task"))))
  board.press("j")
  board.expect("#task[data-cursor]").toExist()  // State assertion
})
```

### Visual test example (prefer for rendering bugs)

```typescript
test("selected card renders black-on-yellow", () => {
  const { board } = testEnv(() => item("board", item("col", item("task"))))
  // Visual assertion — checks actual rendered colors
  board.expectNodeColor("task", { fg: 0, bg: 3 })  // 0=black, 3=yellow
})

test("HR renders as line without border", () => {
  const { board } = testEnv(() => item("board", item("col", item.hr())))
  const hrRow = board.screen.findRow("─")
  expect(hrRow).toBeGreaterThan(-1)
  board.expectRow(hrRow, "─")
})

test("card has left/right borders", () => {
  const { board } = testEnv(() => item("board", item("col", item("task"))))
  board.expectNodeBorder("task")  // Checks │ on left/right edges
})
```

### Visual toolbelt API (apps/km-tui/tests/helpers/board-test.ts)

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

Run `bun run test:fast` - verify the test fails for the right reason.

## Step 4: Implement Minimal Fix

Fix ONLY what's broken:

- No refactoring (unless root cause)
- No "while I'm here" improvements
- Change minimum lines

Document if non-obvious:

```typescript
// Fix: Race condition when file deleted during scan
```

## Step 5: Verify & Close

**Mandatory before closing any bug bead:**

```bash
bun run test:fast    # MUST pass — no new failures
bun fix              # MUST pass — lint + format clean
```

**The failing test from Step 3 MUST now pass.** This is non-negotiable — if you can't
make the test pass, the bug isn't fixed.

**For visual bugs** — also verify with TTY if the visual toolbelt can't fully capture
the issue (e.g., layout alignment across many columns, animation, scroll behavior):

```bash
# TTY verification (when headless visual assertions aren't sufficient)
# Use /explore --gui or mcp_tty tools for screenshot comparison
```

<a name="close-reason-template"></a>

**Close with structured reason (mandatory format):**

```bash
bd close <id> --reason "Fixed: <what changed, file:line>
Test: <test file and test name>
Verified: <how — headless/TTY/both, what was checked>"
```

Example:

```bash
bd close km-tui.xyz --reason "Fixed: CardColumn.tsx:42 — guard against empty children array
Test: apps/km-tui/tests/card-column.test.tsx 'handles empty children'
Verified: headless visual — expectNodeBorder('card1') passes, no blank cards"
```

**Do NOT close a bead without:**
1. A **failing test written BEFORE** the fix (test-first is mandatory)
2. The test now **passes** after the fix
3. `bun run test:fast` passing (run it, don't assume)
4. A verification method stated in the close reason
5. The structured Fixed/Test/Verified format

For non-trivial bugs, report to user first and wait for confirmation.

## Step 6: Root Cause Analysis

**After fixing, ask: why did this happen and why didn't tests catch it?**

Analyze and document (in the bead close reason or notes):

1. **Root cause**: What was the actual underlying cause? (not just "the code was wrong")
2. **Detection gap**: Why didn't existing tests catch this?
   - Is there a missing test layer? (unit vs integration vs e2e)
   - Do test doubles diverge from production code paths?
   - Is a production entry point untested?
3. **Prevention**: What structural change would prevent this class of bug?
   - New test that exercises the production path
   - Type-level constraint that makes the invalid state unrepresentable
   - Architectural change that eliminates the failure mode
   - Skill/doc update to catch it in code review

**Create a bead** for any non-trivial prevention suggestion (P3 or higher).

Example close reason:
"Fixed: tui.tsx missing StoreContext.Provider. Root cause: L3 migration updated
Board.tsx + driver.ts but not tui.tsx. Tests missed it because all TUI tests use
createBoardDriver() which bypasses tui.tsx. Prevention: added smoke test for
runBoard() (bead km-infra.xyz)."

---

## Performance Bug Workflow

For non-trivial performance issues, use **TDD with benchmarks**:

### Step 1: Create Benchmark First

Before optimizing, create a benchmark that exercises the problem area:

```typescript
// bench/problem-area.bench.ts
import { bench, describe } from "vitest"

describe("Performance Issue: <description>", () => {
  bench("baseline - current behavior", () => {
    // Exercise the slow code path
    slowFunction(realWorldInput)
  })
})
```

Run to establish baseline:
```bash
bun run bench
```

### Step 2: Profile to Find Root Cause

Add timing/counting to identify the bottleneck:

```typescript
const t0 = Date.now()
expensiveOperation()
debug("operation: %dms", Date.now() - t0)
```

Common culprits:
- O(n²) loops (nested iteration over same data)
- Excessive allocations (creating objects in hot paths)
- Missing caching (recomputing same values)
- Unnecessary work (recalculating when nothing changed)

### Step 3: Fix and Verify

After fixing, run benchmark again to verify improvement:

```bash
bun run bench
# Compare: before vs after
```

### Step 4: Document in Bead

```bash
bd close <id> --reason "Fixed: <root cause>. Before: Xms, After: Yms (Z% improvement)"
```

---

## Bug Priority Guide

| Priority | When                       | Response                   |
| -------- | -------------------------- | -------------------------- |
| P0       | Data loss, crash, security | Drop everything            |
| P1       | Blocks core workflow       | Fix before session ends    |
| P2       | Annoying but workaround    | Track, fix soon (DEFAULT)  |
| P3       | Minor annoyance            | Track, fix when convenient |

**Signals in description:**

- P0: "can't use", "crashes", "lost data", "security"
- P1: "blocks", "prevents", "can't work"
- P2: "annoying", "workaround" (default)
- P3: "minor", "polish", "nice to have"
- **perf**: "slow", "lag", "takes Xms" → use Performance Bug Workflow

---

## Error Recovery

| Scenario                | Action                               |
| ----------------------- | ------------------------------------ |
| Can't reproduce bug     | Update bead, ask user, STOP          |
| Tests keep failing      | Revert to last green, re-plan        |
| Scope expands           | Create separate beads for extra      |
| Bug affects 3+ packages | Create beads per package, use `/max` |

---

## Anti-Patterns

- ❌ Guessing at fixes without reproducing bugs
- ❌ Writing the fix before writing a failing test (test-first is mandatory)
- ❌ Only using state assertions for visual bugs (use visual toolbelt)
- ❌ Closing bead because "tests pass" without a test that specifically targets the bug
- ❌ Closing bead before tests pass
- ❌ Refactoring unrelated code "while I'm here"
- ❌ Forgetting to create/update bead
- ❌ Fixing symptom without understanding root cause
- ❌ Closing bug without analyzing why tests didn't catch it

---

## Quality Checklist

**Before closing:**

- [ ] Bug reproduced (test or screenshot)
- [ ] Failing test written BEFORE fix (test-first)
- [ ] Visual test used for visual bugs (`expectNodeColor`, `expectRow`, `expectCellColor`, etc.)
- [ ] Fix implements minimal change
- [ ] The specific failing test now passes
- [ ] `bun run test:fast` passes (no regressions)
- [ ] `bun fix` passes
- [ ] TTY visual verification (for bugs that can't be fully captured by visual toolbelt)
- [ ] Recall searched for prior context
- [ ] Root cause identified (not just symptom)
- [ ] Detection gap analyzed (why tests missed it)
- [ ] Prevention bead created (if non-trivial)
- [ ] Evidence in close reason (Fixed/Test/Verified format)

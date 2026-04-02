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

**Root cause analysis in the bead is a hypothesis, not a diagnosis**, unless it was confirmed by reproducing with real data. Mark unverified analyses as "Hypothesis:" in the description. See [docs/lessons/reproduce-first.md](../../../../docs/lessons/reproduce-first.md).

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

**For TUI bugs** - TUI test capture:

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

**Where to put the test:** Always add to an existing thematic test file that matches the bug's domain (e.g., fold bug → `fold.test.ts`, scroll bug → `scroll.test.ts`). See [test-first-protocol.md](../../tests/test-first-protocol.md#where-to-put-regression-tests) for the full domain→file mapping. Never create a per-bug test file.

Follow the [test-first protocol](../../tests/test-first-protocol.md). The test **must fail before** you write any fix code.

**Classify the bug** to choose the right test type:

| Bug Type | Test Approach | Example |
|----------|--------------|---------|
| **State bug** (wrong cursor, missing node, bad logic) | DOM assertions: `board.expect("#id").toExist()` | Cursor lands on wrong card |
| **Rendering bug** (wrong color, missing border, bad layout) | Buffer assertions: `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` | Selected card text is wrong color |
| **Mixed** (state + rendering symptoms) | Both: DOM + buffer assertions | Card exists but border is missing |

### State test example

```typescript
test("reproduces <bug>", () => {
  const { board } = testEnv(() => item("board", item("col", item("task"))))
  board.press("j")
  board.expect("#task[data-cursor]").toExist()  // State assertion
})
```

### Buffer assertion example (prefer for rendering bugs)

```typescript
test("selected card renders black-on-yellow", () => {
  const { board } = testEnv(() => item("board", item("col", item("task"))))
  // Buffer assertion — checks render buffer colors
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

### Buffer assertion API

**You MUST use** the [buffer assertion API](../../tests/tui.md#buffer-assertions) for rendering bugs — read that section for the full method list and color codes. State assertions (`toExist()`) miss rendering issues.

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

<a name="tty-verification"></a>

### Three-Layer Verification (MANDATORY for visual/rendering bugs)

Any bug affecting what the user sees on screen requires **three-layer verification**. Pure logic bugs need TUI tests only. **You MUST follow** the [three-layer verification protocol](../../tui/fix.md#three-layer-verification) — read it for the full procedure.

```
Fixer confirms fixed (TUI tests pass)
  → AI confirms fixed (GUI/TTY screenshot)
    → User confirms fixed (visual check)
      → Bead closed
```

The bead is **NOT closed** until the user confirms. Mark as "awaiting user confirmation" after AI verification.

<a name="close-reason-template"></a>

**Close with structured reason (mandatory format):**

```bash
bd close <id> --reason "Fixed: <what changed, file:line>
Test: <test file and test name>
Verified: TUI test + GUI/TTY screenshot + user confirmed"
```

Example (visual bug — all three layers):

```bash
bd close km-tui.xyz --reason "Fixed: CardColumn.tsx:42 — guard against empty children array
Test: apps/km-tui/tests/card-column.test.tsx 'handles empty children'
Verified: TUI test (expectNodeBorder passes) + GUI/TTY screenshot (/tmp/verify-km-tui.xyz.png) + user confirmed"
```

Example (logic bug — no GUI/TTY or user confirmation needed):

```bash
bd close km-tui.abc --reason "Fixed: state.ts:128 — reset stickyX on OOB
Test: apps/km-tui/tests/keyboard-navigation.test.tsx 'stickyX resets on boundary'
Verified: TUI tests only — pure state bug, no visual component"
```

**IMPORTANT**: The close reason is the permanent record of what verification was done.
Future sessions check this to know if all three layers were completed. If a bead was closed
without user confirmation but should have had it, re-open and verify.

**Do NOT close a visual bead without:**
1. A **failing test written BEFORE** the fix (test-first is mandatory)
2. The test now **passes** after the fix
3. `bun run test:fast` passing (run it, don't assume)
4. **GUI/TTY visual verification** — AI screenshot proves fix looks correct
5. **User confirmation** — user visually verified the fix
6. A verification method stated in the close reason
7. The structured Fixed/Test/Verified format

### Hard Gate: Visual Bug Closure Requires All Three Layers

```
HARD GATE: A visual bug bead CANNOT be closed (bd close) unless the
close reason contains ALL THREE:
1. Test file path (Layer 1)
2. GUI/TTY screenshot path (Layer 2)
3. "user confirmed" (Layer 3)

If any layer is missing, use:
  bd update <id> --append-notes "Awaiting <layer>"
Do NOT call bd close.

Anti-pattern: "Awaiting user confirmation" in the close reason of a
CLOSED bead. "Awaiting" = not done = not closable.
```

### When the User Says "Not Fixed"

If the user rejects a fix, **You MUST follow** the [rejection protocol](../../tui/fix.md#when-the-user-says-not-fixed) — distinguish process failure from iterative refinement, and run a retrospective if it's a process failure.

### Session Linking

If this bug was found during a tracked session (session bead exists):

```bash
# Log to session bead
bd update <session-id> --append-notes "HH:MM — Fixed <bug-id>: <summary>. Verified: TUI test + GUI/TTY"

# Include session reference in bug close reason
bd close <bug-id> --reason "Fixed: ... Session: <session-id>"
```

## Step 6: Integrate User Feedback

Throughout the bug lifecycle, the user may give feedback. **You MUST follow** the [user feedback protocol](../beads.md#user-feedback) — log feedback verbatim in notes, rewrite the bead description to reflect current understanding, and ask immediately if unclear.

## Step 7: Root Cause Analysis

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
- ❌ Only using state assertions for rendering bugs (use buffer assertions)
- ❌ Closing a visual/rendering bug without all three verification layers (TUI test + GUI/TTY + user)
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
- [ ] Buffer assertions used for rendering bugs (`expectNodeColor`, `expectRow`, `expectCellColor`, etc.)
- [ ] Fix implements minimal change
- [ ] The specific failing test now passes
- [ ] `bun run test:fast` passes (no regressions)
- [ ] `bun fix` passes
- [ ] **GUI/TTY visual verification for rendering/visual bugs** (AI screenshot proves it looks right)
- [ ] **User confirmed fixed** for rendering/visual bugs (user visually verified)
- [ ] Recall searched for prior context
- [ ] Root cause identified (not just symptom)
- [ ] Detection gap analyzed (why tests missed it)
- [ ] Prevention bead created (if non-trivial)
- [ ] No console.log left
- [ ] Evidence in close reason (Fixed/Test/Verified format, must state TUI-tests-only OR TUI-test+GUI/TTY+user)

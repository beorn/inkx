---
description: Systematic troubleshooting for bugs, crashes, errors, and regressions. Reproduce, instrument, bisect, escalate. Use when something is broken and you need a structured debugging protocol.
argument-hint: [symptom description]
benefits-from: [recall, tests, pm]
escalate-to: {render: "silvery pipeline or output phase bug", arch: "layer boundary violation or invariant gap", km: "selection, undo, or command dispatch issue"}
---

# Troubleshoot

**Keywords**: debug, troubleshoot, diagnose, regression, broken, fix, bisect, reproduce, crash, fail, error, exception, not working, bug

**Symptom**: $ARGUMENTS

## Protocol (strict order)

### Step 1: Reproduce as a Test (ALWAYS!)

**Before ANY theorizing**, write a failing test that demonstrates the bug. No exceptions.

```bash
# For rendering bugs
withDiagnostics(createBoardDriver(...), { checkIncremental: true, checkReplay: true })

# For pipeline bugs
SILVERY_STRICT=1 bun vitest run <test-file>

# For behavior bugs
test("repro: <symptom>", async () => {
  // Minimal setup that triggers the bug
  // Assert expected vs actual
})
```

**If you can't reproduce in a test**, that's diagnostic information. Ask:
- Does it only happen in production (createApp) vs tests (createRenderer)?
- Does it need real data (vault) vs synthetic fixtures?
- Is it timing-dependent (async, event ordering)?
- Does it need terminal interaction (stdin/stdout)?

**Reproduction layers** (try in order, stop when it reproduces):

| Layer | Tool | Speed | Best for |
|-------|------|-------|----------|
| TUI test | `createDriverTest()` / `board.press()` | ~1000/s | Logic, state, incremental rendering |
| TTY headless | `mcp__tty__start` + `mcp__tty__press` + `mcp__tty__screenshot` | ~1/s | Visual rendering, ANSI output, createApp-specific bugs |
| GUI (Ghostty) | Peekaboo MCP / user terminal | Manual | Terminal-specific rendering, font issues |

**TTY headless** is the key tool when TUI tests pass but the app is visually broken.
It uses a real xterm emulator with createApp, so it catches output-phase bugs,
ANSI diff errors, and scroll state corruption that createRenderer tests miss.

```bash
# TTY reproduction pattern
mcp__tty__start(command=["bun", "km", "view", ...], waitFor="stable")
mcp__tty__press(key="l")  # navigate
mcp__tty__screenshot(outputPath="/tmp/repro.png")  # capture evidence (canonical TTY verification)
```

Write the test to `/tmp/` first, promote to `apps/km-tui/tests/` when stable.

### Step 2: Instrument — Don't Guess, Trace

**Never hypothesize without data.** Use the instrumentation that exists:

For rendering bugs, see **[debugging.md](vendor/silvery/docs/guide/debugging.md)** — canonical reference for STRICT modes, what each catches/misses, and diagnostic workflow.

| Bug type | Instrumentation | What it shows |
|----------|----------------|---------------|
| Rendering | `SILVERY_STRICT=1` (always on in tests) | Exact cell mismatch, node trace, cascade decisions |
| Performance | `SILVERY_INSTRUMENT=1` | Skip/render counts, cascade depth, scroll tier |
| Behavior (state) | `DEBUG=<namespace> DEBUG_LOG=/tmp/debug.log` | Runtime traces |
| Event loop blocks | Built-in block detection | Timing + stack |

**Read the instrumentation output BEFORE reading code.** 5 minutes of tracing beats 1 hour of code reading.

For pipeline bugs, read the mismatch output carefully — it includes:
- Exact cell values (incremental vs fresh)
- Node trace with cascade decisions (hasPrev, ancestorCleared, flags)
- Render phase stats (nodes visited/rendered/skipped)
- Scroll container diagnostics

### Step 3: If It Worked Before — Find What Changed

**Use git bisect.** This is the fastest path to root cause for regressions.

```bash
# Create a worktree (don't mess up working tree)
bun worktree create bisect-<name>
cd <worktree>

# For submodule bisect (e.g., silvery)
cd vendor/silvery
git bisect start
git bisect bad HEAD
git bisect good <known-good-commit>

# Automated bisect with test script
git bisect run <test-script.sh>

# Clean up
cd /path/to/km
bun worktree remove bisect-<name>
```

**Test script requirements for bisect:**
- Exit 0 = good (no bug)
- Exit 1 = bad (bug present)
- Exit 125 = skip (can't test this commit)
- Must be self-contained (install deps, compile if needed)
- Must be deterministic (same result every run)

**Finding good/bad commits:**
```bash
git log --oneline -30          # Recent history
git log --oneline -- <file>    # History of specific file
```

**If it's a single commit with multiple changes** (like Phase 1/2/3 in one commit):
- Don't bisect (only 1 commit)
- Instead: selectively revert each phase and test
- Cherry-pick approach: revert Phase 1 only → test. Restore. Revert Phase 2 only → test.

### Step 4: Narrow Down — Divide and Conquer

Once you have a reproduction and know what changed, narrow systematically:

**For rendering pipeline bugs:**
1. Is it the render phase cascade? (check `childrenNeedFreshRender`, `skipBgFill`, `childHasPrev`)
2. Is it dirty flag propagation? (check which flags are set/cleared when)
3. Is it the output phase? (compare buffer content vs ANSI output)
4. Is it scroll-specific? (check scroll tier selection, sticky children)

**For state bugs:**
1. Which state update triggers it? (add logging around setState/dispatch)
2. What's the state before vs after? (snapshot state at key points)
3. Is it a timing issue? (add timestamps, check event ordering)

**Isolation technique:** Simplify the reproduction until it's minimal:
- Remove components until it stops reproducing → last removed component is involved
- Reduce data (fewer nodes, simpler structure)
- Remove features (disable scroll, disable incremental, disable themes)

### Step 5: If Stuck — Escalate

After 20+ minutes on the same problem with 2+ failed approaches:

1. **`/fresh`** — Deep research for architectural advice. Include:
   - Full source files (not snippets)
   - Exact error output
   - All approaches tried and why they failed
   - Open discovery questions (not confirmation questions)

2. **Ask the user** — Describe what you've tried and what you don't understand

3. **Create a bead** — Log everything you know for the next session

## Anti-Patterns

| Don't | Why | Do Instead |
|-------|-----|------------|
| Read code first | Code reading without context is guessing | Instrument first, read code to explain what you saw |
| Theorize without a test | Theories are cheap and often wrong | Write the test — it either confirms or refutes |
| Skip bisect for regressions | "I think I know which commit" often wastes hours | Bisect takes 5 minutes and gives certainty |
| Fix without understanding | Blind fixes create new bugs | Understand the mechanism, then fix |
| Test one thing at a time manually | Slow and error-prone | Write an automated test script for bisect |
| Assume terminal bug | 99% of the time it's your code | `SILVERY_STRICT=1` proves it |
| Skip the worktree | Bisect in main worktree risks dirty state | Always use `bun worktree create` |

## Integration with Other Skills

| When | Use |
|------|-----|
| Found the bug, need to fix | `/tui fix` or direct implementation |
| Need architectural advice | `/fresh` |
| Performance regression | `/perf` |
| Need to track the issue | `/pm bug <description>` |
| Multiple approaches to test | `/max` for parallel investigation |

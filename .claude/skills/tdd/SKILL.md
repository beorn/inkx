---
description: "TDD mode — reproduce first, fix second. Use PROACTIVELY when the user reports a bug, requests a feature, or says 'fix'. Also use when you catch yourself reading source code before writing a test."
argument-hint: [bug or feature description]
---

# TDD — Reproduce First, Fix Second

**STOP.** Before you touch any source code, you need a failing test. No exceptions. No "quick fix." No "I think the problem is..." without proof.

This applies to **bugs AND features**. For bugs: reproduce the broken behavior. For features: write the test that describes the desired behavior. Both must fail before you write implementation code.

## The Task

$ARGUMENTS

**If no arguments**: Look at the recent conversation for bug reports, feature requests, or user-described issues. Check active beads (`bd list --status in_progress`). Infer what needs TDD from context — don't ask "what should I test?"

## Step 0: Context Before Code

Before writing anything:
1. **`bun recall "keywords"`** — has this been diagnosed before?
2. **Check screenshots** — if the user mentioned one, `ls -lt ~/Desktop/*.png | head -5` and read it
3. **Create/claim a bead** if one doesn't exist — `bd create --id km-tui.<slug> --type bug ...`

## Step 1: Pick the Right Reproduction Tool

**Real data first.** For bugs reported by users on their actual vault/data, the FIRST step is reproducing with their real file path — run the app, follow their steps, see the bug yourself. Synthetic test fixtures come later to codify the fix; they don't find the bug. Bead descriptions are hypotheses, not confirmed diagnoses. See [docs/lessons/reproduce-first.md](../../docs/lessons/reproduce-first.md).

Match the bug to the cheapest tool that can reproduce it:

| What the user described | Tool | Speed | When |
|---|---|---|---|
| "X doesn't work" (logic/state) | `testEnv()` + `board.press()` | ~1000/s | State bugs, navigation, commands |
| "I see X on screen" (visual) | **`createTermless()`** + `run()` | ~30ms | ANSI, colors, alt screen, cursor, modes |
| "It looks wrong" (rendering) | `withDiagnostics()` | ~100ms | Ghost pixels, stale regions, incremental bugs |
| "It works in tests but not the app" | TTY MCP (`mcp__tty__start`) | ~1/s | createApp-specific, output guard, protocol |
| "It only happens with my data" | `TEST_VAULT=<path>` real-vault test | ~1s | Large nodes, encoding, structure-dependent |
| "It only happens in Ghostty/Terminal.app" | Peekaboo MCP | Manual | Font rendering, terminal-specific |

**Visual/terminal bugs MUST use termless** — not testEnv. If the user described what they *saw*, you need a real terminal emulator. See the 3-layer verification pattern below.

**If testEnv passes but the bug is real** — escalate to termless, then TTY MCP. The bug is in the ANSI output path, not the state.

## Step 2: Write the Failing Test

Write it in `/tmp/` first. Keep it minimal — reproduce the exact user scenario.

### Pattern A: State bug (testEnv)
```typescript
// /tmp/repro-indent-edit.test.ts
import { item, testEnvWithRepo } from "apps/km-tui/tests/helpers/board-test.ts"

test("repro: Tab indents during inline edit", () => {
  const { board, repo } = testEnvWithRepo(() =>
    item("board", item("col", item("task1"), item("task2")))
  )
  board.navigateTo("task2")
  board.press("Enter") // enter edit mode
  board.press("Tab")   // should indent
  // Assert the expected outcome
  expect(repo.getNode("task2")?.parent_id).toBe(repo.getNode("task1")?.id)
})
```

### Pattern B: Visual/terminal bug (termless) — 3-layer verification
```typescript
// /tmp/repro-console-toggle.test.tsx
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "silvery/runtime"

test("repro: backtick toggles alt screen", async () => {
  using term = createTermless({ cols: 40, rows: 10 })
  const handle = await run(<App />, term)

  // Layer 1: Screen content (what the user sees)
  expect(term.screen).toContainText("BOARD VIEW")
  // Layer 2: Terminal state (what the terminal is doing)
  expect(term).toBeInMode("altScreen")
  // Layer 3: App state (internal consistency)
  expect(appState.mode).toBe("board")
})
```

### Pattern C: Rendering bug (diagnostics)
```typescript
// /tmp/repro-ghost-pixels.test.ts
import { createBoardDriver } from "@km/tui/driver.ts"
import { withDiagnostics } from "silvery"

const driver = withDiagnostics(createBoardDriver(repo, "board"), {
  checkIncremental: true, // incremental vs fresh mismatch
  checkReplay: true,      // ANSI replay produces same screen
  checkStability: true,   // cursor move doesn't shift content
})
```

### Pattern D: App-specific bug (TTY MCP)
```
mcp__tty__start(command: ["bun", "km", "view", "/path"])
mcp__tty__press(key: "j")
mcp__tty__screenshot()  // visual evidence
mcp__tty__text()        // terminal text for assertions
mcp__tty__stop()
```

## Step 3: Verify It Fails for the Right Reason

Run the test. It MUST fail. Read the failure message — does it demonstrate the actual bug?

- **Good**: `Expected "task1" to be parent of "task2"` — proves indent didn't work
- **Bad**: `Cannot read property 'id' of undefined` — setup is wrong, not the bug

If the test passes, either the bug doesn't reproduce at this layer (escalate to a higher tool) or your setup doesn't match the user's scenario.

### Can't Reproduce? Escalation Ladder

Don't give up after one tool. Walk up the stack:

1. **testEnv passes** → try `createTermless()` (ANSI bug, not state bug)
2. **termless passes** → try TTY MCP with real `createApp` path (output guard, protocol setup)
3. **TTY passes** → try `TEST_VAULT=<user's vault>` (data-dependent)
4. **All pass** → ask the user for exact steps, terminal, and OS version. Create bead as "unreproducible" with what you tried.

### For Features (not bugs)

Same discipline. Write the test that describes the desired behavior:

```typescript
test("Tab indents node during inline edit", () => {
  const { board, repo } = testEnvWithRepo(...)
  board.navigateTo("task2")
  board.press("Enter") // edit mode
  board.press("Tab")   // NEW: should indent while editing
  // This test FAILS because the feature doesn't exist yet
  expect(repo.getNode("task2")?.parent_id).toBe(/*...*/)
})
```

## Step 4: Fix It

Now — and only now — read the source code and implement the minimal fix.

## Step 5: Verify and Clean Up

```bash
bun vitest run /tmp/repro-*.test.ts  # Your repro passes
bun run test:fast                     # No regressions
```

### Test Placement (IMPORTANT)

**Never commit standalone repro files.** After the fix:

1. **Merge into the existing domain test file** — see the [domain mapping](tests/test-first-protocol.md#domain--file-mapping-km-tui)
2. **Remove the `/tmp/` file** — it served its purpose
3. **Combine with related tests** — if the domain file already tests similar scenarios, extend a journey test instead of adding a new one

| Domain | File |
|---|---|
| Indent/outdent | `indent-outdent.slow.test.ts` |
| Inline edit | `inline-edit.slow.spec.ts` |
| Delete/remove | merge into relevant domain |
| Fold/collapse | `fold.slow.test.ts` |
| Console/modes | silvery `run-writable.test.tsx` |
| Rendering | `card-rendering.slow.test.ts` |

### When to Use Termless vs testEnv (Decision Rule)

If the user describes what they **saw on screen** or the bug involves **terminal features** (alt screen, scrollback, cursor style, colors, escape sequences) → **termless**.

If they describe **behavior** (undo, navigation logic, command dispatch, data not saving) → **testEnv**.

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Read source code before writing a test | Write the test first — it focuses your reading |
| `expect(state.ui.showConsole).toBe(true)` for a visual bug | `expect(term.screen).toContainText(...)` |
| Create `repro-bug-123.test.ts` and commit it | Merge into existing domain test file |
| Fix the bug, then write a test that passes | The test must fail BEFORE the fix |
| Guess "I think the problem is in X" | `bun recall "keywords"` first, then test |
| Use `settle()` / `setTimeout` in tests | `await handle.press()` is synchronous enough |
| Skip reproduction because "it's obvious" | It's never obvious. Reproduce first. |

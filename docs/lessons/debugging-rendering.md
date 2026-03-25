# Lesson: Debugging Rendering Bugs

**Date**: 2026-02-05
**Bug**: km-silvery.1 (silvery) — ghost characters when re-rendering shorter content
**Outcome**: ~20 turns wasted on theorizing before using the right tools

## What Happened

Ghost characters appeared in the storybook and km view when switching between sections of
different widths. The investigation went like this:

1. Read source code (render-phase.ts, output-phase.ts) tracing code paths
2. Hand-rolled toy VirtualTerminal tests outside the real app
3. All tests passed — concluded "must be a Ghostty/terminal emulator bug"
4. Three different terminals showed the same issue — still blamed the terminal
5. Never used `withDiagnostics` with `createBoardDriver` (the actual app)

## What Should Have Happened

5 minutes with `withDiagnostics` + `createBoardDriver`:

```typescript
const driver = withDiagnostics(
  createBoardDriver(createFakeRepo({ nodes }), "board"),
  { checkIncremental: true, checkReplay: true, checkStability: true }
)
await driver.cmd.down()  // Automatically checks all invariants
```

Failing test → fix → done.

## Anti-Patterns Observed

### 1. Theorizing Before Testing

Reading render-phase.ts, output-phase.ts, tracing code paths — all wasted time
without a failing test to anchor the analysis. Code reading should come AFTER
you have a reproduction, not before.

### 2. Hand-Rolling Tests

Writing custom VirtualTerminal tests when `withDiagnostics` already does this
with `checkReplay`. The project has purpose-built diagnostic infrastructure —
use it.

### 3. Blaming Externalities

"Must be a Ghostty bug" when 3 terminals show the same issue — instead of
questioning whether the test was adequate. The tests were too simple (toy
components), not the actual app with its real rendering complexity.

### 4. Not Using the Best Available Tools

The project has `withDiagnostics`, `checkReplay`, `checkIncremental`,
`checkStability` — purpose-built for exactly this class of bug. The existing
`ghost-chars.test.tsx` hand-rolled everything instead of using them.

## Rules for Next Time

1. **Failing test first, always** — no code reading, no theorizing
2. **Use the project's diagnostic infrastructure** — it exists for a reason
3. **If diagnostics pass but bug is visible** — fix the diagnostics, don't blame terminals
4. **Never blame the terminal emulator without proof** — if 3 terminals show it, it's your code

## Cross-References

- `.claude/skills/tui/fix.md` — "Rendering Bugs" section
- `vendor/silvery/src/with-diagnostics.ts` — diagnostic plugin implementation
- `apps/km-tui/src/driver.ts` — `createBoardDriver` for real app testing

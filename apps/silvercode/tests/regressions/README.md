# silvercode regressions

**One file per user-reported visual bug.** Each file reproduces the bug
via a failing test, which becomes a passing test after the fix. Files
are organized by date + slug so the history is traceable.

## Rules

1. **Before fixing a user-reported rendering bug**:
   - Open a bead (scope: `km-silvercode`, tag: `silvercode-visual-regression`)
   - Add a test file here: `<YYYY-MM-DD>-<slug>.test.tsx`
   - The test should FAIL in current code (reproduces the bug)
2. **After fixing**: the test passes. Never delete it.
3. **If the test rots** (component moved, marker changed):
   - Don't delete — rework the test to re-catch the same bug class, OR
   - Replace with a more general invariant in `visual/_invariants.ts`
   - The regression test stays as historical documentation

## When a regression test should become an invariant

If the same bug class keeps coming back via different components, the
fix is wrong layer — build a universal invariant. Example: `●` on
AssistantBlock drifted, now `⚙` on ToolCallBlock is drifting too. That's
the icon-family alignment class. Invariant lives in `_invariants.ts`.

A regression file is for the SPECIFIC shape: the exact component, the
exact user report, the exact break. An invariant generalizes.

## Rule-of-three

After three regressions in the same class, promote the detector to
`visual/_invariants.ts` and add a mutation test in `mutations.test.tsx`
that proves the new invariant actually catches the class.

## Coverage matrix reference

See `apps/silvercode/docs/test-system-design.md` for the full coverage
matrix — which bug classes are v1-covered and which are v2 backlog.

---
description: Handle user bug reports with proper reproduction, tracking, and verification
---

# Skill: Bug Report Handling

When a user reports a bug, follow this workflow to ensure it's properly reproduced, tracked, and verified fixed.

## Core Principles

1. **Never claim fixed without verification** - A bug is not fixed until you can prove it
2. **Reproduce first, fix second** - Don't guess at fixes; understand the problem first
3. **Track everything** - Create a bead so nothing gets lost
4. **User confirms closure** - For non-trivial bugs, the user decides when it's done

## Workflow

### 1. Acknowledge and Create Bead

Immediately create a bead to track the bug:

```bash
bd create --title="Bug: <concise description>" --type=bug --priority=2
```

This ensures the bug isn't lost if the session ends or context shifts.

### 2. Gather Information

Ask clarifying questions if needed:

- **What happened?** (actual behavior)
- **What should happen?** (expected behavior)
- **How to reproduce?** (steps, input data, commands)
- **When did it start?** (recent change? always broken?)
- **Environment?** (relevant for edge cases)

Don't skip this - vague reports lead to wasted effort.

### 3. Reproduce the Bug

**CRITICAL: You must see the bug before attempting to fix it.**

For TUI/visual bugs:

```bash
# Use headless capture - see visual-test.md skill
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault <file> &
sleep 3
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/bug-before.png
```

For logic bugs:

```bash
# Write a failing test that demonstrates the bug
bun run test:fast -- --grep "bug description"
```

**If you cannot reproduce:**

- Ask user for more details
- Ask user to show you (Peekaboo with permission)
- DO NOT attempt fixes based on guesses

Update the bead with reproduction steps:

```bash
bd update <id> --status in_progress
```

### 4. Write a Failing Test

Before fixing, write a test that fails due to the bug:

```typescript
test("should not crash when X happens", () => {
  // This test should FAIL before the fix
  const result = doThing(edgeCaseInput);
  expect(result).toBe(expectedValue);
});
```

This:

- Proves you understand the bug
- Prevents regression
- Provides objective verification

### 5. Implement the Fix

Now fix the bug. Keep changes minimal and focused.

### 6. Verify the Fix

**All verification steps must pass:**

```bash
# 1. The new test passes
bun run test:fast

# 2. All existing tests still pass
bun run test:all

# 3. Visual verification (for TUI bugs)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/bug-after.png
# Compare before/after screenshots
```

For visual bugs, show the user the before/after screenshots.

### 7. Close with Evidence

Only close the bead when you have evidence:

```bash
# Update bead with verification details
bd comment <id> "Fixed in commit <sha>. Test: <test name>. Before/after screenshots compared."
bd close <id>
```

For non-trivial bugs, ask user to confirm:

```
"I believe this is fixed. Can you verify on your end?"
```

## Bug Severity Guide

| Priority | When to Use                    | Response                           |
| -------- | ------------------------------ | ---------------------------------- |
| P0       | Data loss, crash, security     | Drop everything, fix now           |
| P1       | Blocks core workflow           | Fix before session ends            |
| P2       | Annoying but workaround exists | Fix soon, track in bead            |
| P3       | Minor annoyance                | Track in bead, fix when convenient |

## Anti-Patterns (NEVER DO)

❌ **"I think I fixed it"** - without running tests or visual verification
❌ **Closing bead before verification** - the fix might not work
❌ **Guessing at fixes** - without reproducing first
❌ **Forgetting to create bead** - bug gets lost when session ends
❌ **Marking done without user confirmation** - for bugs user reported

## Example Flow

```
User: "The selection highlight disappears when I scroll"

1. Create bead:
   bd create --title="Bug: Selection highlight disappears on scroll" --type=bug --priority=2

2. Ask: "Which view are you in? Can you describe the exact steps?"

3. Reproduce with ttyd + screenshot showing the issue

4. Write failing test:
   test("selection remains visible after scroll", ...)

5. Fix the bug

6. Verify:
   - Test passes
   - Screenshot shows selection visible after scroll
   - Show user before/after

7. User confirms → bd close <id>
```

## Session Ending with Open Bug

If you must end the session before fixing:

```bash
# Ensure bead exists with full context
bd comment <id> "Reproduction: <steps>. Root cause hypothesis: <theory>. Next steps: <what to try>"
bd sync
git push
```

The next session can pick up where you left off.

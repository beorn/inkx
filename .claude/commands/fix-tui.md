---
description: Debug and fix TUI rendering issues using inkx tests and visual inspection
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Fix TUI Visual Rendering Issues

Debug and fix TUI rendering issues through inkx tests and visual inspection.

**Issue**: $ARGUMENTS

**Reference**: `.claude/skills/visual-test.md` for testing patterns

## The Fix Loop

```
1. REPRODUCE → Write failing test in board.spec.ts OR use storybook
2. DIAGNOSE  → Identify the layer (text/layout/component)
3. FIX       → Update rendering code
4. VERIFY    → Run tests + visual check
5. COMMIT    → All tests pass
```

## Step 1: Reproduce

### Option A: Write a failing test (preferred)

```typescript
// apps/km-tui/tests/board.spec.ts
test("task text should not overflow", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item("very long task text here")))
  )
  const box = board.q("#col").boundingBox()
  // Assert text doesn't overflow column width
  expect(box!.width).toBeLessThanOrEqual(40)
})
```

Run: `bun test apps/km-tui/tests/board.spec.ts`

### Option B: Use storybook

```bash
bun storybook
```

### Option C: Capture screenshot (for debugging only)

```bash
# Get free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# Start TUI
rm -rf /tmp/test-repo && cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/test-repo
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-repo @next.md &
sleep 3

# Capture
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:$TTYD_PORT /tmp/tui.png
pkill -f ttyd
```

## Step 2: Diagnose

**Quick check**: If `bun storybook` shows the bug → rendering code issue.

| Symptom                 | Layer | Files to Check               |
| ----------------------- | ----- | ---------------------------- |
| Text not styled         | 1     | `src/text/rich.ts`           |
| Wrong status icon/color | 1     | `src/text/icons.ts`          |
| Text overlap            | 2     | `src/layout/truncate.ts`     |
| Selection not visible   | 3     | `src/views/TreeNode.tsx`     |
| View layout broken      | 3     | `src/views/*.tsx`            |

## Step 3: Fix

Edit the relevant files. Use storybook for rapid iteration.

## Step 4: Verify

```bash
bun test apps/km-tui/tests/board.spec.ts  # Your test passes
bun run test:fast                          # All tests pass
bun fix                                    # Lint + format
bun storybook                              # Visual check
```

## Commit Checklist

- [ ] `bun run test:all` passes
- [ ] `bun fix` passes
- [ ] Visual verification complete (storybook or screenshot)
- [ ] Added/updated test for the bug

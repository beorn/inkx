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
bun run test:fast    # Quick iteration (<5s)
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

## Step 2: Reproduce the Bug

**CRITICAL: Must see bug before fixing.**

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

## Step 3: Write Failing Test

```typescript
test("<bug description>", () => {
  // Minimal setup
  const result = buggyFunction()
  expect(result).toBe(expectedResult)
})
```

Run `bun run test:fast` - verify fails for right reason.

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

```bash
bun run test:fast  # Should pass
```

**For TUI bugs** - visual comparison:

```bash
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:7681 /tmp/bug-after.png

open /tmp/bug-before.png /tmp/bug-after.png
```

**Close:**

```bash
bd close <id> --reason "Fixed in <file>:<line>. Test: <test name> passes."
```

For non-trivial bugs, report to user first and wait for confirmation.

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
- ❌ Closing bead before tests pass
- ❌ Refactoring unrelated code "while I'm here"
- ❌ Forgetting to create/update bead

---

## Quality Checklist

**Before closing:**

- [ ] Bug reproduced (screenshot or test)
- [ ] Failing test written
- [ ] Fix implements minimal change
- [ ] Tests pass
- [ ] bun fix passes
- [ ] Visual verification (for TUI bugs)
- [ ] Evidence in close reason

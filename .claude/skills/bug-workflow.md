---
description: Handle bugs - user-reported or discovered during other work
---

# Bug Workflow

**Keywords**: bug, bug report, fix bug, discovered bug, pre-existing bug, reproduction, verify fix

Handle bugs whether reported by user or discovered during other work.

## Core Principles

1. **Track immediately** - Create bead so nothing gets lost
2. **Reproduce first** - Don't guess at fixes; understand the problem
3. **Verify with evidence** - Tests pass + visual confirmation for TUI bugs
4. **User confirms closure** - For non-trivial bugs, user decides when done

## Scenario A: User Reports Bug

### 1. Create Bead Immediately

```bash
bd create --title="Bug: <description>" --type=bug --priority=2
```

### 2. Gather Information

Ask if needed:

- What happened? (actual behavior)
- What should happen? (expected)
- How to reproduce? (steps)

### 3. Reproduce

**CRITICAL: You must see the bug before fixing.**

For TUI bugs - use headless capture (see visual-test.md):

```bash
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault <file> &
sleep 3
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/bug-before.png
```

For logic bugs - write failing test.

**If you cannot reproduce:** Ask user for more details. DO NOT guess at fixes.

### 4. Fix and Verify

1. Write failing test
2. Implement minimal fix
3. Run `bun run test:fast`
4. For TUI: capture after screenshot, compare
5. Run `bun run test:all`

### 5. Close with Evidence

```bash
bd close <id> --reason "Fixed in commit <sha>. Test: <test name>."
```

For non-trivial bugs: "I believe this is fixed. Can you verify?"

---

## Scenario B: Bug Discovered During Other Work

For pre-existing bugs that aren't your current focus.

### Option 1: Report Only (stay focused)

```bash
bd create --id km-<scope>.bug-<N>-<slug> --type=bug \
  --title="<description>" --priority=2
```

Continue with your main task.

### Option 2: Spawn Sub-Agent to Fix

```typescript
Task({
  description: "Fix issue: <brief>",
  prompt: `Report and fix this bug.

## Issue
<what's broken, where, repro steps>

## Instructions
1. bd create --type=bug --title="..." OR find existing
2. bd work <id>
3. Make minimal fix
4. Verify: bun run test:fast
5. bd close <id>`,
  subagent_type: "general-purpose",
  run_in_background: true,
})
```

### Option 3: Report as Blocked

If it depends on another bead:

```bash
bd create --id km-<scope>.bug-<N>-<slug> --type=bug \
  --title="<description>" --deps "blocks:<blocker-id>"
```

---

## Priority Guide

| Priority | When                           | Response                   |
| -------- | ------------------------------ | -------------------------- |
| P0       | Data loss, crash, security     | Drop everything            |
| P1       | Blocks core workflow           | Fix before session ends    |
| P2       | Annoying but workaround exists | Track, fix soon            |
| P3       | Minor annoyance                | Track, fix when convenient |

---

## Anti-Patterns

- "I think I fixed it" without verification
- Closing bead before tests pass
- Guessing at fixes without reproducing
- Forgetting to create bead

---

## Session Ending with Open Bug

```bash
bd update <id> --notes "Repro: <steps>. Hypothesis: <theory>. Next: <what to try>"
bd sync
git push
```

Next session picks up where you left off.

---
id: "@km/test-simplify/7-investigate-mdtest-speed-via-run-hook"
aliases:
  - km-test-simplify.7
  - km-test-simplify-7
  - "@km/test-simplify/7"
created_at: 2026-01-23T22:41:25Z
closed_at: 2026-01-26T18:11:13Z
---

# [x] Investigate mdtest speed via run() hook @km/test-simplify #task #P4 @beorn

## Goal
Speed up mdtest by avoiding subprocess spawning per command.

## Current Understanding (2026-01-24)

The mdtest framework currently spawns a new process for each `$` command. For CLI tests, this overhead dominates test time.

### What We Want
An **in-process main() hook** that allows calling km CLI functions directly without spawning a subprocess. This would enable tests like:

```markdown
$ km -h
Usage: km <command> [options]
...

$ km query /tmp/vault "status:open"
- [ ] Task 1
```

...to run in-process rather than spawning `bun km` each time.

### What We Don't Want
- The `cmd=` bash mode approach (still spawns processes, just reuses bash)
- Changing the test interface (tests should still look like shell commands)

### Key Insight
Tests like navigation.test.md (now sh.test.md) are really testing the `km sh` REPL interface, not general shell behavior. The mdtest speedup should focus on CLI surface testing.

### Next Steps (when revisiting)
1. Design in-process main() hook in @km/cli
2. Performance benchmark current vs proposed
3. Consider whether this is mdtest-level or @km/_orphan/cli-level change
4. Discuss tradeoffs with user before implementing

## Status
P4 - Deferred pending design discussion.
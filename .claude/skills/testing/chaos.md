---
description: Chaos testing for sync bugs
argument-hint: [quick | 1000 | 5m | --analyze-only <seed>]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Chaos Testing

**Keywords**: chaos, fuzz, sync, stress test, invariant, regression

Run chaos testing on km's filesystem sync to discover bugs.

## Quick Reference

```bash
bun run chaos:fuzz -n 100      # Quick check (~1s)
bun run chaos:fuzz -n 1000 -v  # Full run with verbose
bun ./scripts/chaos.ts report -s <seed>  # Analyze failure
bun ./scripts/chaos.ts reproduce -s <seed>  # Debug specific seed
```

## Modes

| Mode                    | Usage                    | Speed     |
| ----------------------- | ------------------------ | --------- |
| `quick` or empty        | 100 iterations           | ~1s       |
| `<N>` (number)          | N iterations             | ~1000/sec |
| `<N>m/s/h`              | Duration-based           | ~1000/sec |
| `--analyze-only <seed>` | Analyze existing failure | instant   |

## Workflow

### 1. Run Fuzzer

```bash
bun run chaos:fuzz -n <iterations> -v 2>&1 | tee /tmp/chaos-output.txt
```

Flags: `-p/--parallel` (default), `--sequential`, `-r/--real-fs` (slower)

### 2. Collect Failures

Group by invariant violated:

| Invariant        | Meaning                 |
| ---------------- | ----------------------- |
| noDuplicateNodes | Same node created twice |
| noOrphanedNodes  | Child without parent    |
| syncMismatch     | DB/FS out of sync       |
| missingParents   | Parent doesn't exist    |

Generate reports for one seed per invariant (max 5):

```bash
bun ./scripts/chaos.ts report -s <seed> -o /tmp/chaos-bug-<seed>.md
```

### 3. Analyze Root Cause

| Invariant      | Check First                   |
| -------------- | ----------------------------- |
| duplicateNodes | `reconcile.ts`                |
| orphanedNodes  | `reconcile.ts`, `emit.ts`     |
| syncMismatch   | `writequeue.ts`, `watcher.ts` |

### 4. Present & Create Beads

After user approval:

```bash
bd create --type=bug --priority=2 --title="Sync: <issue>"
bd update <id> --add-label "bug/sync"
```

### 5. Save Regression

```bash
bun ./scripts/chaos.ts save-regression -s <seed> -b <bead-id> \
  -d "Description of what went wrong"
```

Creates: `packages/km-storage/tests/sync/chaos/regressions/<bead-id>.md`

## Finding Chaos Bugs

```bash
bd list --label "bug/sync"          # All chaos bugs
bun test packages/km-storage/tests/sync/chaos/regression.test.ts  # Run regressions
```

## Anti-Patterns

- Creating multiple beads for same root cause
- Analyzing without reading actual code
- Creating beads without user approval
- Not grouping failures by invariant

**Full protocol**: See `docs/dev/chaos-testing.md` for detailed phases and templates.

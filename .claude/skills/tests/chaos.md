---
description: Chaos testing for sync bugs
argument-hint: [quick | seed]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Chaos Testing

**Keywords**: chaos, fuzz, sync, stress test, invariant, regression

Run chaos testing on km's filesystem sync to discover bugs.

## Quick Reference

```bash
# Run chaos fuzz tests
bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts

# Reproduce with specific seed
FUZZ_SEED=12345 bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts

# Run all chaos-related tests (includes roundtrip)
bun test packages/km-storage/tests/sync/chaos/
```

## Architecture

```
gen(fsEventPicker) → chaos transformers → take(n) → test loop + invariants
```

Uses vimonkey's `test.fuzz` with `gen()`/`take()` for auto-shrinking and regression.

### Stream Transformers

Composable async iterable transformers in `transformers.ts`:

| Transformer      | Scenario            | What It Simulates                  |
| ---------------- | ------------------- | ---------------------------------- |
| `drop`           | QUEUE_OVERFLOW      | Skip events with probability       |
| `reorder`        | REORDER_CHAOS       | Shuffle within sliding window      |
| `atomicSave`     | EDITOR_ATOMIC       | Expand change → unlink+add         |
| `duplicate`      | DUPLICATE_EVENTS    | Yield some events twice            |
| `coalesce`       | FSEVENTS_COALESCE   | Replace N file events with dir event |
| `burst`          | EVENT_STORM         | Collect then emit in rapid bursts  |
| `delay`          | SLOW_DISK           | Await before yield                 |
| `partialWrite`   | PARTIAL_WRITES      | Split change into multiple changes |
| `renameChain`    | RENAME_STORM        | Expand rename → chain of renames   |
| `rapidSuccession`| RAPID_SUCCESSION    | Identity passthrough               |
| `initGap`        | INIT_GAP            | Skip first N events               |

Compose with `chaos(source, configs, rng)` combinator.

## Workflow

### 1. Run Fuzzer

```bash
bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts
```

### 2. On Failure

vimonkey auto-saves failing sequences to `__fuzz_cases__/` for regression.
Shrinking finds minimal failing event sequence automatically.

### 3. Analyze Root Cause

| Invariant      | Check First                   |
| -------------- | ----------------------------- |
| duplicateNodes | `reconcile.ts`                |
| orphanedNodes  | `reconcile.ts`, `emit.ts`     |
| syncMismatch   | `writequeue.ts`, `watcher.ts` |

### 4. Create Bead

```bash
bd create --type=bug --priority=2 --title="Sync: <issue>"
bd update <id> --add-label "bug/sync"
```

## Key Files

| File | Purpose |
| ---- | ------- |
| `chaos-fuzz.fuzz.ts` | Fuzz tests using gen/take + transformers |
| `transformers.ts` | 11 chaos stream transformers + combinator |
| `event-picker.ts` | FS event picker for gen() |
| `verifier.ts` | Invariant checking |
| `fake-fs.ts` | In-memory mock filesystem |
| `roundtrip.test.ts` | Content round-trip preservation |

## Anti-Patterns

- Creating multiple beads for same root cause
- Analyzing without reading actual code
- Creating beads without user approval
- Not grouping failures by invariant

**Full protocol**: See `docs/dev/chaos-testing.md` for detailed phases and templates.

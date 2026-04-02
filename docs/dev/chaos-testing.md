# Chaos Testing for File Sync

Comprehensive guide for testing filesystem synchronization under chaotic conditions.

---

## Overview

The sync system (file watching, reconciliation, write queue) is notoriously hard to test:

- **FSEvents can coalesce** - macOS reports directory changes instead of file changes
- **Events can be dropped** - Queue overflow under load
- **Events arrive out of order** - Non-deterministic delivery
- **Race conditions emerge** - Files change during reconciliation
- **Editors use atomic writes** - Write to temp, rename over target

**Our approach:** Inject controlled chaos during testing to find edge cases before users do.

---

## Current Status

| Component              | Status      | Location                                 |
| ---------------------- | ----------- | ---------------------------------------- |
| `@beorn/watcher-chaos` | ✅ Complete | `vendor/watcher-chaos/`            |
| WatcherInterface DI    | ✅ Complete | `packages/km-storage/src/watch/types.ts` |
| createSync injection   | ✅ Complete | `config.watcher` option                  |
| 25+ chaos tests        | ✅ Passing  | `packages/km-storage/tests/sync/chaos/`  |
| 11 chaos scenarios     | ✅ Built-in | See table below                          |

---

## Architecture

```
gen(fsEventPicker) → chaos transformers → take(n) → reconcile loop → invariants
```

Uses vimonkey's `test.fuzz` with composable async iterable stream transformers.

```
┌─────────────────────────────────────────────────────────────────┐
│                     test.fuzz (vimonkey)                        │ │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ gen(picker)      │    ││ transformers   ││                   │
│  │ → FsEvent stream │────││ drop/reorder/..││                   │
│  └─────────────────┘     └─────────────────┘                    │
│                                   │                             │
│                            take(n) ─ auto-tracked               │
│                                   │                             │
│           ┌───────────────────────┼───────────────────────┐     │
│           │                       │                       │     │
│           ▼                       ▼                       ▼     │
│  ┌─────────────────┐     ┌─────────────────┐     ┌──────────┐   │
│  │ reconcile()     │     │ applyEventToFs  │     │ Database │   │
│  │ (scanner: DI)   │     │ (mock FS ops)   │     │ (SQLite) │   │
│  └────────┬────────┘     └────────┬────────┘     └──────────┘   │
│           │                       │                             │
│           ▼                       ▼                             │
│      FakeFileSystem          FakeFileSystem                     │
│      (in-memory)             (in-memory)                        │
│                                                                 │
│  On failure: auto-shrink → save to __fuzz_cases__/ → regression │
└───────────┴───────────────────────┴─────────────────────────────┘
```

**Key properties:**
- `take()` records events after all transformations for shrinking
- Replay yields from saved sequence directly — bypasses gen() and transformers
- Shrinking finds minimal failing event sequence via delta-debugging
- `FakeFileSystem` (in-memory) provides ~9x speedup vs real filesystem

---

## Chaos Scenarios

The `@beorn/watcher-chaos` package provides 11 built-in scenarios:

| Scenario            | What It Simulates                       | Real-World Cause                       |
| ------------------- | --------------------------------------- | -------------------------------------- |
| `SLOW_DISK`         | Events delayed 2-5 seconds              | Network drives, busy disks             |
| `QUEUE_OVERFLOW`    | 20% of events dropped randomly          | inotify overflow, FSEvents buffer full |
| `EDITOR_ATOMIC`     | Write becomes delete + add pair         | Vim, VSCode, Emacs save patterns       |
| `EVENT_STORM`       | Bursts of 100+ events                   | npm install, git checkout              |
| `REORDER_CHAOS`     | Events arrive out of order              | Non-deterministic delivery             |
| `PARTIAL_WRITES`    | Multiple change events for one write    | Large file writes, slow saves          |
| `RENAME_STORM`      | Rapid file renames in chains            | Refactoring tools, bulk rename         |
| `FSEVENTS_COALESCE` | Parent dir event instead of file events | macOS FSEvents hierarchical coalescing |
| `INIT_GAP`          | Changes during watcher init             | Files created between scan and ready   |
| `RAPID_SUCCESSION`  | Many edits in milliseconds              | Rapid typing with autosave             |
| `NO_CHAOS`          | Events pass through unchanged           | Baseline testing                       |

### Using Scenarios

```typescript
import { ChaosWatcher, queueOverflow, editorAtomic } from "@beorn/watcher-chaos"

// Use a single scenario
const watcher = new ChaosWatcher({
  scenario: queueOverflow(0.2), // 20% drop rate
  seed: 12345, // Reproducible randomness
})

// Combine multiple scenarios
const watcher = new ChaosWatcher({
  scenarios: [queueOverflow(0.1), editorAtomic(50)],
  seed: 12345,
})
```

### Factory Functions

| Function                           | Purpose                   | Parameters                   |
| ---------------------------------- | ------------------------- | ---------------------------- |
| `slowDisk(min, max)`               | Custom delay range        | `minDelayMs`, `maxDelayMs`   |
| `queueOverflow(rate)`              | Custom drop rate          | `dropRate` (0.0-1.0)         |
| `editorAtomic(delay)`              | Custom rename delay       | `renameDelayMs`              |
| `eventStorm(interval)`             | Custom burst interval     | `burstIntervalMs`            |
| `reorderChaos(window)`             | Custom reorder window     | `maxReorderWindow`           |
| `fseventsCoalesce(threshold)`      | Custom coalesce threshold | `coalesceThreshold`          |
| `rapidSuccession(edits, interval)` | Custom edit frequency     | `editsPerFile`, `intervalMs` |

---

## Running Chaos Tests

```bash
# Run chaos fuzz tests
bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts

# Run all chaos-related tests (includes roundtrip)
bun test packages/km-storage/tests/sync/chaos/

# Reproduce with specific seed
FUZZ_SEED=12345 bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts
```

### Test Locations

- `packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts` - Fuzz tests (9 tests using gen/take + transformers)
- `packages/km-storage/tests/sync/chaos/transformers.ts` - 11 chaos stream transformers + combinator
- `packages/km-storage/tests/sync/chaos/event-picker.ts` - FS event picker for gen()
- `packages/km-storage/tests/sync/chaos/verifier.ts` - Invariant checking
- `packages/km-storage/tests/sync/chaos/fake-fs.ts` - In-memory mock filesystem
- `packages/km-storage/tests/sync/chaos/roundtrip.test.ts` - Content round-trip preservation

---

## Writing Chaos Tests

### Basic Test Structure

```typescript
import { test, describe, expect, gen, take, createSeededRandom } from "vimonkey"
import { chaos, drop, reorder, type ChaosTransformerConfig } from "./transformers.ts"
import { createFixedSetPicker } from "./chaos-fuzz.fuzz.ts" // or create your own picker

test.fuzz("sync survives chaos", async () => {
  const rng = createSeededRandom()
  const files = ["notes/note1.md", "tasks/task1.md"]
  const env = setupChaosEnv(files.map(path => ({ path, content: "# Test" })))

  try {
    const base = gen(createFixedSetPicker(files))
    const chaotic = chaos(base, [
      { type: "queue_overflow", params: { dropRate: 0.2 } },
      { type: "reorder_chaos", params: { windowSize: 5 } },
    ], rng)

    for await (const event of take(chaotic, 100)) {
      applyEventToFs(env.mockFs, env.repoDir, event, rng)
      env.handleEvent(event)
    }

    checkInvariants(env.verifier)
  } finally {
    env.db.close()
  }
})
```

### Transformer Composition

Transformers are composable async generators:

```typescript
// Individual transformers
const dropped = drop(source, 0.2, rng)      // 20% event loss
const reordered = reorder(source, 5, rng)    // Shuffle within window of 5
const atomic = atomicSave(source, 0.5, rng)  // 50% of changes become unlink+add

// Combined via chaos() combinator
const chaotic = chaos(source, [
  { type: "queue_overflow", params: { dropRate: 0.1 } },
  { type: "editor_atomic", params: { rate: 0.3 } },
  { type: "reorder_chaos", params: { windowSize: 5 } },
], rng)
```

---

## The Improvement Loop

The chaos testing system is designed for iterative bug discovery and fixing:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHAOS FUZZING LOOP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ gen()    │───►│ chaos()  │───►│ take(n)  │───►│ verify   │   │
│  │ events   │    │ transform│    │ reconcile│    │invariants│   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │                                               │         │
│       │         PASS: continue fuzzing                │         │
│       │                                               ▼         │
│       │         ┌────────────────────────────────────────┐      │
│       │         │ FAIL: auto-shrink → __fuzz_cases__/    │      │
│       │         │ - Minimal event sequence               │      │
│       │         │ - Saved for automatic regression       │      │
│       │         │ - Invariant violated                   │      │
│       │         └────────────────────────────────────────┘      │
│       │                          │                              │
│       │                          ▼                              │
│       │         ┌────────────────────────────────────────┐      │
│       │         │ Analyze & Fix                          │      │
│       │         │ - Reproduce: FUZZ_SEED=<seed> bun test │      │
│       │         │ - Root cause analysis                  │      │
│       │         │ - Fix + regression auto-replayed       │      │
│       │         └────────────────────────────────────────┘      │
│       │                          │                              │
│       └──────────────────────────┘                              │
│              (continue fuzzing)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Using Claude for Bug Analysis

When a chaos test finds a bug:

```bash
# 1. Reproduce with the failing seed
FUZZ_SEED=12345 bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.fuzz.ts

# 2. The shrunk minimal sequence is in __fuzz_cases__/
# Share with Claude for analysis

# Claude will:
# - Identify root cause from minimal event sequence
# - Propose minimal code fix
# - Suggest new invariant if pattern is novel
# - Regression is auto-saved and replayed on next run
```

---

## Invariants

The sync system should maintain these properties under any chaos:

| Invariant             | Description                               |
| --------------------- | ----------------------------------------- |
| `noDataLoss`          | All FS files exist in DB after sync       |
| `noDuplicateNodes`    | No path appears twice in DB               |
| `noOrphanedNodes`     | All nodes have valid parent (or are root) |
| `fsMatchesDb`         | FS content equals DB content              |
| `dbMatchesFs`         | DB nodes correspond to FS files           |
| `treeIsConnected`     | Single root, no cycles in tree            |
| `pathsAreCanonical`   | No double slashes, trailing slashes, etc. |
| `eventualConsistency` | System converges after heartbeat          |

---

## Resilience Features

### Retry Logic with Exponential Backoff

The WriteQueue implements automatic retry for transient filesystem errors:

```typescript
// Configure retry behavior
const queue = new WriteQueue({
  debounceMs: 3000,
  retry: {
    maxRetries: 3, // Number of retry attempts
    baseDelayMs: 100, // Initial delay (doubles each retry)
    maxDelayMs: 5000, // Cap on delay
    jitterFactor: 0.1, // Random ±10% to avoid thundering herd
  },
})
```

**Error Classification:**

| Classification | Behavior           | Example Codes                                             |
| -------------- | ------------------ | --------------------------------------------------------- |
| Transient      | Retry with backoff | `EBUSY`, `EAGAIN`, `EMFILE`, `ENOSPC`, `EIO`, `ETIMEDOUT` |
| Permanent      | Fail immediately   | `ENOENT`, `EACCES`, `EPERM`, `EISDIR`, `EROFS`            |

**Backoff Schedule (default config):**

- Attempt 1: Immediate
- Attempt 2: ~100ms delay
- Attempt 3: ~200ms delay
- Attempt 4: ~400ms delay

**Testing retry behavior:**

```typescript
import { classifyError, calculateBackoffDelay } from "@km/storage"

// Verify error classification
const error = Object.assign(new Error("Busy"), { code: "EBUSY" })
expect(classifyError(error)).toBe("transient")

// Calculate backoff delay
const delay = calculateBackoffDelay(2, DEFAULT_RETRY_CONFIG)
expect(delay).toBeCloseTo(400, -2) // ~400ms for attempt 2
```

### Conflict Detection and Resolution

The WriteQueue detects conflicts when a file is modified externally between queueing a write and executing it. This prevents data loss from concurrent edits.

**How it works:**

1. When a write is queued, the file's current `mtime` is captured
2. Before writing, the current `mtime` is checked
3. If different, a conflict is detected
4. Resolution depends on the configured strategy

**Configuration:**

```typescript
const queue = new WriteQueue({
  debounceMs: 3000,
  conflictStrategy: "last_write_wins", // or "fs_wins" or "db_wins"
})
```

**Conflict Strategies:**

| Strategy          | Behavior                              | Use Case                               |
| ----------------- | ------------------------------------- | -------------------------------------- |
| `last_write_wins` | Always write, emit conflict event     | Default; TUI changes override external |
| `fs_wins`         | Discard pending write if file changed | Prefer external editor changes         |
| `db_wins`         | Write anyway, emit warning            | Prefer TUI changes, log conflicts      |

**Listening for conflicts:**

```typescript
const queue = new WriteQueue({ conflictStrategy: "fs_wins" })

queue.on("conflicts", (conflicts) => {
  for (const c of conflicts) {
    console.warn(
      `Conflict on ${c.path}: external edit detected ` +
        `(base=${c.baseMtime}, current=${c.currentMtime}), ` +
        `resolution=${c.resolution}`,
    )
  }
})

// The "flushed" event also includes conflict count
queue.on("flushed", ({ conflicts }) => {
  if (conflicts > 0) {
    console.log(`${conflicts} conflicts detected during flush`)
  }
})
```

**Conflict scenarios in chaos testing:**

```typescript
test("handles concurrent TUI and external edits", async () => {
  // Setup: file exists with mtime=1000
  mockFs.setMtime("/test.md", 1000)

  const queue = new WriteQueue({
    fs: mockFs,
    conflictStrategy: "fs_wins",
  })

  // TUI queues a write (captures baseMtime=1000)
  queue.queue({ path: "/test.md", content: "TUI edit" })

  // External editor modifies file (mtime changes to 2000)
  mockFs.setMtime("/test.md", 2000)

  await queue.forceFlush()

  // With fs_wins: external edit preserved, TUI edit discarded
  expect(mockFs.readFile("/test.md")).not.toBe("TUI edit")
})
```

### Permission Error Handling

The WriteQueue provides detailed permission error handling with actionable suggestions for users:

**Error Types:**

| Error Code | Type                    | User-Facing Suggestion                                       |
| ---------- | ----------------------- | ------------------------------------------------------------ |
| `EACCES`   | Permission denied       | Check file permissions, suggest `chmod u+rw`                 |
| `EPERM`    | Operation not permitted | File may be owned by another user or have special attributes |
| `EROFS`    | Read-only filesystem    | Filesystem is mounted read-only                              |

**Listening for permission errors:**

```typescript
const queue = new WriteQueue({ debounceMs: 3000 })

queue.on("permission-denied", (errors) => {
  for (const e of errors) {
    console.error(`Permission error on ${e.path}:`)
    console.error(`  Operation: ${e.operation}`)
    console.error(`  Code: ${e.code}`)
    console.error(`  Suggestion: ${e.suggestion}`)
  }
})
```

### Symlink Detection

Directory scanning skips symbolic links to avoid potential infinite loops and inconsistent behavior:

- **Circular symlinks** - Pointing to parent directories would cause infinite recursion
- **Duplicate content** - Symlink target may also be in the repo, causing duplicates
- **Confusing edits** - Changes to symlink target may not sync as expected

**Detecting symlinks for user notification:**

```typescript
import { scanSymlinks } from "@km/storage"

const symlinks = scanSymlinks("/path/to/repo", ignorePatterns, true)
if (symlinks.length > 0) {
  console.warn("Symlinks detected (will be skipped):")
  for (const s of symlinks) {
    console.warn(`  ${s.path} -> ${s.target}`)
  }
}
```

### Case Sensitivity Handling

Different filesystems handle case differently:

| Filesystem                | Case Behavior                          |
| ------------------------- | -------------------------------------- |
| Linux ext4                | Case-sensitive (`File.md` ≠ `file.md`) |
| macOS HFS+/APFS (default) | Case-insensitive, case-preserving      |
| Windows NTFS              | Case-insensitive, case-preserving      |

**Detecting filesystem case sensitivity:**

```typescript
import { detectCaseSensitivity, detectCaseCollisions } from "@km/storage"

// Test actual filesystem behavior (creates temp file)
const isCaseSensitive = detectCaseSensitivity("/path/to/repo")

// Find potential problems for case-insensitive systems
if (isCaseSensitive) {
  const collisions = detectCaseCollisions("/path/to/repo", true)
  if (collisions.length > 0) {
    console.warn("Case collisions found (would conflict on macOS/Windows):")
    for (const c of collisions) {
      console.warn(`  ${c.paths.join(" vs ")}`)
    }
  }
}
```

**Path normalization for comparison:**

```typescript
import { normalizePath } from "@km/storage"

const caseSensitive = detectCaseSensitivity(repoPath)
const normalizedPath = normalizePath(filePath, caseSensitive)
```

---

## Deterministic Timing with Fake Timers

For tests that involve timing-dependent behavior (debouncing, concurrent edits), we use `@sinonjs/fake-timers` to get deterministic control over time.

### Why Fake Timers?

Real-world timing issues:

- Chokidar's `awaitWriteFinish` uses internal `setInterval` polling
- OS filesystem events are asynchronous and non-deterministic
- Debounce timers create timing dependencies

With fake timers:

- Same test = same timing = reproducible results
- Tests run faster (no real waiting)
- Can test edge cases impossible with real timing

### Using Fake Timers

```typescript
import FakeTimers, { type InstalledClock } from "@sinonjs/fake-timers"

let clock: InstalledClock

beforeEach(() => {
  // Install BEFORE any code using setTimeout/setInterval
  clock = FakeTimers.install({
    toFake: [
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "Date",
    ],
    shouldAdvanceTime: false, // Manual control = deterministic
  })
})

afterEach(() => {
  clock.uninstall() // Restore real timers
})

// Advance time and process callbacks + promises
await clock.tickAsync(500)
```

### Key Gotcha: `tickAsync()` vs `tick()`

```typescript
// WRONG - Promise callbacks won't execute
clock.tick(100)
await promise // HANGS - microtasks never flushed

// RIGHT - Handles both timers and promise microtasks
await clock.tickAsync(100)
// Promise callbacks execute correctly
```

### TestWatcher for Concurrent Tests

Real file watchers (chokidar) don't work well with fake timers because:

1. Chokidar's internal polling uses setInterval
2. OS filesystem events are outside JavaScript control

Solution: Inject a `TestWatcher` that we control directly:

```typescript
class TestWatcher extends EventEmitter implements WatcherInterface {
  // Instead of waiting for OS events, tests call triggerChange() directly
  triggerChange(path: string): void {
    this.pendingPaths.add(path)
    this.scheduleSync() // Uses fake setTimeout
  }
}

// In test setup:
const testWatcher = new TestWatcher(100) // 100ms debounce
const syncManager = createSync({
  db, repoPath: REPO_DIR,
  debounceFs: 100, debounceApply: 50, conflictStrategy: "last_write_wins",
  watcher: testWatcher, // Inject controllable watcher
  heartbeat: { enabled: false }, // Disable setInterval heartbeat
})

// In tests:
function writeAndTrigger(path: string, content: string): void {
  writeFileSync(path, content)
  testWatcher.triggerChange(path) // Simulate watcher detecting change
}

writeAndTrigger(testFile, "# New content")
await clock.tickAsync(200) // Advance past debounce
// Now sync has happened
```

### Avoiding Infinite Loops

With fake timers, `setInterval` handlers run forever during `runAllAsync()`. Prevent this:

1. **Disable heartbeat in tests:**

   ```typescript
   syncManager = createSync({
     db, repoPath, debounceFs: 100, debounceApply: 50, conflictStrategy: "last_write_wins",
     heartbeat: { enabled: false },
   })
   ```

2. **Use `tickAsync(ms)` instead of `runAllAsync()`:**

   ```typescript
   // DANGEROUS - can infinite loop with setInterval
   await clock.runAllAsync()

   // SAFE - bounded time advancement
   await clock.tickAsync(1000)
   ```

### Test Locations

| File                       | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `concurrent.test.ts`       | Deterministic concurrent edit tests using fake timers |
| `chaos-fuzz.fuzz.ts`  | Property-based fuzz tests using vimonkey gen/take      |

---

## Roadmap

| Milestone                    | Status | Description                                     |
| ---------------------------- | ------ | ----------------------------------------------- |
| M1: Foundation               | ✅     | Watcher DI, ChaosWatcher, initial tests         |
| M2: Full FS Mocking          | ✅     | FakeFileSystem class for fast testing            |
| M3: Invariant Framework      | ✅     | Verifier class, structured reports               |
| M4: vimonkey Integration      | ✅     | gen/take + stream transformers + test.fuzz        |
| M5: Auto-Regression          | ✅     | __fuzz_cases__/ auto-saved on failure             |

**Performance:** In-memory FakeFileSystem provides ~9x speedup (~60ms vs ~560ms/iteration).

---

## See Also

This document is part of the **Exploration Testing** family. See [testing.md#dynamic-testing-taxonomy](testing.md#dynamic-testing-taxonomy) for how these relate.

**Related exploration tests:**
- [`/explore`](../../.claude/skills/explore/SKILL.md) — TUI monkey testing (keyboard surface)
- [vendor/flexily/](../../vendor/flexily/) — Layout engine with Yoga differential fuzz

**Implementation:**
- [testing.md](testing.md) — General testing guide
- [vendor/watcher-chaos/](../../vendor/watcher-chaos/) — Watcher chaos package
- [packages/km-storage/tests/sync/chaos/](../../packages/km-storage/tests/sync/chaos/) — Chaos test suite

# km-storage Tests

**Layer 3 — Pipeline Integrity**: Files in, nodes out, files back. Trust km-markdown for parsing.

## What to Test Here

- File ↔ DB round-trip integrity: write file, sync, verify DB; edit DB, sync, verify file
- Concurrent edits: simultaneous fs and db changes merge without data loss
- Sync safety: watcher lifecycle, debouncing, error recovery
- Query execution: database queries return correct results for seeded data

## What NOT to Test Here

- Markdown parse edge cases — those belong in km-markdown
- Board state transitions — those belong in km-board
- How nodes render in the TUI — that's km-tui

**Boundary note**: Trust km-markdown for parsing, but ensure tricky real-world content (Obsidian callouts, Asana exports, nested code blocks) is tested in km-markdown. If a storage test fails due to a parsing issue, the fix belongs in km-markdown with a new fidelity test — not here.

## Helpers

### `query-test-helpers.ts`

| Helper                        | Purpose                           |
| ----------------------------- | --------------------------------- |
| `createTestDatabase()`        | In-memory SQLite with full schema |
| `seedTestData(db, nodes)`     | Bulk insert nodes for query tests |
| `formatDate(d)`               | Date formatting for assertions    |
| `today()`, `offsetDate(days)` | Date factory helpers              |

### `watch/sync-test-helpers.ts`

| Helper                                | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `createTestSync(db, path, overrides)` | Sync with fast debounces, no worker thread         |
| `setupSync(stack, sync, emitter)`     | Lifecycle with AsyncDisposableStack cleanup        |
| `waitForReady(sync)`                  | Wait for watcher initialization                    |
| `createStateChangeWaiter()`           | Wait for reconciling → idle cycle (callback-based) |

### `sync/chaos/` (fuzz testing)

| File              | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `fake-fs.ts`      | Mock filesystem for reproducible chaos                 |
| `event-picker.ts` | Random event generation from state                     |
| `transformers.ts` | Event sequence mutations                               |
| `verifier.ts`     | Invariant checking (concurrent safety, data integrity) |

## Patterns

```typescript
// Pipeline test: file ↔ DB round-trip
test("edit in db syncs back to file", async () => {
  await withMemoryStore(async ({ store, repoDir }) => {
    writeFileSync(join(repoDir, "tasks.md"), "- [ ] Alpha\n")
    await store.sync()

    store.updateNode("Alpha", { task_status: "done" })
    await store.sync()

    const content = readFileSync(join(repoDir, "tasks.md"), "utf-8")
    expect(content).toContain("- [x] Alpha")
  })
})
```

Uses `AsyncDisposableStack` for cleanup — always use `using` or explicit stack management.

## Directory Structure

```
tests/
  ├── query-test-helpers.ts     # DB + seeding
  ├── testing/                  # In-memory store setup
  ├── e2e/                      # Full app end-to-end
  ├── sync/chaos/               # Fuzz/chaos testing
  └── watch/sync-test-helpers.ts # createSync/withSync factory
```

## Ad-Hoc Testing (Quick Verification)

```bash
# Run a single test file
bun vitest run packages/km-storage/tests/repo.test.ts

# Run tests matching a name pattern
bun vitest run packages/km-storage/tests/ -t "sync merges concurrent"

# Run only tests affected by your changes
bun run test:changed

# Run tests importing a specific source file
bun vitest related packages/km-storage/src/watch/sync.ts
```

For quick ad-hoc verification of sync behavior without writing a test file:

```typescript
// In a scratch test (delete before committing)
import { withMemoryStore } from "./testing/memory-store"

test("quick check: my scenario", async () => {
  await withMemoryStore(async ({ store, repoDir }) => {
    // Setup, action, assert
  })
})
```

## Efficiency

- **Always use in-memory SQLite** (`createTestDatabase()` or `withMemoryStore()`) for fast tests. Disk DB is only for `TEST_MODE=real` CI runs.
- **Use `useWorker: false`** in `createTestSync()` / `createSync()` — avoids spawning a real file watcher thread.
- **Fast debounces** — test sync manager uses 1ms debounce, not production 300ms.
- Tests needing real filesystem or real watcher must be `.slow.test.ts`.

## Related Test Types

| Type           | Location               | When                                                                |
| -------------- | ---------------------- | ------------------------------------------------------------------- |
| **Chaos/fuzz** | `sync/chaos/*.fuzz.ts` | Randomized concurrent edit sequences. Run with `bun run test:fuzz`. |
| **Benchmarks** | `*.bench.ts`           | Sync pipeline performance. Run with `bun run bench`.                |
| **E2E**        | `e2e/`                 | Full app lifecycle (slow).                                          |

## See Also

- [Test layering philosophy](../../../.claude/skills/tests/test-layers.md)
- [Chaos/fuzz testing](../../../.claude/skills/tests/chaos.md)
- [Benchmarks](../../../.claude/skills/tests/bench.md)

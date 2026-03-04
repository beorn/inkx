# watcher-chaos Tests

**Test Infrastructure — Filesystem Watcher Simulation**: Deterministic chaos testing for file watcher behavior.

## What to Test Here

- Basic watcher: ready event emission, sync event with injected file events, event tracking
- Event injection: `inject()` with change/add/delete types, `flush()` to trigger sync
- Chaos presets: `queueOverflow`, `slowDisk`, `editorAtomic`, `reorderChaos`, `fseventsCoalesce`, `NO_CHAOS`
- Seeded randomness: `SeededRandom` for deterministic chaos behavior
- Directory tracking: paths and directories extracted from injected events

## What NOT to Test Here

- Real filesystem watchers (chokidar, fsevents) — this package simulates them
- km-storage sync behavior — that consumes the watcher, this provides the chaos layer

## Patterns

```typescript
import { createChaosWatcher } from "../src/index.ts"

test("emits sync event with injected events", async () => {
  const watcher = createChaosWatcher()
  let syncData: { paths: string[] } | null = null
  watcher.on("sync", (data) => {
    syncData = data
  })

  watcher.start("/repo")
  watcher.inject({ type: "change", path: "/repo/test.md" })
  await watcher.flush()

  expect(syncData!.paths).toContain("/repo/test.md")
})
```

## Ad-Hoc Testing

```bash
bun vitest run vendor/beorn-watcher-chaos/tests/   # All watcher-chaos tests (~instant)
```

## Efficiency

Fast (~50ms). Pure event-driven tests with `setImmediate` for async event propagation. No real filesystem operations.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)

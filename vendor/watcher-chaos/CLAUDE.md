# @beorn/watcher-chaos

Drop-in replacement file watcher for chaos testing. Simulates real-world edge cases: dropped events, reordering, coalescing, atomic writes.

## Commands

```bash
bun test              # Run all tests
bun run typecheck     # Type check
```

## Architecture

```
ChaosWatcher (src/watcher.ts)
  ├── Scenarios (src/scenarios.ts) — predefined chaos profiles
  ├── SeededRandom (src/seeded-random.ts) — deterministic RNG
  ├── FakeFileSystem (src/fake-fs.ts) — virtual filesystem
  └── Types (src/types.ts) — event types, config
```

## Key Files

| File                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `src/watcher.ts`      | ChaosWatcher implementation                  |
| `src/scenarios.ts`    | Predefined chaos scenarios                   |
| `src/seeded-random.ts`| Seeded RNG for reproducible chaos            |
| `src/fake-fs.ts`      | Virtual filesystem for testing               |

## Predefined Scenarios

`SLOW_DISK`, `QUEUE_OVERFLOW`, `EDITOR_ATOMIC`, `EVENT_STORM`, `REORDER_CHAOS`, `PARTIAL_WRITES`, `RENAME_STORM`, `FSEVENTS_COALESCE`, `INIT_GAP`, `NO_CHAOS`

## Code Style

Factory functions, no classes, no globals. ESM imports only. TypeScript strict mode. Zero runtime dependencies.

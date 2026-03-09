# @beorn/watcher-chaos

Drop-in replacement file watcher for chaos testing. Simulates real-world file watcher edge cases like dropped events, reordering, and coalescing.

## Why?

File watchers (chokidar, FSEvents, inotify) have many edge cases that are hard to test:

- **Event drops** - inotify `IN_Q_OVERFLOW`, FSEvents buffer overflow
- **Event coalescing** - FSEvents merges many file events into single directory event
- **Reordering** - Events delivered out of order
- **Atomic writes** - Editors write temp file then rename
- **Rapid succession** - Many events in milliseconds

ChaosWatcher lets you simulate these scenarios deterministically in tests.

## Installation

```bash
npm install @beorn/watcher-chaos
```

## Usage

### Drop-in Replacement

ChaosWatcher implements the same interface as typical file watchers:

```typescript
import { ChaosWatcher, queueOverflow } from "@beorn/watcher-chaos"

// Create chaos watcher with 20% event drops
const watcher = new ChaosWatcher({
  scenario: queueOverflow(0.2),
  seed: 12345, // Reproducible
  virtualTime: true, // Fast tests
})

// Same interface as your real watcher
watcher.start("/path/to/watch")
watcher.on("sync", ({ paths, directories }) => {
  // Handle file changes
})
watcher.on("ready", () => {
  console.log("Watching...")
})

// Inject test events
watcher.inject({ type: "change", path: "/path/to/file.md" })
watcher.injectBatch([
  { type: "add", path: "/path/to/new.md" },
  { type: "unlink", path: "/path/to/deleted.md" },
])

// Process all events (virtual time)
await watcher.flush()

// Introspect
console.log("Emitted:", watcher.getEmittedEvents().length)
console.log("Dropped:", watcher.getDroppedEvents().length)

await watcher.stop()
```

### Built-in Scenarios

```typescript
import {
  slowDisk,
  queueOverflow,
  editorAtomic,
  eventStorm,
  reorderChaos,
  fseventsCoalesce,
  rapidSuccession,
  NO_CHAOS,
} from "@beorn/watcher-chaos"

// Slow disk - events delayed 2-5 seconds
const watcher1 = new ChaosWatcher({ scenario: slowDisk(2000, 5000) })

// Queue overflow - 20% events dropped
const watcher2 = new ChaosWatcher({ scenario: queueOverflow(0.2) })

// Editor atomic - change becomes unlink + add (temp file pattern)
const watcher3 = new ChaosWatcher({ scenario: editorAtomic(50) })

// Event storm - rapid burst of events
const watcher4 = new ChaosWatcher({ scenario: eventStorm(10) })

// Reorder chaos - events shuffled within window
const watcher5 = new ChaosWatcher({ scenario: reorderChaos(10) })

// FSEvents coalesce - many files → single directory event
const watcher6 = new ChaosWatcher({ scenario: fseventsCoalesce(10) })

// No chaos - events pass through unchanged
const watcher7 = new ChaosWatcher({ scenario: NO_CHAOS })
```

### Virtual Time

For fast, deterministic tests:

```typescript
const watcher = new ChaosWatcher({
  scenario: slowDisk(2000, 5000),
  virtualTime: true,
  seed: 12345,
})

watcher.start("/repo")
watcher.inject({ type: "change", path: "/repo/test.md" })

// Instantly advance 5 seconds (no actual waiting)
await watcher.advanceTime(5000)

// Or process all pending events immediately
await watcher.flush()
```

### Dependency Injection

Use with applications that support watcher injection:

```typescript
// Your application
class SyncManager {
  constructor(config: { watcher?: WatcherInterface }) {
    this.watcher = config.watcher ?? new RealWatcher()
  }
}

// Production
const sync = new SyncManager({})

// Testing with chaos
const sync = new SyncManager({
  watcher: new ChaosWatcher({ scenario: queueOverflow(0.2) }),
})
```

### Seeded Random

For reproducible chaos:

```typescript
import { SeededRandom } from "@beorn/watcher-chaos"

const random = new SeededRandom(12345)
random.next() // 0-1
random.nextInt(0, 100) // 0-99
random.chance(0.5) // true/false with 50% probability
random.shuffle([1, 2, 3, 4, 5]) // Deterministic shuffle
```

### MockFileSystem

In-memory filesystem for fast tests without temp directories:

```typescript
import { MockFileSystem } from "@beorn/watcher-chaos"

const fs = new MockFileSystem()

// Standard fs operations
fs.mkdirSync("/repo", { recursive: true })
fs.writeFileSync("/repo/test.md", "# Hello")
const content = fs.readFileSync("/repo/test.md", "utf8")

// Error injection for testing error handling
fs.setErrorInjection({
  permissionDenied: ["/repo/secret.md"], // EACCES
  ioError: ["/repo/corrupt.md"], // EIO
  readOnly: ["/repo/readonly/"], // EROFS on writes
  errorRate: 0.1, // 10% random I/O errors
})

// Directory scanning (for reconciliation tests)
const scanner = fs.createScanner()
const entries = scanner("/repo", ["*.tmp", "node_modules"])

// Test helpers
fs.setMtime("/repo/test.md", Date.now() - 60000) // Set mtime
console.log(fs.dump()) // Debug state
fs.reset() // Clear all
```

## API

### ChaosWatcher

```typescript
new ChaosWatcher(config?: {
  debounceMs?: number;           // Event debounce (default: 100)
  scenario?: ChaosScenario;      // Chaos scenario to apply
  seed?: number;                 // Random seed for reproducibility
  virtualTime?: boolean;         // Use virtual time (default: true)
  eventTransformer?: (events: ScheduledEvent[]) => ScheduledEvent[];
})
```

**Methods:**

- `start(repoPath)` - Start watching
- `stop()` - Stop watching
- `inject(event, timing?)` - Inject single event
- `injectBatch(events)` - Inject batch (transformed together)
- `setScenario(scenario)` - Change scenario
- `advanceTime(ms)` - Advance virtual time
- `flush()` - Process all pending events
- `getEmittedEvents()` - Get events that were emitted
- `getDroppedEvents()` - Get events that were dropped
- `reset()` - Reset state for new test

### Scenarios

| Scenario                           | Description                                  |
| ---------------------------------- | -------------------------------------------- |
| `slowDisk(min, max)`               | Random delays (simulates slow storage)       |
| `queueOverflow(rate)`              | Drop events randomly (simulates overflow)    |
| `editorAtomic(delay)`              | Change → unlink + add (simulates vim/vscode) |
| `eventStorm(interval)`             | Rapid burst of events                        |
| `reorderChaos(window)`             | Shuffle within window                        |
| `fseventsCoalesce(threshold)`      | Merge to directory event                     |
| `rapidSuccession(count, interval)` | Many rapid edits                             |

### MockFileSystem

```typescript
new MockFileSystem()
```

**Methods:**

- `writeFileSync(path, content, encoding?)` - Write file
- `readFileSync(path, encoding?)` - Read file
- `unlinkSync(path)` - Delete file
- `mkdirSync(path, options?)` - Create directory
- `existsSync(path)` - Check if path exists
- `renameSync(oldPath, newPath)` - Rename/move file
- `statSync(path)` - Get file stats
- `createScanner()` - Create directory scanner function
- `scanDirectory(path, ignorePatterns?)` - Scan directory
- `setErrorInjection(config)` - Configure error injection
- `setErrorRng(rng)` - Set RNG for random errors
- `clearErrorInjection()` - Clear error settings
- `setMtime(path, mtime)` - Set file modification time
- `getAllPaths()` - List all paths
- `getContent(path)` - Get file content (no throw)
- `dump()` - Dump filesystem state
- `reset()` - Reset to initial state

## License

MIT

# Event System

km uses a lightweight event system for cross-layer communication and observability. Built on [nanoevents](https://github.com/ai/nanoevents) (107 bytes), it provides type-safe pub/sub with Disposable support.

## Quick Start

```typescript
import { kmEvents } from "@km/core"

// Subscribe
const unsub = kmEvents.on("parse-error", (e) => {
  console.log(`Parse error in ${e.file}:${e.line} - ${e.message}`)
})

// Emit
kmEvents.emit("parse-error", {
  file: "tasks.md",
  line: 42,
  message: "Invalid syntax",
})

// Cleanup
unsub()
```

## Event Categories

Events are organized by purpose:

| Category   | Purpose          | Consumers                |
| ---------- | ---------------- | ------------------------ |
| **User**   | UI feedback      | TUI status bar, CLI logs |
| **Debug**  | Internal tracing | debug() logger           |
| **Metric** | Performance      | Monitoring, optimization |

### User Events

Cross-layer errors that need user feedback:

- `parse-error` - Markdown parsing failed
- `sync-error` - File sync issue
- `validation-warning` - Node validation warning

### Debug Events

Internal diagnostics (used with `DEBUG=km:*`):

- `command-executed` - Command timing
- `action-handled` - Action result tracking

### Metric Events

Performance monitoring:

- `vault-loaded` - Vault initialization timing
- `file-parsed` - File parsing stats

## Subscription Patterns

### Basic Subscription

```typescript
const unsub = kmEvents.on("sync-error", (e) => {
  showStatus(`Sync error: ${e.path}`)
})

// Later
unsub()
```

### React useEffect

```typescript
useEffect(() => {
  const unsub = kmEvents.on("parse-error", (e) => {
    toast.error(`Parse error in ${e.file}`)
  })
  return unsub // cleanup on unmount
}, [])
```

### Dispose Method

```typescript
const sub = kmEvents.on("validation-warning", handler)
sub.dispose() // Same as calling sub()
```

### Using Keyword (TypeScript 5.2+)

```typescript
function handleScope() {
  using sub = kmEvents.on("parse-error", handler)
  // auto-disposed when scope exits
}
```

### DisposableStore (Multiple Subscriptions)

```typescript
import { DisposableStore } from "@km/core"

const store = new DisposableStore()
store.add(kmEvents.on("parse-error", handler1))
store.add(kmEvents.on("sync-error", handler2))
store.add(vault.watch()) // Any Disposable

// Later, or with `using`:
store.dispose() // cleans up all
```

## Adding New Events

1. **Define in KmEvents interface**:

```typescript
// packages/km-core/src/events.ts
export interface KmEvents {
  "new-event": (e: { foo: string; bar: number }) => void
}
```

2. **Emit from source layer**:

```typescript
// packages/km-markdown/src/parser.ts
import { kmEvents } from "@km/core"

kmEvents.emit("parse-error", { file, line, message })
```

3. **Subscribe in consumer**:

```typescript
// apps/km-tui/src/App.tsx
kmEvents.on("parse-error", (e) => {
  dispatch(actions.setStatus({ level: "error", message: e.message }))
})
```

## Type Safety

All events are fully type-checked:

```typescript
// ✅ Correct
kmEvents.emit("parse-error", { file: "test.md", line: 42, message: "bad" })

// ❌ Type error - missing 'message' field
kmEvents.emit("parse-error", { file: "test.md", line: 42 })

// ✅ Handler gets typed event
kmEvents.on("parse-error", (e) => {
  // e: { file: string; line: number; message: string }
  console.log(e.message.toUpperCase())
})
```

## Testing

Event emission is synchronous, making testing straightforward:

```typescript
import { test, expect } from "bun:test"
import { kmEvents } from "@km/core"

test("emits parse error", () => {
  const calls: string[] = []

  const unsub = kmEvents.on("parse-error", (e) => {
    calls.push(e.file)
  })

  kmEvents.emit("parse-error", { file: "test.md", line: 1, message: "err" })

  expect(calls).toEqual(["test.md"])
  unsub()
})
```

## Design Decisions

### Why nanoevents?

| Library       | Size  | TypeScript | Why Not?                     |
| ------------- | ----- | ---------- | ---------------------------- |
| nanoevents    | 107b  | ✅ Best    | **Our choice**               |
| mitt          | 200b  | ✅ Good    | Larger, less ergonomic types |
| emittery      | 48kb  | ✅ Good    | 400x larger                  |
| eventemitter3 | 1.5kb | ⚠️ Manual  | No built-in types            |

nanoevents offers:

- Interface-based typing (most ergonomic)
- Returns unbind function directly (cleaner than `.off()`)
- Smallest size with full features

### Synchronous vs Async

Events are **synchronous** (emit → handlers run immediately → emit returns).

**Benefits**:

- Predictable execution order
- Simple testing (no `await`)
- No race conditions

**When you need async**: Use promises in handlers, not async events:

```typescript
kmEvents.on("vault-loaded", async (e) => {
  await syncToRemote(e.nodeCount)
})
```

### Cross-Worker Communication

For future multi-threaded work, use BroadcastChannel:

```typescript
// Main thread
const channel = new BroadcastChannel("km-events")
kmEvents.on("parse-error", (e) => {
  channel.postMessage({ type: "parse-error", payload: e })
})

// Worker thread
channel.onmessage = (event) => {
  const { type, payload } = event.data
  workerEvents.emit(type, payload)
}
```

See [Appendix C in plan](../../.claude/plans/swirling-launching-chipmunk.md#appendix-c-event-system-phase-3) for full cross-worker patterns.

## Comparison with VSCode

| Concept  | VSCode                       | km                                     |
| -------- | ---------------------------- | -------------------------------------- |
| API      | `Event<T>`, `onDidX/onWillX` | `on/emit`                              |
| Cleanup  | `Disposable`                 | `Subscription` (callable + Disposable) |
| Size     | ~500 lines                   | 107 bytes                              |
| Features | Buffering, debouncing        | Core only                              |

km's simpler model fits our needs. If we need buffering/debouncing, we add utilities separately.

## See Also

- [Architecture Overview](../02-architecture.md) - How events fit in layers
- [Observability Guide](observability.md) - Logging + events + metrics
- [nanoevents docs](https://github.com/ai/nanoevents) - Library reference

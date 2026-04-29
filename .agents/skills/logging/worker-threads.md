---
description: Worker thread debug output patterns (MANDATORY)
---

# Worker Thread Debug Output (MANDATORY)

**CRITICAL: Never delete `process.env.DEBUG` or suppress `console.*` or `debug()` calls.**

Suppressing output hides bugs. Worker threads MUST forward all debug output to the main thread.

## Why Worker Threads Need Special Handling

- Worker threads can't share file descriptors with main thread
- `DEBUG_LOG` redirection only works in main thread
- Calling `createDebug()` in worker goes to stderr, bypassing `DEBUG_LOG`
- This causes debug output to appear in TUI and interfere with rendering

## MANDATORY Pattern for ALL Worker Threads

**Worker thread (e.g., worker-thread.ts):**

```typescript
const NAMESPACE = "km:storage:watch:worker"

// Custom debug function that forwards to main thread
function debug(message: string, ...args: unknown[]): void {
  // Format the message with args (simple %s/%d/%O replacement)
  let formatted = message
  let argIndex = 0
  formatted = message.replace(/%[sdOo]/g, () => {
    const arg = args[argIndex++]
    if (arg === undefined) return ""
    if (arg === null) return "null"
    if (typeof arg === "object") return JSON.stringify(arg)
    return String(arg)
  })

  // Send to main thread - NEVER call createDebug() in worker
  postMessage({ type: "debug", namespace: NAMESPACE, message: formatted })
}

// Use this debug() throughout worker
debug("worker started, watching %s", vaultPath)
```

**Main thread bridge (e.g., worker-bridge.ts):**

```typescript
import createDebug from "debug";
const workerDebug = createDebug("km:storage:watch:worker");

// In message handler:
case "debug":
  // Forward worker debug through main thread's debug logger
  // This ensures DEBUG_LOG captures worker output
  workerDebug("%s", message.message);
  break;
```

**Message type definition:**

```typescript
export type WorkerMessage =
  | { type: "debug"; namespace: string; message: string }
  | /* ... other message types */;
```

## DO

- Forward ALL debug output to main thread via `postMessage()`
- Use custom `debug()` function in worker that only sends messages
- Format messages in worker, log in main thread

## NEVER

- Call `createDebug()` directly in worker threads
- Delete or suppress `process.env.DEBUG`
- Use `console.log/error/warn` in workers (same issue as `debug()`)
- Assume "this worker doesn't need debugging" - bugs happen everywhere

## Reference Implementation

[packages/km-storage/src/watch/worker-thread.ts](../../packages/km-storage/src/watch/worker-thread.ts)

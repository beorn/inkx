---
mentions:
  - beorn
  - km
  - claude
id: "@km/logger/worker"
aliases:
  - km-logger.worker
  - km-logger-worker
created_at: 2026-02-02T15:24:41Z
closed_at: 2026-02-02T15:55:29Z
assignee: claude:76fda6b0
---

# [x] Add worker thread debug support to @beorn/logger @km/logger #feature #P4 @claude:76fda6b0

## Feature

Add reusable worker thread console/debug forwarding to @beorn/logger.

## Motivation

Workers have separate stdout/stderr, so ALL output bypasses main thread's DEBUG_LOG and log file redirection. This affects:

- `debug()` calls
- `console.log/warn/error` calls
- Any library that writes to stdout/stderr

Currently @km/storage has inconsistent patterns:

1. Watch worker - custom debug wrapper forwarding via postMessage
2. Parse worker - suppresses DEBUG entirely (quick fix)

## Proposed API

**Worker side:**

```typescript
import { forwardConsole } from "@beorn/logger/worker";

// Intercept all console.* and debug() calls, forward via postMessage
forwardConsole(postMessage);

// Now these go to main thread:
console.log("parsing file");
console.error("parse error");
debug("internal state");
```

**Main thread side:**

```typescript
import { createWorkerConsoleHandler } from "@beorn/logger/worker";

const handleConsole = createWorkerConsoleHandler();
worker.onmessage = (e) => {
  if (e.data.type === "console") handleConsole(e.data);
};
```

## Message Protocol

```typescript
interface WorkerConsoleMessage {
  type: "console";
  level: "log" | "warn" | "error" | "debug" | "info";
  namespace?: string;  // For debug() calls
  args: unknown[];     // Serializable arguments
  timestamp: number;
}
```

## Implementation Notes

- Monkey-patch `console.*` methods in worker
- Wrap `debug` package's output function
- Handle non-serializable objects (functions, circular refs)
- Preserve stack traces where possible
- Consider using `structuredClone` for deep copying

## Benefits

- Single implementation in @beorn/logger
- ALL worker output captured (not just debug)
- Proper DEBUG_LOG and log file integration
- Works with any library that uses console.*


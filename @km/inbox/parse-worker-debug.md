---
id: "@km/_orphan/parse-worker-debug"
aliases:
  - km-parse-worker-debug
created_at: 2026-01-24T00:33:05Z
closed_at: 2026-01-24T00:38:44Z
---

# [x] Parse worker debug output goes to stdout instead of DEBUG_LOG @km/_orphan #bug #P1

## Problem

When running `km view` with `DEBUG_LOG=/tmp/debug.log`, debug output from the markdown parser appears on stdout instead of being written to the log file.

## Root Cause

The markdown parser (`@km/markdown`) uses `createDebug()` and runs inside a worker thread. Workers have their own stdout, bypassing the main thread's DEBUG_LOG redirection.

## Quick Fix (Implemented)

Suppress debug output in worker threads by clearing `process.env.DEBUG` before imports.

## Future: Reusable Worker Debug Pattern

The watch worker (`worker-thread.ts`) has a working pattern:
1. Custom `debug()` wrapper sends `{ type: "debug", message }` to main thread
2. Main thread's `worker-bridge.ts` handles messages and forwards to a debug instance

### Proposed Reusable API for @beorn/logger

**Worker side:**
```typescript
import { createWorkerDebug } from "@beorn/logger/worker";

// Creates debug-like function that forwards to main thread
const debug = createWorkerDebug("km:markdown", postMessage);
debug("parsing %s", filename);
```

**Main thread side:**
```typescript
import { createWorkerDebugHandler } from "@beorn/logger/worker";

const handleDebug = createWorkerDebugHandler();
worker.onmessage = (e) => {
  if (e.data.type === "debug") handleDebug(e.data);
};
```

### Benefits
- Single implementation in @beorn/logger
- Consistent pattern across all workers
- Proper DEBUG_LOG integration
- No need to modify libraries like @km/markdown

## Files Modified

- `packages/km-storage/src/parse-worker.ts` - Quick fix: clear DEBUG env

## Future Work

- [ ] Extract reusable pattern to @beorn/logger
- [ ] Update watch worker to use shared implementation
- [ ] Consider if parse worker needs debug or if suppression is fine
# Loading & Syncing Unification

## Status: Complete

Unified via composable async generator pipeline in `packages/km-storage/src/pipeline.ts`.

## Solution

Both loading and syncing now use the same pipeline stages:

```
Sources (file paths)
    ↓
┌─────────────────────────────────┐
│  parseFiles()                   │  ← Streaming: yields as workers complete
│  AsyncGenerator<ParsedFile>     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  applyNodes()                   │  ← Buffering: exhausts upstream, then yields
│  AsyncGenerator<AppliedFile>    │     (transaction boundary)
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  resolveLinks()                 │  ← Buffering: needs all nodes first
│  AsyncGenerator<ResolvedLink>   │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  applyLinks()                   │  ← Buffering: batch INSERT
│  AsyncGenerator<void>           │     (transaction boundary)
└─────────────────────────────────┘
```

## Usage

### Loading Path (repo-loader.ts)

```typescript
import { runDeferredPipeline } from "./pipeline.ts"

// Parse deferred files after initial board render
const result = await runDeferredPipeline(db, deferredFiles, pool)
```

### Syncing Path (reconcile.ts)

```typescript
import { parseFiles, collect } from "./pipeline.ts"

// Parallel parse using pipeline
const sources = parseJobs.map((job) => ({
  path: job.op.path,
  nodeId: job.nodeId,
  isCreate: job.isCreate,
}))
const parsedFiles = await collect(parseFiles(sources, parsePool))
```

## Benefits

| Benefit          | Description                                           |
| ---------------- | ----------------------------------------------------- |
| **DRY**          | Single implementation for parse → apply → resolve     |
| **Testable**     | Each stage testable in isolation with mock generators |
| **Composable**   | Mix and match stages for different use cases          |
| **Observable**   | Easy to add progress/logging at any stage             |
| **Backpressure** | Natural flow control via async iteration              |
| **Cancellable**  | AbortSignal propagates through pipeline               |

## Architecture Principle

Added to `docs/principles.md` as Principle 7: Async Generator Pipelines.

> For multi-stage data processing, use async generators. Stages that need all
> upstream data before proceeding simply exhaust the generator before continuing.

## Files

- `packages/km-storage/src/pipeline.ts` - Pipeline stages + utilities
- `packages/km-storage/src/parse-pool.ts` - Added `stream()` method
- `packages/km-storage/src/repo-loader.ts` - Uses `runDeferredPipeline()`
- `packages/km-storage/src/watch/reconcile.ts` - Uses `parseFiles()`
- `docs/principles.md` - Added async generator principle

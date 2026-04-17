# Async Generator Pipelines

Composable multi-stage data processing using async generators.

## Overview

km uses async generator pipelines for all multi-stage data processing. Both loading and syncing use the same pipeline stages, demonstrating the composability of the approach.

## The Pattern

Each pipeline stage is an async generator function. Stages compose naturally:

```typescript
const pipeline = stage3(stage2(stage1(sources)))
for await (const item of pipeline) {
  // Process items as they flow through
}
```

**Two types of stages**:

1. **Streaming stages** — Yield items as they arrive (no buffering)
2. **Buffering stages** — Exhaust upstream, process all items, then yield

## Pipeline Stages

### 1. parseFiles() — Streaming

Parses markdown files in parallel using a worker pool. Yields as workers complete.

```typescript
async function* parseFiles(sources, pool) {
  for await (const result of pool.stream(sources)) {
    yield {
      path: result.path,
      nodes: result.nodes,
      hash: result.hash,
    }
  }
}
```

**Why streaming**: Parsing is I/O-bound and parallelizable. No need to wait for all files.

### 2. applyNodes() — Buffering

Applies parsed nodes to the database within a transaction.

```typescript
async function* applyNodes(upstream, db) {
  const files = []
  for await (const file of upstream) {
    files.push(file) // Exhaust upstream
  }

  db.run("BEGIN IMMEDIATE")
  for (const file of files) {
    const applied = applyFileNodes(db, file)
    yield applied // Yield after DB write
  }
  db.run("COMMIT")
}
```

**Why buffering**: Database transaction must be atomic. Collect all files before starting transaction.

### 3. resolveLinks() — Buffering

Resolves wiki links and references between nodes.

```typescript
async function* resolveLinks(upstream, db) {
  const files = []
  for await (const file of upstream) {
    files.push(file) // Need all nodes first
  }

  // Resolve references across all files
  for (const file of files) {
    const links = extractLinks(file)
    const resolved = links.map((link) => resolveTarget(db, link))
    yield { file, resolved }
  }
}
```

**Why buffering**: Link resolution requires all nodes to be in the database.

### 4. applyLinks() — Buffering

Inserts resolved links into the database.

```typescript
async function* applyLinks(upstream, db) {
  const batch = []
  for await (const item of upstream) {
    batch.push(...item.resolved)
  }

  db.run("BEGIN IMMEDIATE")
  for (const link of batch) {
    db.run("INSERT INTO links ...", link)
  }
  db.run("COMMIT")
  yield // Signal completion
}
```

**Why buffering**: Batch INSERT for performance, transaction for atomicity.

## Complete Pipeline

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

## Testing Pipeline Stages

Each stage can be tested in isolation by providing a mock upstream generator:

```typescript
// Test parseFiles with mock sources
async function* mockSources() {
  yield { path: "test.md", content: "# Test" }
}

const parsed = parseFiles(mockSources(), mockPool)
for await (const file of parsed) {
  expect(file.nodes).toBeDefined()
}

// Test applyNodes with mock upstream
async function* mockParsed() {
  yield { path: "test.md", nodes: [...], hash: "abc123" }
}

const applied = applyNodes(mockParsed(), mockDb)
for await (const result of applied) {
  expect(result.applied).toBe(true)
}
```

## When to Use Async Generators

Use async generators for:

- **Multi-stage data transformation** — Each stage is a function
- **Parallel processing with serial application** — Parse in parallel, apply serially
- **Progress-reportable operations** — Yield progress between stages
- **Cancellable operations** — AbortSignal works naturally

Don't use for:

- **Simple transformations** — Use `map()` or `filter()` on arrays
- **Synchronous operations** — Regular generators are simpler
- **Single-stage processing** — No need for pipeline composition

## Architecture Principle

See [principles.md](../principles.md) Part 2: Composable Flows for the architectural reasoning behind this approach.

> Async generators make flows composable. Each stage is independent (test in isolation), stages compose like functions (pipe together), natural backpressure (consumer controls pace).

## Implementation Files

- `packages/km-storage/src/pipeline.ts` — Pipeline stages + utilities
- `packages/km-storage/src/parse-pool.ts` — Worker pool with `stream()` method
- `packages/km-storage/src/repo-loader.ts` — Uses `runDeferredPipeline()`
- `packages/km-storage/src/watch/reconcile.ts` — Uses `parseFiles()`

## See Also

- [principles.md](../principles.md) — Async generator pipelines principle
- [architecture.md](../architecture.md) — Data flow through layers
- [storage.md](../design/model/storage.md) — SQLite schema and sync details

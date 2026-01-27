# Domain Object Migration Guide

This guide explains how to migrate from the singleton-based storage APIs to the new domain object pattern.

## Overview

The km codebase is transitioning from global singletons to domain objects. The benefits:

- **No hidden dependencies** - All state is explicitly owned by objects
- **Multiple repos** - Can work with multiple repos simultaneously
- **Testability** - Easy to inject mock dependencies
- **Automatic cleanup** - `using` syntax ensures proper resource disposal

## Quick Reference

| Old API (deprecated)      | New API (preferred)            |
| ------------------------- | ------------------------------ |
| `loadRepo(path)`          | `createRepo(path)`             |
| `getNode(id)`             | `repo.getNode(id)`             |
| `getChildren(id)`         | `repo.getChildren(id)`         |
| `getAllTasks()`           | `repo.getAllTasks()`           |
| `search(query)`           | `repo.search(query)`           |
| `updateNode(id, changes)` | `repo.updateNode(id, changes)` |
| `getTuiConfig()`          | `loadConfigObject().tui`       |
| `getBeadsConfig()`        | `loadConfigObject().beads`     |

## Migration Patterns

### Basic Command Migration

**Before (singleton pattern):**

```typescript
import { loadRepo, getNode, getAllTasks, getTasksByStatus } from "@km/storage"
import { runGenerator } from "@km/storage"

export async function myCommand(path: string) {
  // Load repo using singletons
  runGenerator(loadRepo(path))

  // Access data through global functions
  const tasks = getAllTasks()
  const todoCount = getTasksByStatus("todo").length
  const node = getNode(someId)

  console.log(`${todoCount} todos, ${tasks.length} total`)
}
```

**After (domain object pattern):**

```typescript
import { createRepo, runGenerator } from "@km/storage"

export async function myCommand(path: string) {
  // Create repo object - 'using' ensures cleanup
  using repo = runGenerator(createRepo(path))

  // Access data through repo methods
  const tasks = repo.getAllTasks()
  const todoCount = repo.getTasksByStatus("todo").length
  const node = repo.getNode(someId)

  console.log(`${todoCount} todos, ${tasks.length} total`)
  // repo.close() called automatically when scope exits
}
```

### With Progress Display

**Before:**

```typescript
import { loadRepo, runWithProgress } from "@km/storage"

const result = runWithProgress(loadRepo(path), (progress) => {
  spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`)
})
```

**After:**

```typescript
import { createRepo, runWithProgress } from "@km/storage"

using repo = runWithProgress(createRepo(path), (progress) => {
  spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`)
})
```

### Config Migration

**Before:**

```typescript
import { getTuiConfig, getBeadsConfig } from "@km/storage"

const tuiConfig = getTuiConfig(repoPath)
const beadsConfig = getBeadsConfig(repoPath)
const watchEnabled = tuiConfig.watch
```

**After:**

```typescript
import { loadConfigObject } from "@km/storage"

const config = loadConfigObject(repoPath)
const watchEnabled = config.tui.watch
const beadsPrefix = config.beads.prefix

// If config changes on disk, reload:
config.reload()
```

### Multiple Repos

The domain object pattern makes working with multiple repos natural:

```typescript
import { createRepo, runGenerator } from "@km/storage"

async function syncRepos(srcPath: string, dstPath: string) {
  using srcRepo = runGenerator(createRepo(srcPath))
  using dstRepo = runGenerator(createRepo(dstPath))

  // Copy tasks from src to dst
  const tasks = srcRepo.getAllTasks()
  for (const task of tasks) {
    dstRepo.addNode(null, {
      type: task.type,
      content: task.content,
      task_status: task.task_status,
    })
  }
}
```

### Watcher Migration

**Before:**

```typescript
import { SyncManager } from "@km/storage"

const sync = new SyncManager({ repoPath: path })
sync.start()
sync.on("state-change", handleChange)
// Manual cleanup needed
```

**After:**

```typescript
import { createRepo, runGenerator } from "@km/storage"

using repo = runGenerator(createRepo(path))
await using watcher = repo.watch()

await watcher.start()
watcher.on("change", handleChange)
// Both watcher.stop() and repo.close() called automatically
```

## Board Domain Object

For TUI applications, the Board domain object wraps BoardState and boardReducer:

```typescript
import { createRepo, runGenerator } from "@km/storage"
import { createBoard } from "@km/board"

using repo = runGenerator(createRepo(path))
const board = createBoard(repo, { rootId: "@projects" })

// Navigation
board.moveCursor("down")
board.moveCursor("right")

// Get current state
const current = board.getCurrentNode()
const breadcrumbs = board.getBreadcrumbs()

// Selection
board.toggleSelect(nodeId)
board.clearSelection()

// Folding
board.toggleFold(nodeId)
board.foldToDepth(0) // Fold all
board.unfoldToDepth(99) // Unfold all

// Zoom
board.zoom(nodeId)
board.zoomOut()

// History
board.back()
board.forward()

// Refresh from repo
board.refresh()
```

## Disposable Patterns

### Sync Disposal (Repo, Board)

Objects with sync cleanup use `using`:

```typescript
using repo = runGenerator(createRepo(path))
// repo.close() called automatically via Symbol.dispose
```

### Async Disposal (Watcher)

Services with async cleanup use `await using`:

```typescript
await using watcher = repo.watch()
await watcher.start()
// watcher.stop() awaited automatically via Symbol.asyncDispose
```

### Manual Cleanup

If you can't use `using` syntax, call cleanup explicitly:

```typescript
const repo = runGenerator(createRepo(path))
try {
  // ... use repo
} finally {
  repo.close()
}
```

## Gradual Migration

The domain objects internally use the same infrastructure as the singleton APIs. This means:

1. **Mixed usage works** - Code using `createRepo()` sets up the same globals that `getNode()` reads from
2. **Migrate incrementally** - Update one command at a time
3. **Test thoroughly** - Both APIs should produce identical results

## Example: km stats Command

See `apps/km-cli/src/commands/stats.ts` for a complete example of the domain object pattern:

```typescript
import { Command } from "commander"
import { runGenerator, createRepo } from "@km/storage"

export const statsCommand = new Command("stats")
  .description("Show repo statistics")
  .argument("[path]", "Path to repo (default: cwd)")
  .action(async (path) => {
    using repo = runGenerator(createRepo(path))

    const tasks = repo.getAllTasks()
    console.log(`Repo: ${repo.path}`)
    console.log(`Mode: ${repo.mode}`)
    console.log(`Nodes: ${repo.stats.nodeCount}`)
    console.log(`Tasks: ${tasks.length}`)
  })
```

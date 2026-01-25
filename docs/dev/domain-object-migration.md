# Domain Object Migration Guide

This guide explains how to migrate from the singleton-based storage APIs to the new domain object pattern.

## Overview

The km codebase is transitioning from global singletons to domain objects. The benefits:

- **No hidden dependencies** - All state is explicitly owned by objects
- **Multiple vaults** - Can work with multiple vaults simultaneously
- **Testability** - Easy to inject mock dependencies
- **Automatic cleanup** - `using` syntax ensures proper resource disposal

## Quick Reference

| Old API (deprecated)      | New API (preferred)             |
| ------------------------- | ------------------------------- |
| `loadVault(path)`         | `createVault(path)`             |
| `getNode(id)`             | `vault.getNode(id)`             |
| `getChildren(id)`         | `vault.getChildren(id)`         |
| `getAllTasks()`           | `vault.getAllTasks()`           |
| `search(query)`           | `vault.search(query)`           |
| `updateNode(id, changes)` | `vault.updateNode(id, changes)` |
| `getTuiConfig()`          | `loadConfigObject().tui`        |
| `getBeadsConfig()`        | `loadConfigObject().beads`      |

## Migration Patterns

### Basic Command Migration

**Before (singleton pattern):**

```typescript
import { loadVault, getNode, getAllTasks, getTasksByStatus } from "@km/storage"
import { runGenerator } from "@km/storage"

export async function myCommand(path: string) {
  // Load vault using singletons
  runGenerator(loadVault(path))

  // Access data through global functions
  const tasks = getAllTasks()
  const todoCount = getTasksByStatus("todo").length
  const node = getNode(someId)

  console.log(`${todoCount} todos, ${tasks.length} total`)
}
```

**After (domain object pattern):**

```typescript
import { createVault, runGenerator } from "@km/storage"

export async function myCommand(path: string) {
  // Create vault object - 'using' ensures cleanup
  using vault = runGenerator(createVault(path))

  // Access data through vault methods
  const tasks = vault.getAllTasks()
  const todoCount = vault.getTasksByStatus("todo").length
  const node = vault.getNode(someId)

  console.log(`${todoCount} todos, ${tasks.length} total`)
  // vault.close() called automatically when scope exits
}
```

### With Progress Display

**Before:**

```typescript
import { loadVault, runWithProgress } from "@km/storage"

const result = runWithProgress(loadVault(path), (progress) => {
  spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`)
})
```

**After:**

```typescript
import { createVault, runWithProgress } from "@km/storage"

using vault = runWithProgress(createVault(path), (progress) => {
  spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`)
})
```

### Config Migration

**Before:**

```typescript
import { getTuiConfig, getBeadsConfig } from "@km/storage"

const tuiConfig = getTuiConfig(vaultPath)
const beadsConfig = getBeadsConfig(vaultPath)
const watchEnabled = tuiConfig.watch
```

**After:**

```typescript
import { loadConfigObject } from "@km/storage"

const config = loadConfigObject(vaultPath)
const watchEnabled = config.tui.watch
const beadsPrefix = config.beads.prefix

// If config changes on disk, reload:
config.reload()
```

### Multiple Vaults

The domain object pattern makes working with multiple vaults natural:

```typescript
import { createVault, runGenerator } from "@km/storage"

async function syncVaults(srcPath: string, dstPath: string) {
  using srcVault = runGenerator(createVault(srcPath))
  using dstVault = runGenerator(createVault(dstPath))

  // Copy tasks from src to dst
  const tasks = srcVault.getAllTasks()
  for (const task of tasks) {
    dstVault.addNode(null, {
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

const sync = new SyncManager({ vaultPath: path })
sync.start()
sync.on("state-change", handleChange)
// Manual cleanup needed
```

**After:**

```typescript
import { createVault, runGenerator } from "@km/storage"

using vault = runGenerator(createVault(path))
await using watcher = vault.watch()

await watcher.start()
watcher.on("change", handleChange)
// Both watcher.stop() and vault.close() called automatically
```

## Board Domain Object

For TUI applications, the Board domain object wraps BoardState and boardReducer:

```typescript
import { createVault, runGenerator } from "@km/storage"
import { createBoard } from "@km/board"

using vault = runGenerator(createVault(path))
const board = createBoard(vault, { rootId: "@projects" })

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

// Refresh from vault
board.refresh()
```

## Disposable Patterns

### Sync Disposal (Vault, Board)

Objects with sync cleanup use `using`:

```typescript
using vault = runGenerator(createVault(path))
// vault.close() called automatically via Symbol.dispose
```

### Async Disposal (Watcher)

Services with async cleanup use `await using`:

```typescript
await using watcher = vault.watch()
await watcher.start()
// watcher.stop() awaited automatically via Symbol.asyncDispose
```

### Manual Cleanup

If you can't use `using` syntax, call cleanup explicitly:

```typescript
const vault = runGenerator(createVault(path))
try {
  // ... use vault
} finally {
  vault.close()
}
```

## Gradual Migration

The domain objects internally use the same infrastructure as the singleton APIs. This means:

1. **Mixed usage works** - Code using `createVault()` sets up the same globals that `getNode()` reads from
2. **Migrate incrementally** - Update one command at a time
3. **Test thoroughly** - Both APIs should produce identical results

## Example: km stats Command

See `apps/km-cli/src/commands/stats.ts` for a complete example of the domain object pattern:

```typescript
import { Command } from "commander"
import { runGenerator, createVault } from "@km/storage"

export const statsCommand = new Command("stats")
  .description("Show vault statistics")
  .argument("[path]", "Path to vault (default: cwd)")
  .action(async (path) => {
    using vault = runGenerator(createVault(path))

    const tasks = vault.getAllTasks()
    console.log(`Vault: ${vault.path}`)
    console.log(`Mode: ${vault.mode}`)
    console.log(`Nodes: ${vault.stats.nodeCount}`)
    console.log(`Tasks: ${tasks.length}`)
  })
```

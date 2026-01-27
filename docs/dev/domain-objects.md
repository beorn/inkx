# Domain Object Patterns

This guide documents the domain object architecture used throughout km. All new code MUST follow these patterns.

---

## Core Principles

1. **Factory functions** - not classes
2. **Plain objects with methods** - not class instances
3. **No singletons** - all state owned by domain objects
4. **Disposable lifecycle** - explicit cleanup via Disposable/AsyncDisposable
5. **Dependency injection** - for testability

---

## Factory Function Pattern

### Basic Factory

```typescript
// ✅ GOOD - factory returns plain object with closure-based state
export interface Repo extends Disposable {
  readonly path: string
  readonly mode: "memory" | "disk"
  readonly data: DataStore
  readonly files: FileTree | null
  close(): void
}

export function* createRepo(
  path: string,
  options?: RepoOptions,
): Generator<StepYield, Repo, unknown> {
  // Internal state via closure (not class fields)
  const resolvedPath = resolvePath(path)
  const mode = detectMode(resolvedPath)
  let closed = false

  yield "Initializing database"
  const db = options?.inject?.database ?? openDatabase(mode, resolvedPath)
  const dataStore = createDBDataStore(db)

  yield "Setting up file tree"
  const fileTree = createDiskFileTree(resolvedPath)

  // Return plain object with methods
  return {
    get path() {
      return resolvedPath
    },
    get mode() {
      return mode
    },
    get data() {
      ensureNotClosed()
      return dataStore
    },
    get files() {
      ensureNotClosed()
      return fileTree
    },

    close() {
      if (closed) return
      closed = true
      db.close()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  // Private helper (hoisted)
  function ensureNotClosed() {
    if (closed) throw new Error("Repo is closed")
  }
}
```

### Why Not Classes?

```typescript
// ❌ BAD - class with internal state
export class Repo {
  private db: Database
  private closed = false

  constructor(path: string) {
    this.db = openDatabase(path)
  }

  getNode(id: string) {
    return queryNode(this.db, id)
  }
}

// Problems:
// - `this` binding issues in callbacks
// - Harder to mock in tests
// - Can't use `using` with class instances easily
// - Prototype chain complexity
```

### Why Not Singletons?

```typescript
// ❌ BAD - singleton pattern
let _db: Database | null = null
let _repoPath: string | null = null

export function initRepo(path: string) {
  _db = openDatabase(path)
  _repoPath = path
}

export function getDb() {
  if (!_db) throw new Error("Repo not initialized")
  return _db
}

export function getNode(id: string) {
  return queryNode(getDb(), id)
}

// Problems:
// - Hidden global state
// - Can't have multiple repos open
// - Testing requires careful setup/teardown
// - Implicit dependencies
```

---

## Generator Factories for Progress

When loading involves multiple phases, use a generator factory:

```typescript
export function* createRepo(
  path: string,
  options?: RepoOptions,
): Generator<StepYield, Repo, unknown> {
  // Declare all steps upfront (for progress UI)
  yield {
    declare: ["Detecting mode", "Initializing database", "Scanning files"],
  }

  // Phase 1: Detect mode
  yield "Detecting mode"
  const mode = detectMode(path)

  // Phase 2: Initialize database
  yield "Initializing database"
  const db = createDatabase(mode)
  const dataStore = createDBDataStore(db)

  // Phase 3: Scan files
  yield "Scanning files"
  const fileTree = createDiskFileTree(path)

  // Return the repo
  return createRepoObject(dataStore, fileTree, path)
}
```

### Consuming Generator Factories

```typescript
// Option A: With progress reporting
for (const step of createRepo(path)) {
  if (typeof step === "string") {
    spinner.update(step)
  }
}
const repo = runGenerator(createRepo(path)) // Get final value

// Option B: Silent (no progress)
using repo = runGenerator(createRepo(path))

// Option C: With runWithProgress helper
const repo = runWithProgress(createRepo(path), (step) => {
  console.log(`Loading: ${step}`)
})
```

### Helper Functions

```typescript
/** Run generator to completion, return final value */
export function runGenerator<T>(gen: Generator<unknown, T, unknown>): T {
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/** Run generator with progress callback */
export function runWithProgress<T>(
  gen: Generator<ProgressInfo, T, unknown>,
  onProgress: (info: ProgressInfo) => void,
): T {
  let result = gen.next()
  while (!result.done) {
    onProgress(result.value)
    result = gen.next()
  }
  return result.value
}
```

---

## Using Disposable for Cleanup

The `using` and `await using` declarations provide automatic cleanup at scope exit, eliminating the need for try/finally blocks. This is the preferred pattern for all resource management in km.

### When to Use `using` vs `await using`

| Declaration   | Cleanup Method            | Use For                           |
| ------------- | ------------------------- | --------------------------------- |
| `using`       | `[Symbol.dispose]()`      | Sync cleanup (DB close, etc.)     |
| `await using` | `[Symbol.asyncDispose]()` | Async cleanup (workers, watchers) |

### Disposable Objects in km

| Object        | Disposable Type   | Cleanup Action             |
| ------------- | ----------------- | -------------------------- |
| `Repo`        | `Disposable`      | Closes database connection |
| `FakeRepo`    | `Disposable`      | Closes in-memory database  |
| `MemoryStore` | `Disposable`      | Closes database            |
| `DiskStore`   | `Disposable`      | Closes database            |
| `Watcher`     | `AsyncDisposable` | Stops file watchers        |
| `ParsePool`   | `AsyncDisposable` | Terminates worker threads  |

### Synchronous Cleanup (Disposable)

For objects with sync cleanup (Repo, Store, FakeRepo):

```typescript
// ✅ GOOD - automatic cleanup via using
using repo = runGenerator(createRepo(repoDir))
const tasks = repo.data.getAllTasks()
// repo.close() called automatically at scope exit

// ❌ AVOID - manual try/finally
const repo = runGenerator(createRepo(repoDir))
try {
  const tasks = repo.data.getAllTasks()
} finally {
  repo.close()
}
```

### Async Cleanup (AsyncDisposable)

For objects with async cleanup (Watcher, ParsePool):

```typescript
// ✅ GOOD - automatic async cleanup
await using watcher = createWatcher(rootDir)
await watcher.start()
// watcher.stop() awaited automatically at scope exit

// ❌ AVOID - manual cleanup
const watcher = createWatcher(rootDir)
await watcher.start()
// ...
await watcher.stop()
```

### Combining Sync and Async Disposables

When using both types together, declare them in dependency order:

```typescript
async function watchRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  await using watcher = repo.watch()

  await watcher.start()
  watcher.on("change", (changes) => console.log(changes))

  // ... do stuff ...

  // At scope exit (reverse order):
  // 1. await watcher[Symbol.asyncDispose]() → await watcher.stop()
  // 2. repo[Symbol.dispose]() → repo.close()
}
```

### Context Managers vs Resource Owners

**Context managers** set up execution context (like AsyncLocalStorage) but don't own resources. They are NOT Disposable:

- `runWithDb(db, fn)` - Sets database context for `fn`, no cleanup needed
- `runWithKmDir(dir, fn)` - Sets directory context for `fn`, no cleanup needed

```typescript
// Context manager - just sets context, doesn't own resources
await runWithDb(db, async () => {
  // db is available via getDb() inside this callback
  const node = await getDb().get("SELECT ...")
})
// No cleanup - db was passed in, caller owns it
```

**Resource owners** create and own resources. They MUST be Disposable:

- `Repo` - Owns and closes database connection
- `Watcher` - Owns and stops file watchers
- `ParsePool` - Owns and terminates worker threads
- `MemoryStore`/`DiskStore` - Own and close database connection

```typescript
// Resource owner - creates and owns the db
using repo = runGenerator(createRepo(path))
// repo.close() called at scope exit, closing the db it owns
```

**Rule of thumb**: If your factory calls `new Database()`, `spawn()`, `watch()`, or similar resource-creating functions, the returned object MUST be Disposable.

---

## Disposable Pattern Implementation

### Sync Disposable

For objects with synchronous cleanup (database close, etc.):

```typescript
export interface Repo extends Disposable {
  close(): void
  [Symbol.dispose](): void
}

export function* createRepo(path: string): Generator<StepYield, Repo, unknown> {
  yield "Opening database"
  const db = openDatabase(path)

  return {
    close() {
      db.close()
    },
    [Symbol.dispose]() {
      this.close()
    },
  }
}

// Usage with 'using'
function processRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  const tasks = repo.data.getAllTasks()
  // repo[Symbol.dispose]() → repo.close() called at scope exit
}
```

### Async Disposable (Service)

For objects with async cleanup (file watchers, network connections):

```typescript
export interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping"
  start(): Promise<void>
  stop(): Promise<void>
}

export interface Watcher extends Service {
  on(event: "change", handler: (changes: FileChange[]) => void): void
  off(event: "change", handler: (changes: FileChange[]) => void): void
}

export function createWatcher(repo: Repo): Watcher {
  let status: Service["status"] = "stopped"
  const handlers = new Map<string, Set<Function>>()
  let fsWatcher: FSWatcher | null = null

  return {
    get status() {
      return status
    },

    async start() {
      if (status !== "stopped") return
      status = "starting"
      fsWatcher = watch(repo.path, handleChange)
      status = "running"
    },

    async stop() {
      if (status !== "running") return
      status = "stopping"
      await fsWatcher?.close()
      fsWatcher = null
      status = "stopped"
    },

    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    },

    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },

    async [Symbol.asyncDispose]() {
      await this.stop()
    },
  }

  function handleChange(path: string) {
    const change = { path, type: "modify" }
    handlers.get("change")?.forEach((h) => h([change]))
  }
}

// Usage with 'await using'
async function watchRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  await using watcher = repo.watch()

  await watcher.start()
  watcher.on("change", (changes) => console.log(changes))

  // ... do stuff ...

  // At scope exit:
  // 1. await watcher[Symbol.asyncDispose]() → await watcher.stop()
  // 2. repo[Symbol.dispose]() → repo.close()
}
```

---

## DisposableStack for Complex Cleanup

When you need to clean up multiple resources or combine disposables with cleanup callbacks, use `DisposableStack` (sync) or `AsyncDisposableStack` (async). These are part of the TC39 Explicit Resource Management proposal, supported in TypeScript 5.2+.

### Basic Usage

```typescript
// Multiple resources with mixed cleanup
await using stack = new AsyncDisposableStack()

// Add disposable resources - cleanup via Symbol.asyncDispose
const watcher = stack.use(createWatcher(dir))

// Add cleanup callbacks - runs in reverse order
stack.defer(() => setGlobalState(null))
stack.defer(async () => await someAsyncCleanup())

await watcher.start()
// ... do work ...
// Cleanup order: someAsyncCleanup(), setGlobalState(null), watcher.stop()
```

### When to Use

| Scenario                       | Use                                        |
| ------------------------------ | ------------------------------------------ |
| Single resource                | `using` / `await using` directly           |
| Multiple independent resources | Multiple `using` declarations              |
| Resources + cleanup callbacks  | `DisposableStack` / `AsyncDisposableStack` |
| Conditional cleanup            | `stack.defer()` with conditional logic     |
| Non-disposable with cleanup    | `stack.adopt(value, cleanup)`              |

### Methods

- `stack.use(disposable)` - Add a disposable, returns it for chaining
- `stack.adopt(value, cleanup)` - Add non-disposable with custom cleanup function
- `stack.defer(callback)` - Add cleanup callback (runs in reverse order)
- `stack.move()` - Transfer ownership to a new stack (original becomes empty)

### Practical Examples

**Combining disposables with state cleanup:**

```typescript
async function runWithTempState(repo: Repo) {
  await using stack = new AsyncDisposableStack()

  // Disposable resource
  const watcher = stack.use(repo.watch())

  // Non-disposable with cleanup
  const tempDir = stack.adopt(mkdtemp("/tmp/km-"), (dir) =>
    rmSync(dir, { recursive: true }),
  )

  // State cleanup callback
  const previousLogLevel = getLogLevel()
  stack.defer(() => setLogLevel(previousLogLevel))
  setLogLevel("debug")

  await watcher.start()
  // ... do work in tempDir with debug logging ...
  // Cleanup: restore log level, remove tempDir, stop watcher
}
```

**Conditional resource acquisition:**

```typescript
async function maybeWatch(repo: Repo, enableWatch: boolean) {
  await using stack = new AsyncDisposableStack()

  if (enableWatch) {
    const watcher = stack.use(repo.watch())
    await watcher.start()
  }

  // ... do work ...
  // Watcher only cleaned up if it was created
}
```

**Transferring ownership:**

```typescript
function createManagedResources(): AsyncDisposableStack {
  const stack = new AsyncDisposableStack()
  stack.use(createWatcher(dir1))
  stack.use(createWatcher(dir2))
  // Transfer ownership to caller - our stack is now empty
  return stack.move()
}

// Caller takes ownership
await using resources = createManagedResources()
```

---

## Dependency Injection

### Options Pattern

```typescript
export interface RepoOptions {
  /** Force memory mode even if .km/ exists */
  forceMemory?: boolean
  /** Skip initial file scan (for faster startup) */
  lazy?: boolean
  /** Dependency injection for testing */
  inject?: {
    database?: Database
    fs?: FileSystemInterface
  }
}

export function* createRepo(
  path: string,
  options?: RepoOptions,
): Generator<StepYield, Repo, unknown> {
  yield "Initializing database"
  const db = options?.inject?.database ?? openDatabase(path)
  const fs = options?.inject?.fs ?? realFs
  // ...
}
```

### Testing with DI

```typescript
import { describe, test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { createRepo, runGenerator } from "@km/storage"

describe("Repo", () => {
  test("queries nodes via DataStore", () => {
    // Inject in-memory database
    const mockDb = new Database(":memory:")
    mockDb.exec(`
      CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT);
      INSERT INTO nodes VALUES ('1', 'Test node');
    `)

    using repo = runGenerator(
      createRepo("/test", { inject: { database: mockDb } }),
    )

    expect(repo.data.getNode("1")?.content).toBe("Test node")
    expect(repo.data.getNode("999")).toBeNull()
    // repo.close() called automatically at scope exit
  })
})
```

---

## Composition

### Domain Object Dependencies

```typescript
// Repo is independent (root of dependency tree)
using repo = runGenerator(createRepo(path))

// Board takes DataStore and rootId
// Current: createBoardState(rootId, rootPath)
// Target: createBoard(repo.data, rootId)
const board = createBoard(repo.data, rootId)

// Watcher is created from Repo
const watcher = repo.watch()

// Config is accessed via Repo
const config = repo.config
```

### Full Application Composition

```typescript
async function main(repoPath: string) {
  // Create domain objects with explicit dependencies
  using repo = runGenerator(createRepo(repoPath))
  // Board takes DataStore and rootId
  const board = createBoard(repo.data, "@projects")

  // Watcher is optional (only for disk mode)
  if (repo.mode === "disk") {
    await using watcher = repo.watch()
    await watcher.start()
    watcher.on("change", (nodes) => {
      // Handle changed nodes - update board state as needed
    })

    // Run application with watcher active
    await runTui(board, repo.config)
    // watcher.stop() called automatically at scope exit
  } else {
    // Run application without watcher
    await runTui(board, repo.config)
  }

  // repo cleaned up by 'using' at scope exit
}
```

---

## Anti-Patterns

### Don't Mix Patterns

```typescript
// ❌ BAD - factory that also sets singletons
export function* createRepo(path: string): Generator<StepYield, Repo, unknown> {
  const repo = {
    /* ... */
  }
  _globalRepo = repo // Don't do this!
  return repo
}
```

### Don't Expose Internal State

```typescript
// ❌ BAD - exposes internal database
export interface Repo {
  db: Database // Don't expose this!
}

// ✅ GOOD - expose through capability interface
export interface Repo {
  readonly data: DataStore
  readonly files: FileTree | null
}

// Access database only through HasDatabase intersection type
export interface HasDatabase {
  readonly database: Database
}
```

### Don't Forget Cleanup

```typescript
// ❌ BAD - no cleanup path
export function* createRepo(path: string) {
  yield "Opening database"
  const db = openDatabase(path)
  return { data: createDBDataStore(db) }
  // db is never closed!
}

// ✅ GOOD - implement Disposable for automatic cleanup
export function* createRepo(path: string): Generator<StepYield, Repo, unknown> {
  yield "Opening database"
  const db = openDatabase(path)
  return {
    data: createDBDataStore(db),
    close() {
      db.close()
    },
    [Symbol.dispose]() {
      this.close()
    },
  }
}

// ✅ GOOD - use 'using' for automatic cleanup at call sites
function processRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  return repo.data.getNode("1")
  // repo.close() called automatically
}
```

---

## Migration Guide

When migrating existing code to domain objects:

1. **Identify the singleton/global** - Find `getDb()`, `getStore()`, etc.
2. **Create interface** - Define what operations are needed
3. **Create factory** - Return object implementing the interface
4. **Add DI options** - For testing
5. **Add Disposable** - If there's cleanup
6. **Update callers** - Pass domain object instead of using singleton
7. **Remove singleton** - Delete the global state

See bead `km-domain-objects` for the full migration plan.

---
description: Domain object patterns - factory functions, disposables, services
---

# Domain Object Patterns

**Keywords**: domain object, factory function, createVault, disposable, service, dependency injection, singleton

All major functionality MUST be exposed through **domain objects created by factory functions**. See @docs/dev/domain-objects.md for the complete guide and @docs/adr/002-domain-objects-refactor.md for architecture decisions.

## Principles

- **Factory functions** (not classes) - return plain objects with methods
- **No singletons** - all state owned by domain objects, passed via DI
- **Disposable lifecycle** - `Disposable` for sync cleanup, `AsyncDisposable` for async
- **Service interface** - for long-running objects with start/stop lifecycle

## Core Domain Objects

> **Note:** Per ADR-002, terminology will change: Vault → Repo, createVault → createRepo

| Object    | Factory                   | Lifecycle    | Purpose                     |
| --------- | ------------------------- | ------------ | --------------------------- |
| `Vault`   | `createVault()`           | `Disposable` | Storage, queries, mutations |
| `Board`   | `createBoard(data, root)` | plain object | Navigation state            |
| `Watcher` | `vault.watch()`           | `Service`    | File sync                   |
| `Config`  | `loadConfigObject()`      | plain object | Vault configuration         |

## Service Interface

For objects with start/stop lifecycle:

```typescript
interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping"
  start(): Promise<void>
  stop(): Promise<void>
}
```

## Factory Function Pattern

```typescript
// ✅ GOOD - factory returns plain object
export function createVault(path: string, options?: VaultOptions): Vault {
  // Internal state via closure
  const db = options?.inject?.database ?? openDatabase(path)
  let closed = false

  return {
    get path() {
      return path
    },

    getNode(id) {
      if (closed) throw new Error("Vault is closed")
      return queryNode(db, id)
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
}

// ❌ BAD - class with internal state
export class Vault {
  private db: Database
  constructor(path: string) {
    this.db = openDatabase(path)
  }
}

// ❌ BAD - singleton
let _db: Database | null = null
export function getDb() {
  if (!_db) throw new Error("Not initialized")
  return _db
}
```

## Generator Factories (Progress Reporting)

```typescript
// Single factory - always a generator
function* createVault(path: string): Generator<ProgressInfo, Vault> {
  yield { phase: "discover", current: 0, total: 0 }
  // ... load vault ...
  return vault
}

// Caller chooses consumption:
// A) With progress: for (const p of createVault(path)) spinner.update(p);
// B) Without:       const vault = runGenerator(createVault(path));
```

## Usage with Disposables

```typescript
// Sync disposable (Vault, Board)
function processVault(path: string) {
  using vault = runGenerator(createVault(path))
  const tasks = vault.getAllTasks()
  // vault.close() called automatically at scope exit
}

// Async disposable (Service like Watcher)
async function watchVault(path: string) {
  using vault = runGenerator(createVault(path))
  await using watcher = vault.watch()
  await watcher.start()
  // ... do stuff ...
  // watcher.stop() awaited, then vault.close() called
}
```

## Dependency Injection for Testing

```typescript
const mockDb = new Database(":memory:")
const vault = runGenerator(
  createVault("/test", {
    inject: { database: mockDb },
  }),
)
```

## Composition Principles

When designing composed domain objects:

1. **Representation, not peer** — FileTree is a representation of DataStore state, not a peer store
2. **Bundle transactional consistency** — nodes + blobs + events swap together → bundle them
3. **Separate independence** — Config doesn't change when swapping SQLite → PostgreSQL
4. **Optional when possible** — `files?: FileTree` means no file sync for daemon/API modes
5. **Factory naming** — `create{Implementation}{DomainObject}()`: `createDiskDataStore()`, `createMemFileTree()`

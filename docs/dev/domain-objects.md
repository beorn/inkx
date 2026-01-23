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
export interface Vault extends Disposable {
  readonly path: string;
  readonly mode: "memory" | "disk";
  getNode(id: string): KNode | null;
  close(): void;
}

export function createVault(path: string, options?: VaultOptions): Vault {
  // Internal state via closure (not class fields)
  const resolvedPath = resolvePath(path);
  const mode = detectMode(resolvedPath);
  const db = options?.inject?.database ?? openDatabase(mode, resolvedPath);
  let closed = false;

  // Return plain object with methods
  return {
    get path() { return resolvedPath; },
    get mode() { return mode; },

    getNode(id) {
      ensureNotClosed();
      return queryNode(db, id);
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    [Symbol.dispose]() {
      this.close();
    }
  };

  // Private helper (hoisted)
  function ensureNotClosed() {
    if (closed) throw new Error("Vault is closed");
  }
}
```

### Why Not Classes?

```typescript
// ❌ BAD - class with internal state
export class Vault {
  private db: Database;
  private closed = false;

  constructor(path: string) {
    this.db = openDatabase(path);
  }

  getNode(id: string) {
    return queryNode(this.db, id);
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
let _db: Database | null = null;
let _vaultPath: string | null = null;

export function initVault(path: string) {
  _db = openDatabase(path);
  _vaultPath = path;
}

export function getDb() {
  if (!_db) throw new Error("Vault not initialized");
  return _db;
}

export function getNode(id: string) {
  return queryNode(getDb(), id);
}

// Problems:
// - Hidden global state
// - Can't have multiple vaults open
// - Testing requires careful setup/teardown
// - Implicit dependencies
```

---

## Generator Factories for Progress

When loading involves multiple phases, use a generator factory:

```typescript
export function* createVault(
  path: string,
  options?: VaultOptions
): Generator<ProgressInfo, Vault, unknown> {
  // Phase 1: Discover
  yield { phase: "discover", current: 0, total: 0 };
  const files = discoverFiles(path);
  yield { phase: "discover", current: files.length, total: files.length };

  // Phase 2: Parse
  const events: Event[] = [];
  for (const [i, file] of files.entries()) {
    events.push(...parseFile(file));
    yield { phase: "parse", current: i + 1, total: files.length };
  }

  // Phase 3: Apply
  const db = createDatabase();
  for (const [i, event] of events.entries()) {
    applyEvent(db, event);
    yield { phase: "apply", current: i + 1, total: events.length };
  }

  // Return the vault
  return createVaultFromDb(db, path);
}
```

### Consuming Generator Factories

```typescript
// Option A: With progress reporting
for (const progress of createVault(path)) {
  spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`);
}
const vault = runGenerator(createVault(path)); // Get final value

// Option B: Silent (no progress)
const vault = runGenerator(createVault(path));

// Option C: Async wrapper (for promise-based APIs)
const vault = await toPromise(createVault(path));
```

### Helper Functions

```typescript
/** Run generator to completion, return final value */
export function runGenerator<T>(gen: Generator<unknown, T, unknown>): T {
  let result = gen.next();
  while (!result.done) {
    result = gen.next();
  }
  return result.value;
}

/** Run generator with progress callback */
export function runWithProgress<T>(
  gen: Generator<ProgressInfo, T, unknown>,
  onProgress: (info: ProgressInfo) => void
): T {
  let result = gen.next();
  while (!result.done) {
    onProgress(result.value);
    result = gen.next();
  }
  return result.value;
}
```

---

## Disposable Pattern

### Sync Disposable

For objects with synchronous cleanup (database close, etc.):

```typescript
export interface Vault extends Disposable {
  close(): void;
  [Symbol.dispose](): void;
}

export function createVault(path: string): Vault {
  const db = openDatabase(path);

  return {
    close() {
      db.close();
    },
    [Symbol.dispose]() {
      this.close();
    }
  };
}

// Usage with 'using'
function processVault(path: string) {
  using vault = runGenerator(createVault(path));
  const tasks = vault.getAllTasks();
  // vault[Symbol.dispose]() → vault.close() called at scope exit
}
```

### Async Disposable (Service)

For objects with async cleanup (file watchers, network connections):

```typescript
export interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping";
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface Watcher extends Service {
  on(event: "change", handler: (changes: FileChange[]) => void): void;
  off(event: "change", handler: (changes: FileChange[]) => void): void;
}

export function createWatcher(vault: Vault): Watcher {
  let status: Service["status"] = "stopped";
  const handlers = new Map<string, Set<Function>>();
  let fsWatcher: FSWatcher | null = null;

  return {
    get status() { return status; },

    async start() {
      if (status !== "stopped") return;
      status = "starting";
      fsWatcher = watch(vault.path, handleChange);
      status = "running";
    },

    async stop() {
      if (status !== "running") return;
      status = "stopping";
      await fsWatcher?.close();
      fsWatcher = null;
      status = "stopped";
    },

    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },

    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },

    async [Symbol.asyncDispose]() {
      await this.stop();
    }
  };

  function handleChange(path: string) {
    const change = { path, type: "modify" };
    handlers.get("change")?.forEach(h => h([change]));
  }
}

// Usage with 'await using'
async function watchVault(path: string) {
  using vault = runGenerator(createVault(path));
  await using watcher = vault.watch();

  await watcher.start();
  watcher.on("change", (changes) => console.log(changes));

  // ... do stuff ...

  // At scope exit:
  // 1. await watcher[Symbol.asyncDispose]() → await watcher.stop()
  // 2. vault[Symbol.dispose]() → vault.close()
}
```

---

## Dependency Injection

### Options Pattern

```typescript
export interface VaultOptions {
  /** Search for .km in parent directories (default: true) */
  searchAncestors?: boolean;
  /** Force full rebuild even if state exists (default: false) */
  force?: boolean;
  /** Dependency injection for testing */
  inject?: {
    database?: Database;
    fs?: FileSystemInterface;
  };
}

export function createVault(path: string, options?: VaultOptions): Vault {
  const db = options?.inject?.database ?? openDatabase(path);
  const fs = options?.inject?.fs ?? realFs;
  // ...
}
```

### Testing with DI

```typescript
import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createVault } from "./vault";

describe("Vault", () => {
  test("queries nodes", () => {
    // Inject in-memory database
    const mockDb = new Database(":memory:");
    mockDb.exec(`
      CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT);
      INSERT INTO nodes VALUES ('1', 'Test node');
    `);

    const vault = createVault("/test", { inject: { database: mockDb } });

    expect(vault.getNode("1")?.content).toBe("Test node");
    expect(vault.getNode("999")).toBeNull();

    vault.close();
  });
});
```

---

## Composition

### Domain Object Dependencies

```typescript
// Vault is independent (root of dependency tree)
const vault = runGenerator(createVault(path));

// Board depends on Vault
const board = createBoard(vault);

// Watcher is created from Vault
const watcher = vault.watch();

// Config is independent
const config = loadConfig(path);
```

### Full Application Composition

```typescript
async function main(vaultPath: string) {
  // Create domain objects with explicit dependencies
  using vault = runGenerator(createVault(vaultPath));
  using board = createBoard(vault);
  const config = loadConfig(vaultPath);

  // Watcher is optional (only for disk mode)
  let watcher: Watcher | null = null;
  if (vault.mode === "disk") {
    watcher = vault.watch();
    await watcher.start();
    watcher.on("change", () => board.refresh());
  }

  try {
    // Run application...
    await runTui(board, config);
  } finally {
    // Explicit cleanup for optional objects
    await watcher?.stop();
  }

  // vault and board cleaned up by 'using' at scope exit
}
```

---

## Anti-Patterns

### Don't Mix Patterns

```typescript
// ❌ BAD - factory that also sets singletons
export function createVault(path: string): Vault {
  const vault = { /* ... */ };
  _globalVault = vault;  // Don't do this!
  return vault;
}
```

### Don't Expose Internal State

```typescript
// ❌ BAD - exposes internal database
export interface Vault {
  db: Database;  // Don't expose this!
}

// ✅ GOOD - only expose operations
export interface Vault {
  getNode(id: string): KNode | null;
  updateNode(id: string, changes: Partial<KNode>): void;
}
```

### Don't Forget Cleanup

```typescript
// ❌ BAD - no cleanup path
export function createVault(path: string) {
  const db = openDatabase(path);
  return { getNode: (id) => queryNode(db, id) };
  // db is never closed!
}

// ✅ GOOD - explicit cleanup
export function createVault(path: string): Vault {
  const db = openDatabase(path);
  return {
    getNode: (id) => queryNode(db, id),
    close() { db.close(); },
    [Symbol.dispose]() { this.close(); }
  };
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

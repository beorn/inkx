# Architectural Principles

> **The thesis**: Compose domain objects with explicit dependencies.
> Everything else—testability, resource management, fast feedback—follows from this.

---

## The Story

We build software from **domain objects**—plain objects with methods, created by factory functions. Because we use factories (not classes or singletons), we can **pass dependencies explicitly**. Because dependencies are explicit, we can **swap implementations** and run tests in parallel (no shared state). Because we create objects, we must **dispose of them**—so we use `using` for automatic cleanup. Because dependencies are explicit, a missing one is a **programming error**—so we throw immediately, never fall back. Because we can swap implementations, **tests use in-memory infrastructure** and run in <5s. Because domain objects compose, our **architecture is layers** of composed objects. When two things sync, **one is authoritative** (DataStore) and one is a representation (FileTree)—sync is translation, not peer-to-peer copy. When we refactor, we **delete old code first**—because if fallbacks exist, they never get cleaned up.

**The causal chain:**

```
Domain objects via factory functions
         ↓ enables
Explicit dependencies (DI)
    ↓           ↓           ↓
Swappable    Fail fast    No shared state
    ↓           ↓           ↓
Fast tests   Bugs early   Parallel tests
    ↓
Disposable lifecycle (cleanup what you create)
    ↓
Layered architecture (layers are composed objects)
    ↓
Representation, not peers (clarify authority in composition)
    ↓
Delete first (because fallbacks never die)
```

---

## Part 1: Foundation (The Mental Model)

These are the core ideas. Everything else is a consequence.

### 1. Domain Objects via Composition

**The insight**: All functionality lives in domain objects (Repo, Board, Watcher).

**The pattern**: Factory functions return plain objects with methods.

```typescript
// Factory function returns plain object
export function createRepo(path: string, options?: RepoOptions): Repo {
  const db = options?.inject?.db ?? openDatabase(path)
  let closed = false

  return {
    get path() {
      return path
    },

    getNode(id) {
      if (closed) throw new Error("Repo is closed")
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
```

**Why not classes**:

- `this` binding issues (callbacks lose context)
- Inheritance creates coupling
- Harder to test (must instantiate whole class)

**Why not singletons**:

- Hidden coupling (who initialized it? when?)
- Can't parallelize tests (shared state)
- Can't swap implementations (hardcoded dependency)

```typescript
// ❌ BAD - singleton
let _db: Database | null = null
export function getDb() {
  if (!_db) throw new Error("Not initialized")
  return _db
}

// ❌ BAD - class with this binding
export class Repo {
  private db: Database
  constructor(path: string) {
    this.db = openDatabase(path)
  }
}

// ✅ GOOD - factory function
export function createRepo(path: string, options?: RepoOptions): Repo
```

---

### 2. Explicit Dependencies

**The insight**: If you need something, it must be passed in.

**The pattern**: Dependencies via options, with defaults for production.

```typescript
// Dependencies are explicit and swappable
const repo = createRepo("/path", {
  inject: {
    db: mockDb, // Swap for testing
    fileTree: memFs, // Swap for testing
  },
})
```

**Why it matters**:

- Dependencies are visible (read the signature, know the deps)
- Data flow is traceable (follow the arguments)
- Implementations are swappable (inject mocks, stubs, alternates)

**The anti-pattern**: Global getters, implicit initialization.

```typescript
// ❌ BAD - hidden dependency
function processNodes() {
  const db = getDb() // Where does this come from?
  // ...
}

// ✅ GOOD - explicit dependency
function processNodes(db: Database) {
  // Caller provides db, we use it
}
```

---

### 3. Representation, Not Peers

**The insight**: When A and B sync, one is usually a representation of the other—not a peer.

**The pattern**: FileTree is a human-editable representation of DataStore state. Sync is translation, not store-to-store copy.

```
┌────────────┐                  ┌─────────────┐
│ FileTree   │ ←──── sync ────→ │  DataStore  │
│  (files)   │    (translate)   │  (indexed)  │
└────────────┘                  └─────────────┘
   optional                        authoritative
   human-editable                  fast queries
   O(n) for queries                O(1)/O(log n)
```

**Why it matters**:

- Sync becomes translation with clear direction
- One side is authoritative (resolves conflicts)
- Semantics differ (files have no node IDs natively)

**The mistake**: Treating files and DB as interchangeable peers led to:

- Generic sync that didn't understand either format
- Complexity in conflict resolution
- Confusion about which was authoritative

---

## Part 2: Structure (How We Build)

These follow from the foundation.

### 4. Layered Architecture

```
┌─────────────────────────────────────────────────┐
│  APP        apps/ (TUI, CLI, REPL)              │
├─────────────────────────────────────────────────┤
│  BOARD      @km/board (cursor, selection, zoom) │
├─────────────────────────────────────────────────┤
│  TREE       @km/tree (queries, display names)   │
├─────────────────────────────────────────────────┤
│  STORAGE    @km/storage (SQLite, events, sync)  │
├─────────────────────────────────────────────────┤
│  PARSER     @km/markdown (markdown ↔ KNode)     │
├─────────────────────────────────────────────────┤
│  FILESYSTEM .md files (source of truth)         │
└─────────────────────────────────────────────────┘
```

**Rules**:

- Each layer calls only the layer directly below
- UI never touches filesystem directly
- All mutations flow through emit() (enables sync, undo, multi-window)

**Why**: Testable in isolation, clear boundaries, replaceable implementations.

---

### 5. Disposable Lifecycle

**The insight**: Resources acquired = resources released. If you create something, you must clean it up.

**The pattern**: `using` / `await using` for automatic cleanup.

```typescript
// Sync disposable
function processRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  const tasks = repo.getAllTasks()
  // repo.close() called automatically at scope exit
}

// Async disposable (Service)
async function watchRepo(path: string) {
  using repo = runGenerator(createRepo(path))
  await using watcher = repo.watch()
  await watcher.start()
  // watcher.stop() awaited, then repo.close() called
}
```

**Why**:

- No resource leaks (database connections, file handles)
- Clear ownership (creator is responsible for cleanup)
- Predictable teardown order (reverse of creation)

This is the resource management consequence of domain objects.

---

### 6. Fail Fast

**The insight**: Programming errors should throw immediately. No defensive fallbacks for internal code.

**The pattern**: Missing required dependency → throw. Invalid state → throw.

```typescript
// ❌ BAD - defensive fallback masks bug
function getNode(id?: string) {
  return db.get(id ?? defaultId) // What if id should never be undefined?
}

// ✅ GOOD - fail fast
function getNode(id: string) {
  if (!id) throw new Error("id is required")
  return db.get(id)
}
```

**When to throw vs. handle gracefully**:

| Scenario                      | Action                          |
| ----------------------------- | ------------------------------- |
| Missing required dependency   | **Throw** - programming error   |
| Invalid internal state        | **Throw** - invariant violation |
| User input validation failure | Handle gracefully               |
| External API failure          | Handle gracefully               |

**Why**: Bugs surface at the call site, not later as mysterious failures.

This is the error handling consequence of explicit dependencies.

---

## Part 3: Practice (How We Work)

Day-to-day patterns that support the structure.

### 7. Fast Tests by Default

**The insight**: Tests use in-memory infrastructure unless you explicitly opt into real.

**The pattern**: `withTestEnv()` provides isolated memory DB.

```typescript
// ✅ GOOD - in-memory, isolated, fast
await withTestEnv(async ({ db, repo, repoDir }) => {
  createTask(db, "Test task")
  expect(getNode(taskId)).toBeDefined()
})

// ❌ BAD - real infrastructure, slow, flaky
const db = new Database("/tmp/test.db")
```

**Why**: <5s feedback loop enables TDD. Parallel tests (no shared state).

**Target**: `bun run test:fast` < 5 seconds.

This is the testing consequence of explicit dependencies.

---

### 8. Delete First, Fix Second

**The insight**: Remove old patterns, then fix all consumers. Don't add backwards compatibility shims.

**The pattern**: Comment out with stern warnings, run `tsc`, fix all breaks.

```typescript
// ============================================================================
// ⛔ DEPRECATED: getDb() singleton - DO NOT RE-ENABLE
// ============================================================================
// ❌ DO NOT:
// - Uncomment "temporarily" to make things work
// - Add fallbacks like `options?.db ?? getDb()`
//
// ✅ INSTEAD:
// - Pass db explicitly: createRepo(path, { inject: { db } })
// - Tests: use env.db from withTestEnv()
// ============================================================================

/*
export function getDb() { ... }
*/
```

**Why**: Backwards compat shims never get cleaned up. If fallbacks exist, old patterns persist forever.

This is the refactoring consequence of explicit dependencies.

---

### 9. Important Logic First

**The insight**: Main flow at top of file/function, helpers after return.

**The pattern**: Use JavaScript hoisting to write code in reading order.

```typescript
// ✅ GOOD - main logic first, helpers after return
function processRepo() {
  const path = validatePath(repoPath)
  const db = loadDatabase(path)
  return { path, db }

  // Implementation details after return (hoisted)
  function validatePath(p: string) {
    /* ... */
  }
  function loadDatabase(p: string) {
    /* ... */
  }
}

// Pure helpers at module level - BOTTOM of file
function formatDate(d: Date): string {
  /* ... */
}
```

**File layout**:

1. Imports
2. Exports / re-exports
3. **Main components/functions** ← Reader starts here
4. Helper functions
5. Constants/config

**Why**: Readers start at what matters, not implementation details.

---

## Part 4: Architecture for AI-Assisted Development

These principles matter MORE when working with LLM coding agents.

### Why LLMs Amplify Architecture Problems

LLM coding agents have specific constraints:

- **No persistent memory** — Each session starts fresh, will use whatever patterns exist in the code
- **Limited context** — Can't see the whole codebase, architecture must be locally obvious
- **Pattern matching** — Will copy existing patterns, good or bad
- **Fast iteration** — Can leverage <5s test loops extremely well

### Legacy Code as Virus

**Any inconsistency is a virus that LLMs will propagate.**

When an LLM sees two ways to do something, it may copy either. If one is legacy/deprecated, you've now spread it. The old pattern isn't just technical debt—it's actively infectious.

```
Legacy pattern exists → LLM copies it → More legacy code → More likely to be copied
```

This is why "delete first" isn't optional—it's **quarantine**. Deprecation warnings don't work because LLMs don't read warnings, they read code.

### The Quality Plateau

**Goal: Reach a state where there's only ONE way to do things.**

Below the plateau, every inconsistency is a potential infection vector. Above it, LLMs can only copy good patterns because that's all that exists.

```
                    ╭─────────────────────── Quality Plateau
                   ╱                         (only good patterns exist)
Code Quality      ╱
                 ╱  ← Merciless refactoring
                ╱     (continuous, never stop)
───────────────╱
              ↑
              Inconsistencies = infection vectors
```

**Merciless refactoring** is not a phase—it's continuous. Any time you see:

- Two ways to do the same thing → consolidate to one
- A fallback pattern → delete it and fix callers
- A `// TODO` or `// legacy` comment → fix it now or create a tracked issue

### Principles That Matter More with LLMs

**Delete first, fix second** — If old patterns exist, LLMs will use them. The only way to prevent old patterns is to make them impossible.

**Fast tests** — LLMs iterate extremely quickly. A 5-second test loop means an agent can try 100 approaches in the time a human tries 10. Fast feedback is a force multiplier.

**Obvious right way** — When there's one clear pattern, LLMs follow it. When there are multiple ways, they guess. Consolidate patterns so the right way is obvious from any file.

**Fail fast** — Silent failures compound across sessions. If something's wrong, it must fail loudly NOW so the agent can fix it, not silently corrupt state for a future session to discover.

**Explicit dependencies** — LLMs can't infer that `getDb()` requires prior initialization. Explicit `createRepo(path, { db })` is self-documenting and works without hidden context.

### The LLM-Friendly Codebase

- One obvious way to do each thing (quality plateau)
- Fast feedback loops (<5s tests)
- Loud failures (throw, don't log)
- No legacy patterns (quarantined/deleted)
- Self-documenting APIs (explicit deps, no magic)
- Continuous merciless refactoring (maintain the plateau)

---

## Industry Comparison

| km Principle      | Common Alternative   | Why We Chose Differently                             |
| ----------------- | -------------------- | ---------------------------------------------------- |
| Factory functions | Classes              | Classes have `this` binding issues, harder to mock   |
| No singletons     | Service locator      | Singletons hide dependencies, block parallel tests   |
| Composition       | Peer stores          | Peers make sync generic when it's really translation |
| Fail fast         | Defensive coding     | Defensive coding masks bugs until production         |
| Delete first      | Deprecation warnings | Warnings are ignored forever (especially by LLMs)    |
| In-memory tests   | Real infrastructure  | Real infra is slow, flaky, blocks parallel execution |

---

## Lessons Learned

Real stories from km development that shaped these principles.

### The Backwards Compatibility Trap (Jan 25, 2025)

Commit `8014128` introduced "singleton wrappers for backwards compatibility":

> This maintains backwards compatibility for existing code while migrating to the new dependency injection pattern.

**What happened**: With fallbacks available, old patterns persisted. Migration never completed. Multiple commits patched symptoms instead of removing the root cause.

**The lesson**: Make fallbacks impossible by deleting the code first. The old code cannot be used as a crutch if it doesn't exist.

### FileTree as Peer DataStore

The original design treated FileTree and DataStore as peers implementing the same `Store` interface.

**What happened**:

- Performance asymmetry broke the contract (FileTree is O(n), DataStore is O(1))
- Semantic mismatch (files don't naturally have node IDs)
- Sync became too generic (when it's really translation)

**The lesson**: When A and B sync, ask: are they peers or is one a representation? FileTree is a representation of DataStore, not a peer.

### The km-me0n Incident

`km sync --to-fs` once corrupted source files by converting them to markdown stubs.

**What happened**: Sync operation wrote to real files instead of test fixtures.

**The lesson**:

- Tests MUST use isolated directories (`/tmp/kmtest-*`)
- E2E safety tests verify sync never touches non-`.md` files
- Fast tests use in-memory infrastructure

---

## Quick Reference

### Do

```typescript
// Factory function with explicit deps
const repo = createRepo(path, { inject: { db } })

// using for automatic cleanup
using repo = createRepo(path)

// Throw on programming errors
if (!id) throw new Error("id required")

// In-memory tests
await withTestEnv(async ({ db }) => { ... })

// Delete old code, fix callers
// (not: add deprecation warning)
```

### Don't

```typescript
// ❌ Singletons
const db = getDb()

// ❌ Classes with this binding
class Repo { constructor() { this.db = ... } }

// ❌ Defensive fallbacks
const id = maybeId ?? defaultId

// ❌ Real infrastructure in tests
const db = new Database("/tmp/real.db")

// ❌ Backwards compat shims
export { oldFunction as newFunction }
```

### Test Commands

```bash
bun run test:fast    # <5s - use during development
bun run test:all     # Full suite - before commits
bun fix              # Lint + format
```

---

## See Also

- [concepts.md](concepts.md) — What km is (nodes, modes, status)
- [architecture.md](architecture.md) — System architecture (layers, data flow)
- [ADR-002](adr/archive/002-domain-objects-refactor.md) — Historical context on domain object architecture
- [dev/testing.md](dev/testing.md) — Detailed testing guide

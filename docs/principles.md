# Architectural Principles

> **The thesis**: Build from composable pieces. Maintain quality through fast feedback. Write for humans and LLMs.

---

## Overview

1. **Composability** — Build from simple, reusable pieces
   - Domain Objects via Composition
   - Explicit Dependencies
   - Layered Architecture
   - Disposable Lifecycle
   - Async Generator Pipelines
2. **Fast Feedback Enables Quality** — Keep the loop tight to maintain extreme quality
   - Fail Fast
   - Fast Tests by Default
   - Delete First, Fix Second
3. **Readability Matters** — Make the "right way" locally obvious
   - Important Logic First
4. **Building for LLMs** — Why these principles matter even more with AI agents
5. **Context** — Industry comparison and lessons learned

These principles reinforce each other: composable pieces enable fast tests, fast tests protect quality, and quality makes LLM-assisted development safe.

---

## Part 1: Composability

Software is built from composable pieces. Both **structures** (objects) and **flows** (pipelines) should compose.

### Objects

Domain objects are plain objects created by factory functions. They compose via explicit dependencies, enabling testing, swapping, and isolation.

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

**Composition example**:

```typescript
// Repo composes DataStore + FileTree + Config
const repo = createRepo(path, {
  inject: {
    db: mockDb, // Swap database implementation
    fileTree: memFs, // Swap filesystem implementation
  },
})
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

### Rejected Patterns

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

### 3. Layered Architecture

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

### 4. Disposable Lifecycle

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

**Benefits**:

- No resource leaks (database connections, file handles)
- Clear ownership (creator is responsible for cleanup)
- Predictable teardown order (reverse of creation)

---

### Flows

Async generators make multi-stage data processing composable. Each stage is a function that yields items, and stages compose like building blocks.

### 5. Async Generator Pipelines

**The insight**: Multi-stage data processing composes naturally with async generators.

**The pattern**: Each stage is a generator. Stages that need buffering exhaust upstream first.

```typescript
// Streaming stage - yields as items arrive
async function* parseFiles(sources, pool) {
  for await (const result of pool.stream(sources)) {
    yield transform(result)
  }
}

// Buffering stage - exhausts upstream, then yields
async function* applyNodes(upstream, db) {
  const files = []
  for await (const file of upstream) {
    files.push(file) // Collect all
  }

  db.run("BEGIN IMMEDIATE")
  for (const file of files) {
    yield apply(file) // Then emit
  }
  db.run("COMMIT")
}

// Composition is natural
const parsed = parseFiles(sources, pool)
const applied = applyNodes(parsed, db)
const resolved = resolveLinks(applied, db)

for await (const link of resolved) {
  // Process as they arrive
}
```

**Real example** from km:

Both loading and syncing use the same composable pipeline:

```
Sources (file paths)
    ↓
parseFiles() — Streaming: yields as workers complete
    ↓
applyNodes() — Buffering: transaction boundary
    ↓
resolveLinks() — Buffering: needs all nodes first
    ↓
applyLinks() — Buffering: batch INSERT
```

See [ref/pipelines.md](ref/pipelines.md) for the full implementation.

**When to use**:

- Multi-stage data transformation
- Parallel processing with serial application
- Progress-reportable batch operations

**The anti-pattern**: Callback-based or Promise.all with intermediate arrays.

```typescript
// ❌ BAD - intermediate arrays, no composition
const parsed = await Promise.all(files.map(f => parse(f)))
const applied = await Promise.all(parsed.map(p => apply(p)))
const resolved = await Promise.all(applied.map(a => resolve(a)))

// ✅ GOOD - composable generators
const pipeline = resolveLinks(applyNodes(parseFiles(sources)))
for await (const item of pipeline) { ... }
```

---

## Part 2: Fast Feedback Enables Quality

Fast feedback enables extreme quality: tests run in <5s, programming errors throw loudly, and failures happen at the call site—not in production.

Bad quality propagates and multiplies, especially with LLMs. Fast feedback is how you keep the codebase clean.

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

---

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

**Target**: `bun run test:fast` < 5 seconds.

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

---

## Part 3: Readability Matters

Code is read more than written.

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

## Part 4: Building for LLMs

These principles matter MORE when working with AI coding agents.

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

**Composability** — When pieces compose cleanly, LLMs can combine them correctly. When composition is implicit or has multiple paths, LLMs guess wrong.

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

## Part 5: Context

### Industry Comparison

| km Principle      | Common Alternative   | Why We Chose Differently                             |
| ----------------- | -------------------- | ---------------------------------------------------- |
| Factory functions | Classes              | Classes have `this` binding issues, harder to mock   |
| No singletons     | Service locator      | Singletons hide dependencies, block parallel tests   |
| Composition       | Peer stores          | Peers make sync generic when it's really translation |
| Fail fast         | Defensive coding     | Defensive coding masks bugs until production         |
| Delete first      | Deprecation warnings | Warnings are ignored forever (especially by LLMs)    |
| In-memory tests   | Real infrastructure  | Real infra is slow, flaky, blocks parallel execution |
| Async generators  | Promise.all chains   | Generators compose, arrays don't                     |

---

### Lessons Learned

Real stories from km development that shaped these principles.

- **The Backwards Compatibility Trap** — Singleton wrappers for "backwards compatibility" prevented migration from ever completing. The lesson: delete first, fix second. See [lesson-backwards-compatibility.md](ref/lesson-backwards-compatibility.md)

- **FileTree as Peer DataStore** — Treating FileTree and DataStore as interchangeable peers led to performance asymmetry, semantic mismatch, and overly generic sync logic. The lesson: identify representation vs peer. See [lesson-filetree-as-peer.md](ref/lesson-filetree-as-peer.md)

- **The km-me0n Incident** — `km sync --to-fs` corrupted source files by writing to real files instead of test fixtures. The lesson: tests use isolated directories, in-memory infrastructure. See [lesson-km-me0n.md](ref/lesson-km-me0n.md)

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

// Compose generators
const pipeline = resolveLinks(applyNodes(parseFiles(sources)))
for await (const item of pipeline) { ... }
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

// ❌ Promise.all chains
const resolved = await Promise.all(items.map(resolve))
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
- [ref/pipelines.md](ref/pipelines.md) — Async generator pipeline case study
- [ADR-002](adr/archive/002-domain-objects-refactor.md) — Historical context on domain object architecture
- [dev/testing.md](dev/testing.md) — Detailed testing guide

# How km Works

> **The thesis**: Build from composable pieces. Maintain quality through fast feedback. Write for humans and LLMs.

## Why These Choices

These principles came from building a real system—km—that needed to be maintainable by both humans and AI agents. We learned that **architectural patterns matter more** when you're iterating quickly: a bad pattern proliferates across 50 files before you notice it. We learned that **fast feedback is everything**: 5-second tests mean you can try 100 approaches while waiting for one slow test suite. We learned that **code is read more than written**: when an LLM (or new contributor) opens a file, they should immediately see what it does and how to extend it.

The result is a codebase where **one obvious way** to do each thing eliminates choice paralysis. Where **composable pieces** (plain objects, factory functions, async generators) combine predictably. Where **fast tests** protect quality without slowing development. Where **failing loud** catches bugs at the call site instead of in production.

These aren't theoretical ideals—they're practical tools that emerged from real problems. The "Lessons Learned" section documents the mistakes that taught us why each principle matters.

## How to Use This Doc

If you're new, read Part 1 (Composable Domain Objects & Flows) and Part 2 (The Fast Feedback Loop) to understand the foundation. If you're implementing, follow Part 3 (Code for Humans) while coding. If you're using AI agents, read Part 4 (Coding with AI Agents) so you know what patterns must stay unique. If you're proposing changes, use Part 5 (Runbook) for the decision rubric and enforcement checklist.

The principles reinforce each other: composable pieces enable fast tests, fast tests protect quality, and quality makes AI-assisted development safe.

---

## Overview

1. **Composable Domain Objects & Flows** — Build from simple, reusable pieces
   - Principle: Plain Language
   - Principle: Plain Objects
   - Principle: Lego Blocks
   - Principle: Inject All Dependencies
   - Principle: Organize Objects Into Layers
   - Principle: Organize Flows Too
2. **The Fast Feedback Loop** — Keep the loop tight to maintain extreme quality
   - Principle: Fail Loud, Fail Now
   - Principle: 5-Second Test Loops
   - Principle: Quarantine and Delete
3. **Code for Humans** — Make the "right way" locally obvious
   - Principle: Inverted Pyramid
   - Naming Conventions
   - No Hidden Side Effects
   - Local Reasoning
   - API Boundaries
4. **Coding with AI Agents** — Why these principles matter more with AI
5. **Runbook** — How we keep principles alive
   - What We're NOT Doing
   - Before You Add Something New
   - How We Keep This Real

---

## Contents

- [Overview](#overview)
- [Part 1: Composable Domain Objects & Flows](#part-1-composable-domain-objects--flows)
  - [Principle: Plain Language](#principle-plain-language)
  - [Principle: Lego Blocks](#principle-lego-blocks)
  - [Principle: Plain Objects, Factory Functions](#principle-plain-objects-factory-functions)
  - [Principle: Organize Objects Into Layers](#principle-organize-objects-into-layers)
  - [Principle: Compose Flows using Generators](#principle-compose-flows-using-generators)
- [Part 2: The Fast Feedback Loop](#part-2-the-fast-feedback-loop)
  - [Principle: Fail Loud, Fail Now](#principle-fail-loud-fail-now)
  - [Principle: 5-Second Test Loops](#principle-5-second-test-loops)
  - [Principle: Quarantine and Delete](#principle-quarantine-and-delete)
- [Part 3: Code for Humans](#part-3-code-for-humans)
  - [Principle: Inverted Pyramid](#principle-inverted-pyramid)
  - [Naming Conventions](#naming-conventions)
  - [No Hidden Side Effects](#no-hidden-side-effects)
  - [Local Reasoning](#local-reasoning)
  - [API Boundaries](#api-boundaries)
- [Part 4: Coding with AI Agents](#part-4-coding-with-ai-agents)
  - [Why LLMs Amplify Architecture Problems](#why-llms-amplify-architecture-problems)
  - [Legacy Code as Virus](#legacy-code-as-virus)
  - [The Quality Plateau](#the-quality-plateau)
  - [Principles That Matter More with LLMs](#principles-that-matter-more-with-llms)
  - [The LLM-Friendly Codebase](#the-llm-friendly-codebase)
- [Part 5: Runbook](#part-5-runbook)
  - [What We're NOT Doing](#what-were-not-doing)
  - [Before You Add Something New](#before-you-add-something-new)
  - [How We Keep This Real](#how-we-keep-this-real)
- [Quick Reference](#quick-reference)
  - [Do](#do)
  - [Don't](#dont)
  - [Test Commands](#test-commands)
- [See Also](#see-also)

---

## Part 1: Composable Domain Objects & Flows

Software is built from composable pieces. Both **structures** (objects) and **flows** (pipelines) should compose.

Domain objects are plain objects created by factory functions. They compose via explicit dependencies, enabling testing, swapping, and isolation.

### Principle: Plain Language

**The insight**: Names should come from the problem domain, not the implementation.

**The pattern**: A narrative written using actual type names should read naturally.

**Example narrative**: "A Repo loads Nodes from files. The Board displays Nodes and handles Commands. The Watcher detects file changes and triggers sync."

If your narrative needs technical jargon to make sense, the names are wrong.

**Why**: Domain language makes code self-documenting and reduces onboarding time. New contributors (human or AI) can understand the system by reading type names.

---

### Principle: Plain Objects, Factory Functions

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

**Why not classes**:

- **Creates type friction**: Classes don't compose with plain objects—can't JSON.stringify instances, can't spread without losing methods, can't pass through IPC without custom serialization
- **Reduces interoperability**: Every class instance needs special handling for common operations (cloning, merging, debugging)
- TypeScript types are algebraic and work great with plain objects—no need for classes
- Classes add visual clutter (constructor, `this`, visibility keywords)
- Classes add another abstraction we don't need (we already have objects)
- `this` binding issues (callbacks lose context)
- Inheritance creates coupling

```typescript
// ❌ BAD - class with this binding
export class Repo {
  private db: Database
  constructor(path: string) {
    this.db = openDatabase(path)
  }
}

// ✅ GOOD - factory function (see above)
```

**Infrastructure Class Exception**:

Infrastructure classes that extend EventEmitter or manage low-level resources are acceptable when:

- Performance-critical (worker thread management, file system operations)
- Event-based (standard EventEmitter pattern for pub/sub)
- Internal infrastructure (not domain objects)

Examples in km:

- `SyncManager extends EventEmitter` — event-based sync coordination
- `WriteQueue extends EventEmitter` — debounced write operations
- `FileSystemWatcher extends EventEmitter` — file system monitoring
- `ParsePool` — worker thread pool management
- `DisposableStore` — disposable resource container

```typescript
// ✅ ACCEPTABLE - infrastructure class extending EventEmitter
export class SyncManager extends EventEmitter {
  constructor(config: SyncConfig) {
    super()
    // Event-based infrastructure
  }
}
```

**Method count guidance**: Infrastructure classes can have many methods when they're implementing a well-defined API contract (e.g., Yoga flexbox API with 40+ property setter/getter pairs). The key question is **coherence**: do all methods serve the same narrow purpose? A 65-method layout engine is acceptable if all methods are layout-related. A 20-method class handling authentication, logging, and file I/O would not be.

Domain objects (Repo, Board, Watcher) must still use factory functions.

---

### Principle: Lego Blocks

**The insight**: Use the fewest possible building blocks to maximize interoperability. Every additional abstraction type creates impedance mismatch.

**The pattern**: Stick to plain objects, functions, and async generators. Inject all dependencies explicitly.

**Minimize types, maximize interoperability**:

Every type you add creates friction:

- Classes don't compose with plain objects
- Can't JSON.stringify class instances
- Can't spread without losing methods
- Can't pass through IPC without custom serialization
- Need special handling for cloning, merging, debugging

**Plain objects work everywhere**: JSON, IPC, spread operators, Object.assign, testing, debugging.

**Why**: Fewer types means less cognitive overhead and more natural composition.

**No magic, no globals, no singletons**:

If you need something, pass it in explicitly:

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

// ✅ GOOD - explicit dependency (see above)
```

#### Technique: `using` for Cleanup

When you inject dependencies, you own their lifecycle. The `using` keyword ensures automatic cleanup.

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

**Why this relates to DI**: Resources you create are dependencies you manage. Lifecycle management is part of dependency management.

---

### Principle: Organize Objects Into Layers

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

**Why**: Testable in isolation, clear boundaries, replaceable implementations. Each layer can be understood independently, reducing cognitive overhead.

---

### Principle: Compose Flows using Generators

Like objects, flows benefit from composition. Async generators make multi-stage data processing composable—each stage is a function that yields items, and stages compose like building blocks.

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

## Part 2: The Fast Feedback Loop

Fast feedback enables extreme quality: tests run in ~11s, programming errors throw loudly, and failures happen at the call site—not in production.

Bad quality propagates and multiplies, especially with LLMs. Fast feedback is how you keep the codebase clean.

### Principle: Fail Loud, Fail Now

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

### Principle: 5-Second Test Loops

**The insight**: Tests use in-memory infrastructure unless you explicitly opt into real.

**The pattern**: `withTestEnv()` provides isolated memory DB.

Tests are **executable specifications** documenting behavior. Fast tests enable constant verification that the system works as specified.

```typescript
// ✅ GOOD - in-memory, isolated, fast
await withTestEnv(async ({ db, repo, repoDir }) => {
  createTask(db, "Test task")
  expect(getNode(taskId)).toBeDefined()
})

// ❌ BAD - real infrastructure, slow, flaky
const db = new Database("/tmp/test.db")
```

**Target**: `bun run test:fast` ~11 seconds.

---

### Principle: Quarantine and Delete

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

## Part 3: Code for Humans

Code is read more than written. Names should use the end-user's domain language so a narrative describing the system reads naturally.

### Principle: Inverted Pyramid

**The insight**: Main flow at top of file/function, helpers after return.

**The pattern**: Use JavaScript hoisting to write code in reading order.

This is **literate programming**: code as narrative for humans. The most important logic appears first, implementation details follow naturally.

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

### Naming Conventions

**Domain objects**: `createX()` factory functions, always return plain objects.

**Options shape**: `XOptions` type with optional `inject` field for dependencies.

**Inject fields**: Match the dependency name (`db`, `fileTree`, `emitter`).

```typescript
// ✅ GOOD - consistent naming
function createRepo(path: string, options?: RepoOptions): Repo
function createWatcher(repo: Repo, options?: WatcherOptions): Watcher

interface RepoOptions {
  inject?: {
    db?: Database
    fileTree?: FileTree
  }
}
```

---

### No Hidden Side Effects

**The rule**: Module initialization must not perform work.

Imports should be side-effect free. No "magic" happens just from importing a module.

```typescript
// ❌ BAD - side effect on import
let _globalState = initializeExpensiveState()

export function useGlobal() {
  return _globalState
}

// ✅ GOOD - explicit initialization
export function createGlobalState() {
  return initializeExpensiveState()
}
```

**Why**: Hidden initialization makes testing hard and violates explicit dependencies.

---

### Local Reasoning

**The rule**: Reading one function should not require understanding distant code.

- No action-at-a-distance (globals, shared mutable state)
- No implicit preconditions (functions document what they need)
- Contracts are explicit (TypeScript types + runtime checks)

```typescript
// ❌ BAD - requires understanding global state
function processNode() {
  const db = getCurrentDb() // Where? When initialized?
  // ...
}

// ✅ GOOD - dependencies are parameters
function processNode(db: Database, node: KNode) {
  if (!node.id) throw new Error("node.id required")
  // ...
}
```

---

### API Boundaries

**The rule**: Validate at public API boundaries, throw on internal invariants.

Public APIs (functions called from outside your package) should validate inputs gracefully. Internal functions should fail fast.

```typescript
// ❌ BAD - validates everywhere
export function processNode(db: Database, node?: KNode) {
  if (!node) return null // Defensive
  if (!node.id) return null // Defensive
  return db.get(node.id)
}

function applyNode(db: Database, node?: KNode) {
  if (!node) return // Defensive internally too
  // ...
}

// ✅ GOOD - validate at boundary, throw internally
export function processNode(db: Database, node?: KNode): KNode | null {
  if (!node) return null // Public API: graceful
  return applyNode(db, node)
}

function applyNode(db: Database, node: KNode) {
  if (!node.id) throw new Error("node.id required") // Internal: fail fast
  return db.get(node.id)
}
```

**Where to validate vs throw**:

| Layer          | Validation Strategy          |
| -------------- | ---------------------------- |
| Public API     | Validate, return null/error  |
| Internal       | Throw on missing/invalid     |
| Cross-package  | Validate at package boundary |
| Within-package | Throw on programmer errors   |

**Why**: External callers get graceful errors. Internal bugs surface immediately.

---

## Part 4: Coding with AI Agents

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

**"Legacy" means**:

- Deprecated code patterns
- Compatibility shims (`export { oldFunction as newFunction }`)
- Fallback patterns (`const x = newWay() ?? oldWay()`)
- Adapter layers that maintain old interfaces
- Any code that exists only for backwards compatibility

```
Legacy pattern exists → LLM copies it → More legacy code → More likely to be copied
```

This is why "Quarantine and Delete" isn't optional—it's **quarantine**. Deprecation warnings don't work because LLMs don't read warnings, they read code.

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

These principles exist in Parts 1-3 because they're universal. But LLMs suffer MORE from violations because of their specific constraints: no persistent memory, limited context, and pure pattern matching.

**[Principle: Plain Objects, Factory Functions](#principle-plain-objects-factory-functions)** — LLMs can't track hidden state or method inheritance across files. Plain objects with explicit dependencies are self-documenting.

**[Principle: Lego Blocks](#principle-lego-blocks)** — LLMs can't infer that `getDb()` requires prior initialization. Explicit `createRepo(path, { db })` works without hidden context. Minimal types (plain objects, functions, generators) reduce impedance mismatch.

**[Principle: Quarantine and Delete](#principle-quarantine-and-delete)** — If old patterns exist, LLMs will use them. With no memory of "this is deprecated," the only way to prevent old patterns is to make them impossible.

**[Principle: 5-Second Test Loops](#principle-5-second-test-loops)** — LLMs iterate extremely quickly. A 5-second test loop means an agent can try 100 approaches in the time a human tries 10. Fast feedback is a force multiplier.

**[Principle: Fail Loud, Fail Now](#principle-fail-loud-fail-now)** — Silent failures compound across sessions. LLMs have no persistent memory, so if something's wrong, it must fail loudly NOW so the current agent can fix it, not silently corrupt state for a future session to discover.

**One obvious way** (from [The Quality Plateau](#the-quality-plateau)) — When there's one clear pattern, LLMs follow it. When there are multiple ways, they guess. Pattern matching requires pattern consistency.

### The LLM-Friendly Codebase

A codebase optimized for LLM agents has:

- **One obvious way** to do each thing ([The Quality Plateau](#the-quality-plateau))
- **Fast feedback loops** (<5s tests - [Principle: 5-Second Test Loops](#principle-5-second-test-loops))
- **Loud failures** (throw, don't log - [Principle: Fail Loud, Fail Now](#principle-fail-loud-fail-now))
- **No legacy patterns** (quarantined/deleted - [Principle: Quarantine and Delete](#principle-quarantine-and-delete))
- **Self-documenting APIs** (explicit deps - [Principle: Lego Blocks](#principle-lego-blocks))
- **Continuous merciless refactoring** to maintain the plateau

---

## Part 5: Runbook

How we keep principles alive over time.

### What We're NOT Doing

What we're **not** optimizing for. These clarify tradeoffs and prevent endless debates.

- **Not optimizing for**: OO purity or class-based patterns — We use factories and plain objects
- **Not optimizing for**: Zero allocations / micro-optimizations — Clarity over micro-performance
- **Not optimizing for**: Framework compatibility at all costs — Choose patterns that fit our needs
- **Not optimizing for**: Backwards compatibility inside the codebase — Quarantine and Delete
- **Not optimizing for**: Maximum generality — Solve today's problems, not hypothetical futures
- **Not optimizing for**: Minimal lines of code — Explicit and clear beats clever and terse

---

### Before You Add Something New

Before adding a new domain object or subsystem, answer these questions:

**Composability**:

- What explicit dependencies does it need?
- What other objects does it compose with?
- Can it be tested in isolation?

**Lifecycle**:

- How is it created? (factory function)
- How is it cleaned up? (disposable)
- What resources does it own?

**Failure modes**:

- What happens if dependencies are missing? (throw)
- What happens if used after disposal? (throw)
- What invariants must hold? (assert/throw)

**Testing**:

- Can tests use in-memory infrastructure?
- Does it support dependency injection?
- Can it run in <100ms per test?

**Async generators** (if applicable):

- Which stages are streaming? (yield as items arrive)
- Which stages are buffering? (exhaust upstream first)
- Where are transaction boundaries?

If you can't answer these clearly, the design needs more work.

---

### How We Keep This Real

How we keep principles true over time.

**Automated checks**:

- `bun run test:fast` must stay <5s (enforced in CI)
- ESLint rules: no deprecated code allowed in-tree
- TypeScript strict mode: catch type errors early

**Code review checklist**:

- [ ] Domain objects use factory functions; infrastructure classes (if needed) extend EventEmitter
- [ ] Dependencies passed explicitly via `inject` option
- [ ] Disposable resources use `Symbol.dispose`
- [ ] Programming errors throw immediately (fail loud, fail now)
- [ ] Tests use `withTestEnv()` for in-memory infrastructure
- [ ] No backwards compatibility shims or deprecated code
- [ ] Important logic at top of file, helpers after

**One-way doors** (delete, don't deprecate):

- Old patterns are commented out with stern warnings, not soft-deprecated
- No `getX()` singleton fallbacks allowed
- If a pattern is wrong, remove it completely—don't add a "better" alternative alongside it

**Templates** (make the right thing easy):

- `createX()` factory with `XOptions` type
- `Symbol.dispose` for cleanup
- `withTestEnv()` for tests

When reviewing PRs, the question is: "Does this follow the principles?" If not, either fix the code or update the principles—but don't compromise.

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

### Core Documentation

- [concepts.md](concepts.md) — What km is (nodes, modes, status)
- [architecture.md](architecture.md) — System architecture (layers, data flow)
- [ref/pipelines.md](ref/pipelines.md) — Async generator pipeline case study
- [ADR-002](adr/archive/002-domain-objects-refactor.md) — Historical context on domain object architecture
- [dev/testing.md](dev/testing.md) — Detailed testing guide

### Lessons Learned

Real stories from km development that shaped these principles:

- [lesson-backwards-compatibility.md](ref/lesson-backwards-compatibility.md) — **The Backwards Compatibility Trap**: Singleton wrappers for "backwards compatibility" prevented migration from ever completing. The lesson: quarantine and delete.
- [lesson-filetree-as-peer.md](ref/lesson-filetree-as-peer.md) — **FileTree as Peer DataStore**: Treating FileTree and DataStore as interchangeable peers led to performance asymmetry, semantic mismatch, and overly generic sync logic. The lesson: identify representation vs peer.
- [lesson-km-me0n.md](ref/lesson-km-me0n.md) — **The km-me0n Incident**: `km sync --to-fs` corrupted source files by writing to real files instead of test fixtures. The lesson: tests use isolated directories, in-memory infrastructure.

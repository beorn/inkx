# How km Works

> **Reading this doc**: Principles explain the "why". Guidelines (checkboxes) are the actionable rules.
>
> **For LLM agents**: Extract guidelines with `grep '- \[ \]' docs/principles.md`

---

> **The thesis**: Build from composable pieces. Maintain quality through fast feedback. Write for humans and LLMs.

## Why These Choices

These principles came from building a real system—km—that needed to be maintainable by both humans and AI agents. We learned that **architectural patterns matter more** when you're iterating quickly: a bad pattern proliferates across 50 files before you notice it. We learned that **fast feedback is everything**: 5-second tests mean you can try 100 approaches while waiting for one slow test suite. We learned that **code is read more than written**: when an LLM (or new contributor) opens a file, they should immediately see what it does and how to extend it.

The result is a codebase where **one obvious way** to do each thing eliminates choice paralysis. Where **composable pieces** (plain objects, factory functions, async generators) combine predictably. Where **fast tests** protect quality without slowing development. Where **failing loud** catches bugs at the call site instead of in production.

These aren't theoretical ideals—they're practical tools that emerged from real problems. The [Lessons Learned](#lessons-learned) links at the end document the mistakes that taught us why each principle matters.

## How to Use This Doc

If you're new, read Part 1 (Composable Domain Objects & Flows) and Part 2 (The Fast Feedback Loop) to understand the foundation. If you're implementing, follow Part 3 (Code for Humans) while coding. If you're using AI agents, read Part 4 (Coding with AI Agents) so you know what patterns must stay unique. If you're proposing changes, use Part 5 (Runbook) for the decision rubric and enforcement checklist.

The principles reinforce each other: composable pieces enable fast tests, fast tests protect quality, and quality makes AI-assisted development safe.

---

## Contents

- [Part 1: Composable Domain Objects & Flows](#part-1-composable-domain-objects--flows)
  - [Principle: Plain Domain Language](#principle-plain-language)
  - [Principle: Domain Object Inventory](#principle-domain-object-inventory)
  - [Principle: Centralized Core Flows](#principle-centralized-core-flows)
  - [Principle: The Discoverability Test](#principle-discoverability-test)
  - [Principle: Plain Objects from Factories](#principle-plain-objects)
  - [Principle: Compose Objects as Lego Blocks](#principle-lego-blocks)
  - [Principle: Organize Objects Into Layers](#principle-organize-objects-into-layers)
  - [Principle: Structural, Not Physical](#principle-structural-not-physical)
  - [Principle: Compose Flows using Generators](#principle-compose-flows-using-generators)
  - [Principle: Scoped Operations, Not Flags](#principle-scoped-operations-not-flags)
- [Part 2: The Fast Feedback Loop](#part-2-the-fast-feedback-loop)
  - [Principle: Fail Loud, Fail Now](#principle-fail-loud-fail-now)
  - [Principle: 5-Second Test Loops](#principle-5-second-test-loops)
  - [Principle: Quarantine and Delete](#principle-quarantine-and-delete)
- [Part 3: Code for Humans](#part-3-code-for-humans)
  - [Principle: Inverted Pyramid](#principle-inverted-pyramid)
  - [Principle: Alignment](#principle-alignment)
  - [Naming Conventions](#naming-conventions)
  - [No Prop Drilling](#no-prop-drilling)
  - [No Hidden Side Effects](#no-hidden-side-effects)
  - [Local Reasoning](#local-reasoning)
  - [Style Modifiers as Colors, Not Booleans](#style-modifiers-as-colors-not-booleans)
  - [Match State Lifetime to Component Lifetime](#match-state-lifetime-to-component-lifetime)
  - [Atomic Updates to Coupled State](#atomic-updates-to-coupled-state)
  - [Signal Ownership](#signal-ownership)
  - [API Boundaries](#api-boundaries)
  - [Type Safety](#type-safety)
  - [Error Handling](#error-handling)
  - [Module Boundaries](#module-boundaries)
- [Part 4: Coding with AI Agents](#part-4-coding-with-ai-agents)
  - [Why LLMs Amplify Architecture Problems](#why-llms-amplify-architecture-problems)
  - [Legacy Code as Virus](#legacy-code-as-virus)
  - [The Quality Plateau](#the-quality-plateau)
  - [Principles That Matter More with LLMs](#principles-that-matter-more-with-llms)
- [Part 5: Runbook](#part-5-runbook)
  - [What We're NOT Doing](#what-were-not-doing)
  - [Research First for Foundational Features](#research-first-for-foundational-features)
  - [Before You Add Something New](#before-you-add-something-new)
  - [How We Keep This Real](#how-we-keep-this-real)
- [Quick Reference](#quick-reference)
  - [Structure](#structure)
  - [Alignment](#alignment)
  - [Patterns](#patterns)
  - [Avoid](#avoid-delete-these-when-you-see-them)
  - [Deliberate indirection](#deliberate-indirection-keep-these)
  - [Test Commands](#test-commands)
- [See Also](#see-also)

---

## Part 1: Composable Domain Objects & Flows

Software is built from composable pieces. Both **structures** (objects) and **flows** (pipelines) should compose.

Domain objects are plain objects created by factory functions. They compose via explicit dependencies, enabling testing, swapping, and isolation.

<a id="principle-plain-language"></a>

### Principle: Plain Domain Language

**The insight**: The system's quality scales with the richness of a few core domain objects — not the number of ad-hoc helpers. Names come from the problem domain. Operations live on domain namespaces. Core algorithms read like pseudocode.

**The pattern**: A narrative written using actual type names should read naturally. Operations on domain objects compose into algorithms that read like English.

**Example narrative**: "A Repo loads Nodes from files. The Board displays Nodes and handles Commands. The Watcher detects file changes and triggers sync."

**Example algorithm** (reads like pseudocode):
```typescript
const visible = ViewTree.nodes(viewIndex, column.id)
const target = navigate(visible, cursor, "down")
```
Not: a 15-line manual stack-based DFS that you have to mentally simulate.

If your narrative needs technical jargon to make sense, the names are wrong. If your algorithm reads like implementation details instead of intent, the vocabulary is missing domain operations.

**The vocabulary principle**: Every operation on a core data structure belongs on that structure's namespace. `ViewTree.nodes()`, `ViewTree.nodes()`, `KNode.isOutline()` — these ARE the domain language. When a developer types `ViewTree.` they see the full vocabulary. When they read the navigation handler, they see the flow, not the plumbing. See [docs/lessons/discoverable-interfaces.md](lessons/discoverable-interfaces.md).

**Why**: Domain language makes code self-documenting and reduces onboarding time. Rich domain namespaces prevent duplication — new contributors (human or AI) discover existing operations instead of reimplementing them. Core algorithms expressed in domain language are reviewable in one place.

**Guidelines:**
- [ ] Domain names — `Repo`, `Board`, `Watcher` / not `DataManager`, `StateController`
- [ ] Operations on namespaces — `ViewTree.nodes()`, `KNode.isOutline()` / not bare `dfsTraversal()`
- [ ] Algorithms read like pseudocode — intent expressed in domain operations / not implementation details at every call site
- [ ] Unified API shapes across layers — `KTree.nodes()` and `ViewTree.nodes()` have the same predicate model (`match`, `into`, `reverse`)

---

<a id="principle-domain-object-inventory"></a>

### Principle: Domain Object Inventory

**The insight**: The system's vocabulary is finite and concrete. Knowing the domain objects IS knowing the system.

**The inventory** — these are km's core domain objects and their namespaces:

| Layer | Object | Namespace | Key operations |
|-------|--------|-----------|----------------|
| Data | `KNode` | `KTree` | `.nodes()`, `.ancestors()`, `.isOutline()`, `.isTask()` |
| Data | `TreeOp` | `inverse`, `applyOperation` | 7 atomic tree ops with invertibility |
| Data | `Point`, `Range` | `Point`, `Range` | text-level selection, `transformPoint`, `transformRange` |
| Data | `HistoryEditor` | `withHistory` | `.undo()`, `.redo()`, `.batch()` |
| Data | `OperationLog` | `createOperationLog` | `.append()`, `.getSince()`, `.seq()` |
| View | `ViewNode` | `ViewTree` | `.nodes()`, `.next()`, `.prev()`, `.ancestors()`, `.get()` |
| Storage | `Repo` | — | `.apply()`, `.commit()`, `.getNode()`, `.getChildren()` |
| Storage | `Sync` | `withSync()` | `.start()`, `.stop()`, `.save()`, `.forceHeartbeat()` |
| State | `BoardNavState` | `applyListNav` | list-based cursor navigation |
| UI | `PaneUI` | `PaneUI` | `.editMode()`, `.isInDialog()` |

**The principle**: These are the vocabulary. If an operation doesn't exist here, it's probably missing from the system, not a one-off helper. When you need a new operation, add it to the right namespace — don't create a standalone function.

**Why**: An explicit inventory makes the system learnable. A new developer (or AI agent) reads this table and knows where to look for any operation. It also makes gaps visible — if the inventory doesn't cover a concept, the system has a missing abstraction.

**Guidelines:**
- [ ] New operations go on existing namespaces — not as standalone helpers
- [ ] Keep the inventory up to date — when a new domain object is introduced, add it here and in the Quick Reference

---

<a id="principle-centralized-core-flows"></a>

### Principle: Centralized Core Flows

**The insight**: Core structures and flows should each be readable in one place. Types show what exists. Factories show how it composes. Handlers show what happens. If understanding any of these requires tracing through 5 files, the design is scattered.

**Three levels of centralization:**

1. **Types as blueprint** — a package's `types.ts` reads like a specification. The type definitions compose domain objects and show how they relate. A reader understands the system's shape from types alone.

2. **Factories as architecture** — `createRepo()`, `createBoard()`, `withSync()` read like pseudocode composition. They wire together domain objects and show the full structure. When you read the factory, you see the architecture.

3. **Handlers as flows** — a core flow reads as a sequence of domain operations:
```
keypress → command → direction → ViewTree.nodes → applyListNav → cursor update
```
Not: implementation details scattered across 5 files.

**The test**: "Can a new developer read this one function/file and understand the full [structure/flow]?" If they need 4 tabs and 3 intermediate states in their head, it needs centralizing.

**Why**: Scattered structures and flows are the #1 cause of accidental reimplementation. When the architecture is visible in one place, developers see the existing vocabulary and use it. When it's scattered, they see fragments and rewrite from scratch.

**Note**: This is a guideline, not an absolute — sometimes concerns genuinely can't be colocated. The goal is to minimize the number of places a reader must look, not to force everything into one file.

**Guidelines:**
- [ ] Types as blueprint — `types.ts` reads like a specification of what exists
- [ ] Factories as architecture — `createX()` reads like pseudocode showing how things compose
- [ ] Flows readable in one place — navigation, sync, rendering each have a single entry point
- [ ] Domain vocabulary carries the "how" — the flow/factory carries the "what"

---

<a id="principle-discoverability-test"></a>

### Principle: The Discoverability Test

**The insight**: Interface quality is measurable. Two concrete tests reveal missing abstractions before they cause duplication.

**Test 1**: "If a developer types `X.` and doesn't see the operation they need, the namespace is incomplete."

This is autocomplete-driven design. When a developer (or AI agent) needs to traverse a ViewTree, they type `ViewTree.` and expect to see traversal methods. If the method isn't there, they'll write their own — and now the system has two implementations.

**Test 2**: "If two sessions independently implement the same operation, the interface is missing a method."

This is the duplication signal. It already happened with DFS traversal (see [discoverable-interfaces.md](lessons/discoverable-interfaces.md)) — three independent implementations because the canonical one wasn't on the namespace.

**The principle**: These aren't abstract ideals — they're testable heuristics. Run them during code review. When you find a bare helper function that operates on a domain object, apply Test 1: would someone find it by typing `DomainObject.`? If not, move it.

**Guidelines:**
- [ ] Autocomplete test — operations discoverable via `Namespace.` / not buried as bare functions
- [ ] Duplication signal — when two implementations exist, the namespace is missing a method

---

<a id="principle-plain-objects"></a>

### Principle: Plain Objects from Factories

**The insight**: All functionality lives in domain objects (Repo, Board, Watcher).

**The pattern**: Factory functions return plain objects with methods.

```typescript
// Factory function returns plain object
export function createRepo(path: string, options?: RepoOptions): Repo {
  const db = options?.inject?.db ?? openDatabase(path)
  let closed = false

  return {
    path, // Plain property, not getter

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

**Infrastructure Class Exception**: Classes extending EventEmitter (e.g., `WriteQueue`) or managing low-level resources (e.g., `ParsePool`) are acceptable for internal infrastructure. Domain objects and orchestrators (e.g., `withSync()`) use factory functions with typed callbacks.

**App-level Event Bus Exception**: The `tuiEvents` EventEmitter in `apps/km-tui/src/tui.tsx` is an intentional module-level singleton. It serves as the app-level event bus for TUI refresh events (filesystem sync triggers UI refresh). This is acceptable because: (1) it is scoped to the TUI app layer, not a domain package, (2) it coordinates cross-cutting concerns (watcher status, refresh signals) that would otherwise require deep prop drilling through the React component tree, and (3) it has no state beyond listener registration. Domain objects and packages below the app layer must not use this pattern.

**Guidelines:**
- [ ] Factories not classes — `createRepo()` / not `new Repo()`
- [ ] Plain properties — `{ path }` / not `get path() { return x }`

---

<a id="principle-lego-blocks"></a>

### Principle: Compose Objects as Lego Blocks

**The insight**: Use the fewest possible building blocks to maximize interoperability. Every additional abstraction type creates impedance mismatch.

**The pattern**: Stick to plain objects, functions, and async generators. Inject all dependencies explicitly.

#### Minimize Types

Use plain objects, functions, and async generators. Every additional abstraction creates impedance mismatch—see [Why not classes](#principle-plain-objects) for details on type friction.

Plain objects work everywhere: JSON, IPC, spread operators, Object.assign, testing, debugging. Fewer types means less cognitive overhead and more natural composition.

#### No Globals or Singletons

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

#### Defaults Over Configuration

Configuration files explode the possibility space—every option multiplies what you need to test and debug. They also create friction: users must set things up before anything works.

**The pattern**: Sensible defaults → function arguments → configuration (last resort).

```typescript
// ❌ BAD - requires config file to work
const watcher = createWatcher({ configPath: ".km/watcher.json" })
// User must create config file before anything works

// ✅ GOOD - works immediately with sensible defaults
const watcher = createWatcher(repoPath)

// ✅ GOOD - arguments for dynamic behavior
const watcher = createWatcher(repoPath, { debounceMs: 100 })
```

**When configuration IS acceptable**:

- User preferences persisting across sessions (theme, keybindings)
- Environment-specific settings that rarely change (API endpoints)
- Per-project settings that belong in version control

**Why**:

- Zero-config means it "just works"
- Arguments are explicit at the call site
- Configuration increases coupling (code ↔ config format, config location, loader)
- Fewer configurations = fewer test combinations = fewer bugs

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

**Guidelines:**
- [ ] Inject deps — `{ inject: { db } }` / not `getDb()`
- [ ] No mutable module state — `const x = ...` / not `let x = ...` at top level
- [ ] No lazy singletons — pass `db` as param / not `getDb()` accessor
- [ ] Defaults over config — `createX(path)` / not `createX({ configPath })`
- [ ] Disposable resources — `[Symbol.dispose]() {}` / not manual cleanup
- [ ] Use `using` — `using repo = createRepo()` / not `try/finally`

---

### Principle: Organize Objects Into Layers

**The insight**: Each layer calls only the layer below it. Dependencies flow downward.

**The pattern**: Strict layered architecture with clear boundaries.

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

**Guidelines:**
- [ ] Call down only — Board→Storage→Parser / not Board→Parser
- [ ] UI through storage — `repo.save()` / not `fs.writeFile()`

---

### Principle: Structural, Not Physical

**The insight**: The structural layer (the universal tree) is where we do as much work as possible. We *materialize* down to the physical layer (filesystem) and *visualize* up to the visual/spatial layer (cards, columns, cursor). The structural tree is the canonical, source-agnostic representation — everything that can work at this level should. The visual layer must never branch on physical properties.

**The properties**:

| Concern | Properties | Used by |
|---------|------------|---------|
| Structural | `type`, `content`, `children`, `task_marker`, `rules` | Core, Tree, Views |
| Visual | depth, isSelected, cursor position, column width | Views only |
| Physical | `fstype`, `fs_path`, `fs_ino` | Storage, Parser only |

**The rule**: View code decides what to render based on structural properties (has body? has subitems? has task marker?) — never on `fstype` (is it a folder? a file? a section?).

```typescript
// 🚩 Physical branching in views — inconsistent across node sources
if (node.fstype === "folder") return <FolderPane />

// ✅ Structural branching — works for any node regardless of origin
if (extractBody(children).body.length > 0) renderBody()
if (node.task_marker) renderTaskStatus()
```

**Exception**: Cosmetic hints (icons, breadcrumb separators) may use `fstype` for display, but never for behavioral branching.

**Why**: Nodes can come from markdown files, Asana imports, inline creation, or any future source. If the visual layer branches on `fstype`, nodes from different sources render inconsistently. Structural properties are universal.

**Guidelines:**
- [ ] Views branch on structure — `type`, `content`, `children` / not `fstype`
- [ ] Physical in storage only — `fstype` checks in `@km/storage` and `@km/markdown` / not in views
- [ ] Predicates from tree — `KNode.isOutline(node)`, `extractBody()` / not `fstype === "mdsection"`

> **Lessons learned**: [docs/lessons/structural-visual-physical.md](lessons/structural-visual-physical.md)

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

**Guidelines:**
- [ ] Generator pipelines — `for await (x of pipeline)` / not chained `Promise.all`
- [ ] Single fan-out OK — `Promise.all([a, b, c])` / not `Promise.all(xs.map(...))`

#### Async/Await vs Generators: Two Yield Mechanisms

JavaScript has two yield mechanisms. Use each for its natural purpose:

- **`async/await`** yields **control** — "do this I/O, give me the result back." The function pauses, the runtime executes the effect, and the function resumes with the return value.
- **Generators** (`function*` / `async function*`) yield **content** — "here's the next chunk." The function produces a sequence of values, consumed by the caller.

```typescript
// async/await: yields control to perform effects
async save(s) {
  const data = await fx.fetch(url)  // control → runtime → result back
  await fx.persist({ data })        // control → runtime → done
}

// async generator: yields content progressively
async *respond(s) {
  for await (const chunk of fx.stream("ai", { prompt })) {
    s.text.value += chunk
    yield  // content → "re-render with what I have so far"
  }
}
```

**Don't mix them up.** If an update does I/O but doesn't stream content, use `async`. If it streams progressive content to the view, use `async function*`. Don't use generators for control flow (that's Redux-Saga territory — more ceremony for no benefit when `await` works).

**Guidelines:**
- [ ] `async/await` for effects — `await fx.fetch()` / not `yield fx.fetch()`
- [ ] `async function*` for streaming content — `yield` to push chunks / not timers + reveal fractions
- [ ] Never use generators purely for control flow — `await` is simpler and idiomatic

---

### Principle: Scoped Operations, Not Flags

**The insight**: When an operation temporarily changes behavior (drag, select mode, batch edit), scope it as a machine with its own lifetime — don't set a flag on global state and rely on everyone to check it.

**The pattern**: A scoped operation owns its state from start to end. Components that participate enter/exit the scope; code outside the scope sees no change. This is the TEA machine shape: `(action, state) → [state, effects]` where the machine *is* the operation.

```typescript
// ❌ BAD — global flag, everyone must remember to check
store.isDragging = true
store.dragSource = nodeId
// ... many handlers now branch on `isDragging`
// (forget one → zombie drag state bugs)

// ✅ GOOD — scoped machine owns the operation
using drag = beginDrag(nodeId)
drag.update({ x, y })
drag.commit()
// lifetime-bound: scope exit guarantees cleanup
```

**Why**: Flags leak. If even one handler forgets to clear `isDragging`, you have a zombie mode that breaks unrelated interactions. Scoped operations can't leak — the machine's lifetime is the operation's lifetime.

Serializable actions (`dragStart`, `dragMove`, `dragEnd`) also enable replay, undo, and AI automation — see [docs/design/tea-state-machines.md](design/tea-state-machines.md).

**Guidelines:**
- [ ] Scope temporary state — `using op = beginX()` / not `store.xMode = true`
- [ ] Operations are machines — `(action, state) → [state, effects]` / not imperative flag flips
- [ ] Lifetime-bound cleanup — `Symbol.dispose` or commit/cancel / not manual flag reset

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

**Invariant violations throw.** Only user-caused errors (bad input, network failures) are logged gracefully. Pre-release policy: fail fast, fail loud. Runtime invariant checks (e.g. `checkInvariants` in board-app) always throw `InvariantViolationError` — there is no log-only mode.

**Why**: Bugs surface at the call site, not later as mysterious failures. A runtime invariant that throws immediately is worth more than 10 manual test sessions. The cursor-null bug (signals migration) survived 3 separate root causes for hours — 1 invariant caught them all in seconds.

**Invariant-first development:**
- When adding state, add the invariant FIRST. What must always be true?
- When fixing a bug, add the invariant that would have caught it.
- Runtime invariants > unit tests for state consistency. Tests check specific scenarios; invariants check ALL scenarios.
- `checkInvariants` runs after EVERY action — it's the safety net that catches what tests miss.
- Invariants are documentation: they describe what "correct" means for the system.

**Guidelines:**
- [ ] Throw internally — `if (!id) throw` / not `id ?? defaultId`
- [ ] No ensure checks — let `db.get()` throw / not `ensureDbOpen()`
- [ ] Required = throw — `throw new Error('db required')` / not `db ?? fallback`
- [ ] Add invariants for every state container sync (store ↔ signals, sel ↔ pane, etc.)

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

**Guidelines:**
- [ ] In-memory tests — `withTestEnv()` / not `new Database('/tmp/test.db')`
- [ ] Fast suite — `test:fast` < 15s / not minutes
- [ ] Benchmarks measure production — `bun bench` disables test-only overhead (SILVERY_STRICT, checkIncremental). Bench numbers must represent what users experience, not what tests verify. If a bench includes verification overhead, its numbers are useless for optimization decisions.

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

**Guidelines:**
- [ ] No compat shims — delete old API / not `export { old as new }`
- [ ] Hard delete — comment out + fix callers / not `@deprecated` tag

---

## Part 3: Code for Humans

Parts 1 and 2 establish what to build (composable pieces) and how to verify it works (fast feedback). Part 3 is about making it understandable.

Code is read more than written. Use [Plain Domain Language](#principle-plain-language) (Part 1) so the code reads naturally. Make the "right way" locally obvious.

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

**Guidelines:**
- [ ] Main first — exports at top / not buried after helpers
- [ ] Short core — < 15 lines main logic / not 50-line functions
- [ ] Helpers below — after `return` or bottom of file / not before main

---

### Principle: Alignment

**The insight**: Aligned code is more readable AND more composable.

**Names**: Align variable names with return property names. This enables shorthand syntax.

```typescript
// GOOD - aligned names enable shorthand
const path = resolveRoot(input)
const data = loadData(path)
return { path, data }

// BAD - misaligned names require mapping
const rootPath = resolveRoot(input)
const loadedData = loadData(rootPath)
return { path: rootPath, data: loadedData }
```

**Family names**: Related functions share consistent prefixes.

```typescript
// GOOD - consistent get* family
getNode(id)
getChildren(id)
getSubtree(id)

// BAD - inconsistent verbs
getNode(id)
fetchChildren(id)
querySubtree(id)
```

**Visual weight**: Same-level things get same visual treatment. Code space reflects importance.

```typescript
// GOOD - all methods one line (aligned visual weight)
const repo = {
  getNode: data.getNode,
  getChildren: data.getChildren,
  search: data.search,
  close: () => closeAll(emitter, files, data, database),
}

// BAD - mixed visual weight (20-line method alongside one-liners)
const repo = {
  getNode: data.getNode,
  getChildren: data.getChildren,
  search: (query) => {
    // 20 lines of inline code
    // makes this look more important than getNode
    // even though they're at the same level
  },
}
```

**Types**: Domain types explicit (documentation), internal types inferred.

```typescript
// GOOD - explicit domain type, implicit internal
export interface Repo { ... }  // Domain type: documented
const props = { path, data }   // Internal: let TS infer

// BAD - wrapper type that mirrors another
interface RepoMethodDeps { db: Database, path: string }  // Just delete this
```

**Why**: Aligned code enables generic wrappers, spread syntax, and visual scanning. When names match across layers, you can use `{ ...props }` instead of manual mapping.

**Guidelines:**
- [ ] Aligned names — `const path = ...; return { path }` / not `{ path: rootPath }`
- [ ] Family prefixes — `getNode`, `getChildren` / not `getNode`, `fetchChildren`
- [ ] Equal weight — all one-liners or all extracted / not mixed
- [ ] No delegators — call `g(x)` directly / not `f(x) { return g(x) }`
- [ ] Const transform — `const x = transform(y)` / not `let x = y; x = mutate(x)`
- [ ] Simple inlines — `fn(a)` / not `fn(a && b ? c : d)`
- [ ] No mirror types — use source type / not `type Copy = { ...same fields }`

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

**Guidelines:**
- [ ] Naming pattern — `createRepo(opts: RepoOptions)` / not `makeRepo(config)`
- [ ] Inject names — `inject: { db }` / not `inject: { database }`

---

### No Prop Drilling

**The rule**: Don't repeat the same 10 props through every layer. Reduce props, use spread, or align names.

**The anti-pattern**: Passing the same props through multiple layers with slight name changes.

```typescript
// ❌ BAD - prop drilling with aliasing
function Parent({ userId, userName, userEmail, userRole, theme, locale, debug, logger, config, flags }) {
  return <Child
    id={userId}
    name={userName}
    email={userEmail}
    role={userRole}
    currentTheme={theme}
    currentLocale={locale}
    isDebug={debug}
    log={logger}
    settings={config}
    featureFlags={flags}
  />
}

// ✅ GOOD - spread with aligned names
function Parent(props) {
  return <Child {...props} />
}

// ✅ GOOD - group related props into objects
function Parent({ user, env }) {
  return <Child user={user} env={env} />
}
```

**Guidelines**:

- **Align names across layers**: If it's `theme` in the parent, keep it `theme` in the child—no `currentTheme` aliasing
- **Use spread for pass-through**: `<Child {...props} />` or `<Child {...pick(props, ['a', 'b'])} />`
- **Group related props**: Instead of 5 user fields, pass a `user` object
- **Use context for truly global state**: Theme, locale, auth—things every component needs

**Why**: Prop drilling creates maintenance burden. When you add a prop at the top, you must thread it through every layer. Aligned names and spread eliminate this busywork.

**Guidelines:**
- [ ] Spread props — `<Child {...props} />` / not `<Child a={props.a} b={props.b} />`
- [ ] Group related — `{ user: { id, name } }` / not `{ userId, userName }`

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

**Guidelines:**
- [ ] No import effects — `export function create()` / not `const x = init()` at top
- [ ] No opts.ensure — caller ensures preconditions / not `{ ensure: true }`

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

**Guidelines:**
- [ ] No globals — `fn(db, node)` / not `fn(node)` + `getCurrentDb()`
- [ ] Deps as params — `process(db, x)` / not `process(x)` reading module state

---

### Style Modifiers as Colors, Not Booleans

**The rule**: Visual state (selected, disabled, focused, muted) cascades via theme colors — not boolean props that every component must branch on.

```tsx
// ❌ BAD - every descendant needs `selected?: boolean`
<Card selected={isSelected}>
  <Title selected={isSelected} />
  <Body selected={isSelected}>
    <Tag selected={isSelected} />  // prop drilling through the visual tree
  </Body>
</Card>

// ✅ GOOD - set the color once; children inherit via context/theme
<Card color={isSelected ? "$selected" : "$fg"}>
  <Title />  {/* inherits $selected from parent */}
  <Body>
    <Tag />
  </Body>
</Card>
```

**Why**: Booleans don't compose. Each new visual state (hover, focus, drag-over) doubles the prop matrix. Colors compose through inheritance — set `$selected` at the container and every child renders in the selection treatment automatically. It's also how designers actually think: "the selected column is blue," not "every element has selected=true."

This applies to any visual modifier: focus, disabled, error, warning, muted. Express it as a semantic color token (`$focused`, `$muted`) on the parent, not a boolean branched on by every child.

**Guidelines:**
- [ ] Semantic colors for visual state — `color="$selected"` / not `selected={true}` prop drilling
- [ ] Set once, inherit down — parent owns the color / not every child branches
- [ ] One token per state — `$selected`, `$focused`, `$muted` / not ad-hoc boolean combos

---

### Match State Lifetime to Component Lifetime

**The rule**: A piece of state must be owned by something whose lifetime matches the state's validity. Orphan state — living longer than its owner or shorter than its consumers — produces zombie data and stale reads.

```tsx
// ❌ BAD - cursor stored on parent, but cursor semantics belong to the pane
function Board({ cursor, setCursor }: Props) {
  return panes.map(p => <Pane cursor={cursor} />)
  // which pane owns cursor? when pane unmounts, who clears it?
}

// ✅ GOOD - each pane owns its own cursor; unmount clears it
function Pane() {
  const pane = usePane()  // pane-scoped store, dies with the pane
  return <Column cursor={pane.cursor} />
}
```

**Symptoms of mismatched lifetimes:**
- A store outlives the component that created it → reopening shows stale state
- A component reads state that was cleaned up when its parent unmounted → undefined crash
- Two components share state with no clear owner → effect cascades and double writes
- Global state mirrors local state → they drift out of sync

**Fix**: Move the state to something whose lifetime *is* the state's validity. Pane state on the pane. Drag state on the drag operation. Session state on the session. If there's no natural owner, create one — a factory object with `Symbol.dispose` that cleans up on scope exit.

This is the dual of [Scoped Operations, Not Flags](#principle-scoped-operations-not-flags): state is scoped to its lifetime, not smeared across the global store.

**Guidelines:**
- [ ] State has one owner — component, store, or machine / not "shared" with no owner
- [ ] Lifetime match — state dies when its owner dies / not leaks beyond unmount
- [ ] No orphan globals — if state exists only during X, it lives on X / not on the app store

---

### Atomic Updates to Coupled State

**The rule**: When two pieces of state must stay consistent (cursor position and the tree it points into, selection and the nodes it selects, scroll offset and the content it scrolls), update them **together in one action** — never in sequence.

```typescript
// ❌ BAD - two writes, cursor briefly points at a deleted node
tree.removeNode(id)
cursor.set(findNearestSibling(id))  // window where cursor is stale

// ✅ GOOD - one action updates both atomically
store.removeNode(id)  // internally: compute new cursor, then apply both
```

**Why**: Coupled state that updates sequentially has a window where the invariant is violated. Any code that runs between the two writes (rerender, effect, observer) sees the inconsistent state. This is how "cursor points at a deleted node" bugs are born.

**How to enforce:**
1. Put coupled state under the same owner (one store method, one reducer action).
2. Compute the new values from the old ones *first*, then write them together.
3. Add an [invariant](#principle-fail-loud-fail-now) that fires if the coupling is ever broken.

If the invariant throws, the bug surfaces at the offending action — not three renders later when something tries to read the dead cursor.

**Guidelines:**
- [ ] One action per coupled update — `store.removeNode()` / not `tree.remove(); cursor.fix()`
- [ ] Compute before write — derive new state, then apply in one step / not write then fix
- [ ] Invariant guards coupling — `checkInvariants()` asserts the relationship holds

---

### Signal Ownership

**The rule**: Signals are written only by their owning store's methods. No external writes, no effect cascades between stores.

If two stores need to stay in sync, one is derived from the other (`computed`), not synced via `effect`. The store method is the pure→reactive boundary: read signals, call pure function, write result.

Three patterns, ranked by preference:

1. **DIRECT** — store method → pure function → write own signal. One owner, one write, no cascades.
2. **DERIVED** — signal A changes → `computed` B recomputes. No writes, just derivation.
3. **EFFECT** — signal A changes → effect → writes signal B. Two owners. Use only at cross-system boundaries (e.g., sel store → ag tree), and document why patterns 1–2 don't apply.

```typescript
// ✅ Pattern 1 — store method owns the write
sel.node.setCursor(targetId)

// ✅ Pattern 2 — computed derivation, no writes
const cursorNode = computed(() => repo.getNode(sel.node.cursor()))

// ⚠️ Pattern 3 — effect bridge, use sparingly
effect(() => { agNode.selected = sel.selection().has(agNode.id) })
```

**Litmus test**: If you're writing `effect(() => { otherStore.set(...) })`, something is wrong. Either merge the stores, derive via `computed`, or move the write into the source store's method.

**Why**: Effect cascades between stores cause double writes, init races, and stale gaps. The selection bridge mess (two stores owning cursor state, synced via effect) is the canonical example — see [lessons/op-signal-boundary.md](lessons/op-signal-boundary.md).

**Guidelines:**
- [ ] One writer per signal — only the owning store's methods write it / not external `effect()` calls
- [ ] `computed` over `effect` for cross-store reads — derive, don't sync
- [ ] Store methods are the boundary — pure logic inside, signal write at the end / not scattered writes

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

**Guidelines:**
- [ ] Validate at edge — `if (!x) return null` in exports / not everywhere
- [ ] Throw inside — `if (!x) throw` in internals / not `return null`

---

### Type Safety

**The rule**: Use TypeScript's type system to prevent bugs at compile time.

```typescript
// ❌ BAD - any escapes type checking
function process(data: any) {
  return data.value // No type error if data has no value
}

// ✅ GOOD - unknown forces narrowing
function process(data: unknown) {
  if (typeof data === 'object' && data && 'value' in data) {
    return data.value
  }
  throw new Error('Invalid data')
}

// ❌ BAD - non-null assertion hides potential bugs
const node = nodes.find(n => n.id === id)!

// ✅ GOOD - handle the undefined case
const node = nodes.find(n => n.id === id)
if (!node) throw new Error(`Node ${id} not found`)
```

**Check for absence, not falsiness.** Use `!= null` (or `=== undefined`) when you mean "is it missing?" — `!x` also fires on empty string, 0, and false, all of which are valid values.

```typescript
// ❌ BAD - treats "", 0, false as absence
if (!content) renderPlaceholder()        // empty string is valid content!
if (!task.status) task.status = "todo"   // "" is a real status

// ✅ GOOD - checks for actual absence
if (content == null) renderPlaceholder()
if (task.status == null) task.status = "todo"
```

This is one of the few places `== null` is correct — it covers both `null` and `undefined` with intent.

**Guidelines:**
- [ ] No any — `unknown` + narrowing / not `any`
- [ ] No bang — `if (!x) throw` / not `x!`
- [ ] Explicit returns — `fn(): Result` / not inferred on exports
- [ ] Use satisfies — `x satisfies T` / not `x as T`
- [ ] Absence checks use `!= null` — `if (x == null)` / not `if (!x)` (breaks on `""`, `0`, `false`)

---

### Error Handling

**The rule**: Only throw `Error` instances. Use typed errors for user-facing failures.

```typescript
// ❌ BAD - throwing non-Error values
throw "something went wrong"
throw { code: 404 }

// ✅ GOOD - throw Error with context
throw new Error(`Node ${id} not found`)

// ✅ GOOD - typed error for user-facing failures
export class KmUserError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
  }
}
throw new KmUserError("File not found", "FILE_NOT_FOUND")
```

**Guidelines:**
- [ ] Throw Error — `throw new Error('msg')` / not `throw 'msg'`
- [ ] Typed user errors — `throw new KmUserError()` / not generic Error for UI

---

### Error Messages

**The rule**: Every error message (thrown or logged) should help the user identify the problem and fix it.

**Required context:**
1. **Human-readable identifier** — Name, title, path (not raw UUIDs)
2. **Type/category** — What kind of thing (file, folder, task)
3. **What happened** — Clear description
4. **Why it matters** — Impact ("changes not saved", "data may be lost")
5. **What to do** — Actionable next step

```typescript
// ❌ BAD - no context
throw new Error("Duplicate node")
log.warn?.(`error: ${nodeId}`)

// ✅ GOOD - user can identify and act
throw new Error(
  `Data conflict: "${name}" was modified externally.\n` +
  `  File: ${fsPath}\n` +
  `  Your version: ${hash.slice(0,8)}...\n` +
  `Recovery: Your edits are in .km/changes.jsonl`
)

log.warn?.(
  `Stale event: "${name}" ${type} at ${fsPath} already exists. ` +
  `Run 'km gc' to clean changes.jsonl.`
)
```

**When to throw vs log:**

| Scenario | Action |
|----------|--------|
| Programming error ("shouldn't happen") | **Throw** with bug report request |
| Data integrity at risk | **Throw** with recovery steps |
| Gracefully degraded | **Log warn** — operation succeeded but with caveats |
| User can retry | **Log error** — operation failed but app continues |
| Expected edge case | **Log warn** — handled scenario user should know about |

**Guidelines:**
- [ ] Human-readable IDs — `"${name}" ${type}` / not `${nodeId}`
- [ ] Include path — `at ${fsPath}` / not just name
- [ ] Explain impact — "changes not saved" / not just "failed"
- [ ] Actionable — "Run 'km gc'" / not just "error occurred"

---

### Module Boundaries

**The rule**: Public API through `index.ts`, no deep imports across packages.

```typescript
// ❌ BAD - deep import reaches into internal structure
import { queryNode } from '@km/storage/src/queries/nodes'

// ✅ GOOD - import from package public API
import { queryNode } from '@km/storage'
```

**Why**: Deep imports create coupling to internal structure. When internals change, unrelated code breaks.

**Guidelines:**
- [ ] Export via index — `export` in `index.ts` / not scattered exports
- [ ] No deep imports — `from '@km/x'` / not `from '@km/x/src/internal'`
- [ ] ESM only — `import` / not `require()`

---

## Part 4: Coding with AI Agents

These principles matter MORE when working with AI coding agents.

### Why LLMs Amplify Architecture Problems

LLM coding agents have specific constraints:

- **No persistent memory** — Each session starts fresh, will use whatever patterns exist in the code
- **Limited context** — Can't see the whole codebase, architecture must be locally obvious
- **Pattern matching** — Will copy existing patterns, good or bad
- **Fast iteration** — Can leverage fast test loops (< 15s) extremely well

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

These principles are universal, but LLMs suffer MORE from violations due to their constraints (no memory, limited context, pure pattern matching).

| Principle | Why LLMs need it more |
|-----------|----------------------|
| [Factory Functions](#principle-plain-objects) | Can't track hidden state across files |
| [Explicit Dependencies](#principle-lego-blocks) | Can't infer that `getDb()` requires initialization |
| [Quarantine and Delete](#principle-quarantine-and-delete) | Will copy old patterns—they don't read deprecation warnings |
| [5-Second Tests](#principle-5-second-test-loops) | 100 iterations while you wait for one slow suite |
| [Fail Loud](#principle-fail-loud-fail-now) | Silent failures compound across sessions |
| [Quality Plateau](#the-quality-plateau) | When there's one pattern, they follow it; when there are two, they guess |

**Guidelines:**
- [ ] Clean touched files — fix old patterns in modified files / not leave them
- [ ] Track todos — `// TODO(#123)` / not `// TODO: someday`
- [ ] One way only — consolidate before adding / not two patterns coexisting

---

## Part 5: Runbook

How we keep principles alive over time.

### What We're NOT Doing

What we're **not** optimizing for. These clarify tradeoffs and prevent endless debates.

- **Not optimizing for**: OO purity or class-based patterns — We use factories and plain objects
- **Not optimizing for**: Zero allocations / micro-optimizations — Clarity over micro-performance
- **Not optimizing for**: Framework compatibility at all costs — Choose patterns that fit our needs
- **Not optimizing for**: Backwards compatibility inside the codebase — Quarantine and Delete
- **Not optimizing for**: Maximum generality — Build for one consumer, extract when the second arrives. Designing for hypothetical canvas/diagramming/browser consumers wastes rounds. km is the proving ground; generalization happens when a real second consumer needs it.
- **Not optimizing for**: Minimal lines of code — Explicit and clear beats clever and terse
- **Not optimizing for**: Maximum configurability — Sensible defaults and arguments beat config files

---

### Research First for Foundational Features

For foundational subsystems (selection, undo, collaboration, text editing), **study industry prior art before coding**. Survey 3-5 established implementations (e.g., tldraw, ProseMirror, SlateJS, VS Code, Figma) to understand:

1. What abstractions the industry converged on
2. What edge cases they handle that you haven't considered
3. What architectural decisions they made and why

This is different from "/deep research" for debugging. This is deliberate design research — understanding the solution space before committing to an architecture. The @silvery/selection system benefited enormously from studying how tldraw, ProseMirror, and SlateJS handle selection before any code was written.

**When**: Before implementing any subsystem that has well-established prior art in other editors/frameworks.
**How**: Use `/llm --deep` or `/deep` to survey implementations, then synthesize findings into a design doc before coding.
**Skip when**: The feature is novel (no prior art exists) or purely km-specific (no general solution to study).

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

### Refactoring

Big refactoring projects have unique failure modes. See [lessons/refactoring.md](lessons/refactoring.md) for hard-won lessons with concrete examples:

- **Update beads first** - Update bead descriptions to reflect current codebase state
- **Break intentionally** - Force complete migration, not half-migrated code
- **Purge aggressively** - Delete deprecated APIs immediately
- **No backwards compat hacks** - No shims, re-exports, or fallbacks
- **Phase order matters** - Update -> Absorb -> Purge -> Remove -> Fix

---

### How We Keep This Real

How we keep principles true over time.

**Automated checks**:

- `bun run test:fast` must stay < 15s (currently ~11s)
- ESLint rules: no deprecated code allowed in-tree
- TypeScript strict mode: catch type errors early

**Code review checklist**:

Extract with: `grep '- \[ \]' docs/principles.md`

Each principle section includes inline guidelines that serve as the review checklist. Key areas:
- **Composability** (Part 1): Factory functions, explicit dependencies, disposables, layers
- **Fast feedback** (Part 2): Fail loud, in-memory tests, no backwards compat
- **Readability** (Part 3): Inverted pyramid, alignment, naming, no hidden effects

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

> Extract all guidelines: `grep '- \[ \]' docs/principles.md`

For terminology used throughout, see [glossary.md](glossary.md).

### Domain Object Inventory

| Layer | Object | Namespace | Key operations |
|-------|--------|-----------|----------------|
| Data | `KNode` | `KTree` | `.nodes()`, `.ancestors()`, `.isOutline()`, `.isTask()` |
| Data | `TreeOp` | `inverse`, `applyOperation` | 7 atomic tree ops with invertibility |
| Data | `Point`, `Range` | `Point`, `Range` | text-level selection, transforms |
| Data | `HistoryEditor` | `withHistory` | `.undo()`, `.redo()`, `.batch()` |
| View | `ViewNode` | `ViewTree` | `.nodes()`, `.sibling()` |
| State | `BoardNavState` | `applyListNav` | list-based cursor navigation |
| UI | `PaneUI` | `PaneUI` | `.editMode()`, `.isInDialog()` |

If an operation doesn't exist here, it's probably missing from the system. See [Domain Object Inventory](#principle-domain-object-inventory).

### Structure

**Module level:**
- Core functions (exports) first - the reason this module exists
- Helpers at bottom - in importance order, narrative flows
- Types near what uses them

**Function level:**
- Core logic <15 lines - abstract details to helpers
- Helpers after return or at end of file
- Name helpers for intent: `initDatabase()` not `setupDbStuff()`

**Order by importance:**
- Within any list (imports, methods, helpers), most important first
- Narrative should flow - reader follows the story top to bottom
- If helpers call each other, order them so callees appear after callers

### Alignment

Alignment makes code more readable AND more composable.

**Names:**
- Align variable names with return property names: enables shorthand `{ path, data }` instead of `{ path: rootPath, data: loadedData }`
- Shorter when unambiguous: `withHooks` not `wrapWithHooks`
- Family names consistent: `initDatabase`, `initEmitter`, `initFiles` (all `init*`); `getNode`, `getChildren`, `getSubtree` (all `get*`)

**Signatures:**
- Align function signatures across a family to enable generic wrappers
- Prefer readable helper calls over inline expressions: `const db = initDatabase(mode, kmDir)`

**Visual weight:**
- Same-level things get same treatment
- Extract all or inline all - don't mix (inline dominates unfairly)
- If something sticks out visually, it should be important

**Types:**
- Domain types explicit (documentation): `Repo` interface, `KNode` type
- Internal types inferred: let TS figure it out
- Delete wrapper types that just mirror another type

### Patterns

**Composition:**
- `const` over `let`: `const x = transform(initial)` not `let x = initial; x = mutate(x)`
- Spread over manual: `{ ...defaults, ...overrides }` not field-by-field copying
- Compose over call: `withHooks(base)` returns wrapped object, not `addHooks()` that mutates

**Decomposition:**
- Wrappers for cross-cutting concerns (hooks, logging, timing)
- Stage helpers for pipelines: `parse → validate → transform`
- Each piece independently meaningful and testable

**Control flow:**
- Early returns (guard clauses at top): `if (!id) return null`
- Lookup objects over switch: `handlers[type]?.()` not `switch(type) { case 'a': ... }`

### Avoid (delete these when you see them)

| Pattern | Why Bad | Instead |
|---------|---------|---------|
| `ensure*` checks | Lower levels throw naturally | Let db throw on closed connection |
| Getters/setters | Accidental indirection | Plain properties: `path` not `get path()` |
| Pure delegators | `f(x)` just calls `g(x)` | Call `g(x)` directly |
| `opts.ensure` | Embedded side effects | Caller handles preconditions |
| Compatibility shims | Adds complexity forever | Break and fix callers now |
| Inline expressions | Hard to read | Named helper calls |
| `let` with mutation | Hard to follow | `const` with transform |

### Deliberate indirection (keep these)

| Pattern | Why Good |
|---------|----------|
| Interfaces at boundaries | `DataStore` enables swapping implementations |
| Dependency injection | Pass `db` as param, not import singleton |
| Hooks for extension | `beforeMutation`/`afterMutation` without modifying core |
| Wrappers for concerns | `withHooks(baseRepo)` separates cross-cutting concerns |

### Test Commands

```bash
bun run test:fast    # < 15s - use during development
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

- [refactoring.md](lessons/refactoring.md) — **Refactoring Lessons**: Delete first, fix second. Backwards compatibility is a trap. Includes case studies from domain objects migration and silvery/ansi absorption.
- [filetree-as-peer.md](lessons/filetree-as-peer.md) — **FileTree as Peer DataStore**: Treating FileTree and DataStore as interchangeable peers led to performance asymmetry, semantic mismatch, and overly generic sync logic. The lesson: identify representation vs peer.
- [km-me0n.md](lessons/km-me0n.md) — **The km-me0n Incident**: `km sync --to-fs` corrupted source files by writing to real files instead of test fixtures. The lesson: tests use isolated directories, in-memory infrastructure.
- [worktree-discipline.md](lessons/worktree-discipline.md) — **Worktree Creation Is a Prerequisite**: Agents must create worktrees before editing, not as a step they'll get to later. Process steps that create isolation gate all other work.

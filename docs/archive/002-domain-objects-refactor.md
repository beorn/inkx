# ADR-002: Domain Object Architecture Refactor

> **Status:** DRAFT
>
> This design supersedes the original "two peer stores" approach (archived).

---

## Problem Statement

The current km storage architecture has unclear boundaries:

- **Singletons everywhere** — `getDb()`, `setDb()`, `isMemoryMode()` are global state
- **Mode dispatch buried in internals** — `db-ops.ts` checks `isMemoryMode()` to decide behavior
- **Dual abstractions** — Both `Store` and `Vault` exist with overlapping purposes
- **Hidden side effects** — `emit()` happens in db-ops without Vault knowledge
- **Fallback patterns** — `options?.db ?? getDb()` creates optional dependencies that never migrate

This makes testing fragile, swapping backends hard, and the code difficult to reason about.

---

## Historical Context: Lessons Learned

### The Backwards Compatibility Trap

On Jan 25, commit `8014128` introduced "singleton wrappers for backwards compatibility":

> This maintains backwards compatibility for existing code while migrating
> to the new database dependency injection pattern.

**This was the wrong approach.** It led to:

1. **Gradual migration never completed** — With fallbacks available, old patterns persisted
2. **Fix-on-top-of-fix cycle** — Many commits patching symptoms instead of removing root cause:
   - `d1321c1 fix(storage): add missing getDb imports and fix incorrect method calls`
   - `973bf7c fix(storage): import db-accepting functions directly in repo and store`
   - `5b03ab1 fix(test): restore 11 tests after singleton removal`
3. **Inconsistent codebase** — Some code used new patterns, some still used singletons
4. **False sense of progress** — Exports removed but internal code still depended on singletons

### Key Insight

> "I find that you have a tendency to 'fall back' to the way you did it historically"

**The solution:** Make fallbacks impossible by deleting the code first. The old code cannot be used as a crutch if it doesn't exist.

### Why FileTree Is Not a DataStore

The original design treated FileTree and DataStore as peers implementing the same `Store` interface. This was problematic:

1. **Performance asymmetry breaks the contract** — FileTree is O(n) for everything, DataStore is O(1)/O(log n). Claiming they share an interface hides this.

2. **Semantic mismatch** — Files don't naturally have node IDs, parent_idx, or other Repo metadata. FileTree must synthesize these.

3. **Sync becomes too generic** — If both are "stores", sync is a generic store-to-store operation. But file↔data sync is really _translation_ between formats.

4. **API surface problem** — FileTree implementing `search()` means parsing all files — expensive and rarely useful.

The git analogy helped: git doesn't treat the working tree as a repository. It's a _representation_ of repo state.

---

## Goal

Refactor to **composable domain objects** with clear separation of concerns:

1. **Remove singletons** — No more getDb/setDb/isMemoryMode globals
2. **DataStore as indexed tree** — Query, mutate, watch (fast, structured)
3. **FileTree as simple I/O** — Read/write files, NOT a DataStore
4. **Repo composes layers** — DataStore + optional FileTree + Config + sync()
5. **Layered capabilities** — Keep DataStore pure; expose internals via intersection types

---

## Terminology

| Name          | What it is                                                    |
| ------------- | ------------------------------------------------------------- |
| **Repo**      | Composed domain object (DataStore + FileTree? + ConfigStore)  |
| **DataStore** | Indexed tree of nodes (database + blobs + events)             |
| **FileTree**  | Simple file I/O abstraction (read, write, watch)              |
| **sync**      | Translation layer between FileTree and DataStore              |
| **config**    | Settings (cosmicconfig: `km.config.yaml`, `.kmrc`, etc.)      |
| **km dir**    | km's internal directory `.km/` (events, cache, config, hooks) |

**Key distinction:**

- FileTree and DataStore are NOT peers implementing the same interface
- FileTree is simple I/O; DataStore is indexed storage
- Sync translates between formats, doesn't copy store-to-store

> **Note on naming:** Git's "repository" refers to the whole thing (.git/ + working tree).
> Our "Repo" follows this — it's the composed whole. "DataStore" is analogous to
> git's .git directory (the indexed storage), not to the whole repository.

---

## Core Architecture (Git-Inspired)

| Git Concept      | km Equivalent       | Description                                       |
| ---------------- | ------------------- | ------------------------------------------------- |
| Repository       | Repo                | The composed whole                                |
| .git/            | km dir (`.km/`)     | Internal directory (events, cache, config, hooks) |
| Objects + index  | DataStore           | Indexed storage with fast queries                 |
| Working Tree     | FileTree            | Human-editable file representation                |
| `git checkout`   | sync (data → files) | Materialize data state to files                   |
| `git add/commit` | sync (files → data) | Capture file changes into data                    |

**FileTree is NOT a DataStore.** It's a human-editable representation that syncs with the data store. Sync is translation, not generic store-to-store operation.

```
┌────────────┐                  ┌─────────────┐
│ FileTree  ││←──── sync ────→ ││ DataStore   │
│  (files)   │    (translate)   │  (indexed)  │
└────────────┘                  └─────────────┘
   optional                        always present
   human-editable                  fast queries
```

---

## What Happens When You Run km

When you run `km` on a repo path:

1. **If `.km/` exists:**
   - Load config via cosmicconfig rooted at repo path
   - Open DataStore from `.km/` (database: `state.db`, events: `changes.jsonl`)
   - Sync is **opt-in** — call `repo.sync()` or `repo.watch()` to start
   - Both data and files persist independently

2. **If no `.km/` exists:**
   - Create an in-memory DataStore (cache for fast queries)
   - Files (markdown) ARE the persistence
   - Initial `createRepo()` parses files once to populate DataStore cache
   - Ongoing sync is opt-in (`repo.sync()` or `repo.watch()`)
   - `km init` creates `.km/` for persistent DataStore

**Key distinction:**

- **With `.km/`**: DataStore persists independently, files sync bidirectionally
- **Without `.km/`**: Files are authoritative; DataStore is an ephemeral cache

```
/my-repo/
├── km.config.yaml            ← config (cosmicconfig at root)
├── projects.md               ┐
├── inbox.md                  ├─ FileTree (files)
├── notes/meeting.md          ┘
└── .km/                      ← km dir (created by `km init`)
    ├── changes.jsonl          ← canonical event log (git-tracked)
    └── state.db              ← nodes + sync metadata (derived, gitignored)
```

> **Event sourcing:** `changes.jsonl` is canonical. Everything in `cache/` can be rebuilt from events.

**For "canonical" to hold:**

1. All mutations MUST emit events (no direct db writes that skip events)
2. File-originated changes MUST be representable as events
3. Rebuild from events MUST produce identical state

**Three sync modes** (don't conflate them):

1. **Snapshot import** — `createRepo()` parses files once to populate DataStore
2. **Manual sync** — explicit `repo.sync()` calls
3. **Continuous sync** — `repo.watch()` keeps them in sync

---

## DataStore Interface (Pure)

**DataStore is the pure tree interface.** Most code works with just this:

```typescript
interface DataStore extends Disposable {
  // Query
  getNode(id: string): Node | null
  getChildren(parentId: string | null): Node[]
  search(query: string): Node[] // km query language

  // Mutate
  addNode(parentId: string | null, data: NodeData): string
  updateNode(id: string, changes: Partial<Node>): void
  deleteNode(id: string): void

  // Watch for changes in THIS store
  watch(): Watcher // AsyncDisposable, emits Change events
}
```

**Internal components (nodes, blobs, events) are NOT exposed on DataStore.**
Infrastructure code that needs internals uses capability interfaces.

---

## Layered Capabilities

DataStore implementations may provide additional capabilities. Use intersection types:

```typescript
// Optional capabilities - for infrastructure code only
interface EventSourced {
  readonly events: EventLog
  rebuild(): Promise<void>
}

interface HasDatabase {
  readonly database: Database // Raw SQLite access
}

// Concrete implementations compose capabilities
type DBDataStore = DataStore & EventSourced & HasDatabase
type MapDataStore = DataStore // Pure in-memory, no extras

// Usage: infrastructure code can require specific capabilities
function rebuildFromEvents(store: DataStore & EventSourced) {
  await store.rebuild()
}

// Most code just uses DataStore
function createBoard(data: DataStore, rootId: string): Board
```

**Why layered capabilities:**

- DataStore interface stays pure and minimal
- Infrastructure code declares what it needs via types
- Easy to add new capabilities without bloating base interface
- Type system enforces which code can access what

---

## FileTree Interface (NOT a DataStore)

FileTree provides simple file I/O. It does NOT implement DataStore:

```typescript
interface FileTree extends Disposable {
  readonly root: string
  read(relativePath: string): string
  write(relativePath: string, content: string): void
  exists(relativePath: string): boolean
  list(relativePath?: string): string[]
  watch(): FSWatcher // Raw file system events
}
```

**Why FileTree is not a DataStore:**

- Files have O(n) performance for queries (must parse all)
- DataStore semantics (getNode by ID) require indexing files don't have
- Sync translates between formats, doesn't copy store-to-store
- Simpler implementation, clearer responsibility

**FileTree Implementations:**

```typescript
createDiskFileTree(root: string): FileTree   // node:fs
createMemFileTree(): FileTree                // memfs
```

---

## Repo Composition

Repo composes DataStore + optional FileTree + Config + sync:

```typescript
interface Repo extends Disposable {
  readonly data: DataStore // indexed storage (always present)
  readonly files?: FileTree // human-editable files (optional)
  readonly config: ConfigStore

  // Sync operations (only meaningful when files exists)
  sync(): Promise<SyncResult> // One-shot reconciliation
  watch(): Watcher // Ongoing bidirectional sync
}
```

---

## DataStore vs Repo: Which to Use?

**DataStore** is the simpler interface — use it when you only need tree operations:

| Use DataStore when...        | Use Repo when...                  |
| ---------------------------- | --------------------------------- |
| Unit testing tree logic      | Need sync between files ↔ data    |
| Components that query/mutate | Need config (TUI settings, etc.)  |
| Board navigation logic       | CLI commands on full repos        |
| Pure data transformations    | File watching / watcher lifecycle |

```typescript
// Board only needs DataStore (tree operations)
function createBoard(data: DataStore, rootId: string): Board

// Many tests can use DataStore directly
test("getChildren returns sorted nodes", () => {
  const data = createMapDataStore()
  data.addNode(null, { type: "task", content: "A" })
  // ...
})

// Repo for full CLI commands
async function viewCommand(path: string) {
  using repo = createRepo(path)
  const board = createBoard(repo.data, "@projects")
  // ...
}
```

**Refactoring implication:** Many current tests that create full Repo objects could be simplified to use DataStore directly. This makes tests faster and more focused.

---

## Sync as Translation

Sync translates between file format and data format. It is NOT a generic store-to-store operation:

```typescript
// Sync operations on Repo
interface Repo {
  // One-shot: reconcile now and return
  sync(): Promise<SyncResult>

  // Ongoing: watch both, keep them in sync
  watch(): Watcher // AsyncDisposable
}

// SyncResult from one-shot sync
interface SyncResult {
  fromFiles: number // Changes applied from files → data
  fromData: number // Changes applied from data → files
  conflicts: Conflict[]
}
```

**Current implementation (to be refactored):**

| Direction    | Current                                         | Target                          |
| ------------ | ----------------------------------------------- | ------------------------------- |
| Files → Data | `reconcileDirectory()` (inode/mtime comparison) | `files.watch()` → apply to data |
| Data → Files | `applyEventToFs()` (event-driven regeneration)  | `data.watch()` → apply to files |

**Key insight:** The current `reconcileDirectory()` is really `diff(files, data)` but with FS-specific optimizations (inode tracking, mtime comparison).

**Loop-safe requirement:** When sync writes to files, that write must NOT re-trigger sync back to data (echo loop suppression).

**Conflict resolution:**

- Default: last-write-wins (compare updated_at)
- Option: `"files_wins"` or `"data_wins"` for deterministic resolution

**Sync is a first-class subsystem**, not a utility. It does semantic lifting on the file side:

- Debounce rapid file changes
- Parse markdown to extract nodes
- Coalesce multiple FS events into logical changes
- Suppress echo loops (writes that would re-trigger sync)

Don't try to "simplify" sync into a generic function — it encodes domain knowledge.

---

## Factory Functions

```typescript
// Full repo with file sync (most common)
createRepo(path: string): Repo
// → { data: auto-detect, files: node:fs, config, sync() }

// Bare repo - no files (like git bare repo)
createBareRepo(data: DataStore, config?: ConfigStore): Repo
// → { data, files: null, config }
// Use for: daemon, database-only ops, imports, API server

// DataStore factories
createDBDataStore(db: Database, blobs: BlobStore): DBDataStore
createDiskDataStore(path: string): DBDataStore  // Opens db + blobs from path
createMemDataStore(): DBDataStore               // SQLite :memory:
createMapDataStore(): DataStore                 // Pure Maps (fastest, testing)

// FileTree factories
createDiskFileTree(root: string): FileTree   // node:fs
createMemFileTree(): FileTree                // memfs
```

**For testing**, swap implementations:

- `createMemDataStore()` — SQLite in memory (real queries, no disk)
- `createMapDataStore()` — Pure Maps (fastest, no SQL)
- `createMemFileTree()` — In-memory filesystem

**Naming convention:**

| Creates                 | Factory name            |
| ----------------------- | ----------------------- |
| Repo with files         | `createRepo()`          |
| Repo (bare, no files)   | `createBareRepo()`      |
| DBDataStore (low-level) | `createDBDataStore()`   |
| DBDataStore (disk)      | `createDiskDataStore()` |
| DBDataStore (memory)    | `createMemDataStore()`  |
| DataStore (maps)        | `createMapDataStore()`  |
| FileTree (disk)         | `createDiskFileTree()`  |
| FileTree (mem)          | `createMemFileTree()`   |

---

## Component Interfaces

```typescript
interface ConfigStore {
  readonly tui: TuiConfig
  readonly beads: BeadsConfig
  reload(): void
}

interface BlobStore {
  store(content: string): string // Returns hash
  load(hash: string): string | null
  has(hash: string): boolean
  delete(hash: string): void
}

interface EventLog {
  append(event: Event): void
  read(): AsyncIterable<Event>
  getLastEventId(): string | null
}
```

---

## Pluggability

DataStore bundles nodes + blobs + events because they need transactional consistency:

- Nodes reference `content_hash` → blobs store content by hash
- Replaying events rebuilds both nodes and blobs
- Swapping SQLite → PostgreSQL swaps all three together

ConfigStore stays separate — it doesn't change when you swap data backends.

---

## Composition Principles

### 1. Representation, Not Peer

When A and B sync, ask: are they peers or is one a representation?

- **Peers**: Same interface, same semantics, either can be authoritative
- **Representation**: One is canonical, the other is a view/projection

**FileTree and DataStore are NOT peers.** FileTree is a human-editable representation.

### 2. Bundle What Needs Transactional Consistency

```typescript
// nodes + blobs + events bundled because:
// - Nodes reference content_hash → blobs store content
// - Replaying events rebuilds both
// - Swapping SQLite → PostgreSQL swaps all three
interface DBDataStore extends DataStore {
  readonly database: Database
  readonly blobs: BlobStore
  readonly events: EventLog
}
```

**Test:** "If I swap X, does Y need to swap too?" → Bundle them.

### 3. Separate What's Independent

```typescript
// Config doesn't change when swapping data backends
interface Repo {
  config: ConfigStore // Independent
  data: DataStore // Bundled (nodes + blobs + events)
}
```

### 4. Optional When Possible

```typescript
interface Repo {
  files?: FileTree // null = no file sync (daemon, API)
  data: DataStore // Always required
}
```

### 5. Factory Naming

```typescript
// Pattern: create{Implementation}{DomainObject}()
createDiskDataStore(path) // SQLite + filesystem blobs
createMemDataStore() // SQLite :memory: + Map blobs
createMapDataStore() // Pure Maps (fastest)
createDiskFileTree(root) // node:fs
createMemFileTree() // memfs
```

---

## Node ID Scheme

Node IDs are generated by km and stored in markdown frontmatter:

```yaml
---
id: abc123
---
# Task title
```

**ID lifecycle:**

1. **Creation**: When a node is created (TUI or CLI), km generates a unique ID
2. **FileTree**: IDs are embedded in frontmatter; files without IDs get one on first sync
3. **DataStore**: IDs are the primary key in the `nodes` table
4. **Sync**: IDs are the join key — same ID = same node

**ID format:** Short random strings (nanoid-style). Implementation detail, not part of contract.

---

## Implementation Strategy: DELETE FIRST, FIX SECOND

### The Pattern: COMMENT OUT WITH GUIDANCE

1. **Comment out** the old code (don't delete yet)
2. **Add stern warnings** with:
   - Why it's deprecated
   - What to do INSTEAD
   - That "temporary" re-enabling is NOT okay
3. **Run `bun tsc --noEmit`** to get all breaks
4. **Fix each break** — guidance is right there

### Template

```typescript
// ============================================================================
// ⛔ DEPRECATED: [PATTERN] - DO NOT RE-ENABLE
// ============================================================================
// Tracked in bead: [bead-id]
//
// ❌ DO NOT:
// - Uncomment "temporarily" to make things work
// - Copy this pattern elsewhere
// - Add fallbacks like `options?.foo ?? deprecatedFoo()`
//
// ✅ INSTEAD:
// - Tests: use `env.db` from withTestEnv()
// - CLI: use `repo.data` or open db directly
// - Internal: require db as explicit parameter
//
// See: docs/adr/002-domain-objects-refactor.md
// ============================================================================

/*
[original code]
*/
```

### Timebox

**Delete commented code after CI passes.** Comments are breadcrumbs during migration. Once all consumers are updated, delete them.

---

## Execution Order

### Phase 0: Update Steering Docs (FIRST)

1. **Update CLAUDE.md Section 15** with composition principles
2. **Create `.claude/skills/refactor.md`** with COMMENT OUT WITH GUIDANCE pattern

### Phase 1: Remove Singletons

3. **Comment out singleton code in db-instance.ts** with stern warnings
4. **Run `bun tsc --noEmit`** — Capture all breaks
5. **Fix internal source files** — query.ts, watcher.ts, rebuild.ts, store.ts, vault-loader.ts, db-ops.ts
6. **Fix testing/env.ts** — Replace runWithDb usage
7. **Fix test files** — 11 files use getDb()
8. **Verify** — `bun tsc --noEmit && bun run test:fast`

### Phase 2: DataStore Interface

9. **Create DataStore interface** (pure, no internal exposure)
10. **Create capability interfaces** — EventSourced, HasDatabase
11. **Create ConfigStore interface** — separate from DataStore
12. **Implement createDBDataStore(db, blobs)** — SQLite + blobs
13. **Implement createDiskDataStore(path)** — convenience wrapper
14. **Implement createMemDataStore()** — SQLite :memory: + Map blobs
15. **Implement createMapDataStore()** — Pure Maps (fastest, no SQL)

### Phase 3: FileTree Interface

16. **Create FileTree interface** — (read/write/exists/list/watch)
17. **Implement createDiskFileTree(root)** — Real node:fs
18. **Implement createMemFileTree()** — In-memory (memfs)
19. **Update sync layer** — Use FileTree instead of direct fs calls

### Phase 4: Repo Composition

20. **Create Repo interface** — `{ data, files?, config, sync(), watch() }`
21. **Implement createRepo()** — files + data, auto-detection
22. **Implement createBareRepo()** — data only, no files (daemon/db-only)
23. **Implement createTestRepo()** — Map data store, no files (fastest)
24. **Migrate existing createRepo() callers**
25. **Delete old store.ts** — Replaced by DataStore

### Phase 5: DataStore vs Repo Audit

26. **Audit tests** — Which tests create Repo but only need DataStore?
27. **Audit components** — Which take Repo but only use DataStore methods?
28. **Simplify signatures** — Change `repo: Repo` to `data: DataStore` where possible

### Phase 6: Terminology Consistency

29. **Audit docs/** — Update all documentation to use new terminology
30. **Audit CLI help/usage** — `--help` output, command descriptions, error messages
31. **Audit CLI argument names** — Rename args like `--vault` → `--repo` if needed
32. **Audit CLAUDE.md** — Ensure examples use Repo/DataStore/FileTree consistently
33. **Search for old terms** — Grep for "vault", "store", "FileStore" in docs/comments

**Terminology mapping:**
| Old term | New term |
|----------|----------|
| Repo | Repo |
| Store | DataStore |
| FileStore | FileTree |
| repo path | repo path |

---

## Files to Remove/Consolidate

| File                         | Action                               |
| ---------------------------- | ------------------------------------ |
| `db-instance.ts`             | Keep only `getDbPath()`, `closeDb()` |
| `store.ts`                   | Delete — replaced by DataStore       |
| Singleton exports in `db.ts` | Remove                               |
| `isMemoryMode()`             | Delete — use explicit mode           |
| `runWithDb()`                | Delete — tests use env.db            |

---

## Verification

```bash
bun tsc --noEmit        # No getDb/setDb errors
bun run test:fast       # Tests pass
bun km view /tmp/repo   # TUI works
```

---

## Related

- [ADR-001: TUI Architecture](./001-tui-architecture.md)

---

## Implementation Status

### Completed

- **Phase 2: DataStore** — `data-store.ts` with `createMapDataStore()`, `createMemDataStore()`, `createDBDataStore()`
- **Phase 3: FileTree** — `file-tree.ts` with `createDiskFileTree()`, `createMemFileTree()`
- **Phase 4: Repo** — `repo.ts` with `createRepo()`, `createBareRepo()`, `createTestRepo()`

### Remaining

- **Phase 1: Singleton Removal** — `getDb()`, `setDb()` still used in tests (not blocking)
- **Board Migration** — Current `createBoardState()` + `boardReducer()` works; ADR-002's `createBoard(data, root)` is aspirational

### Migration Path

The new `Repo` interface aligns with ADR-002's composition pattern:

```typescript
// New pattern (ADR-002 compliant)
using repo = createRepo("/path/to/repo")
const tasks = repo.data.getAllNodes().filter((n) => n.type === "task")

// Bare repo for daemon/API (no files)
using repo = createBareRepo(dataStore)

// Fast testing (in-memory, no files)
using repo = createTestRepo()
```

Existing `Repo` (createRepo) remains for backwards compatibility during migration. The key differences:

| Aspect      | Repo (legacy)      | Repo (ADR-002)                |
| ----------- | ------------------ | ----------------------------- |
| Data access | `repo.getNode()`   | `repo.data.getNode()`         |
| File access | N/A                | `repo.files?.read()`          |
| Composition | Monolithic         | DataStore + FileTree + Config |
| Testing     | Requires full load | `createTestRepo()` instant    |

### Phase 5 Audit Findings

**Repo methods used across codebase:**

| Method                                   | DataStore?    | Usage Pattern      |
| ---------------------------------------- | ------------- | ------------------ |
| `getNode(id)`                            | ✅ Yes        | Basic lookup       |
| `getChildren(parentId)`                  | ✅ Yes        | Tree traversal     |
| `getAllNodes()`                          | ✅ Yes        | Bulk operations    |
| `search(query)`                          | ✅ Yes        | Full-text search   |
| `addNode/updateNode/deleteNode/moveNode` | ✅ Yes        | Mutations          |
| `getChildCounts(parentIds)`              | ❌ Vault only | Batch optimization |
| `resolveNode(query)`                     | ❌ Vault only | Smart resolution   |
| `query(expression)`                      | ❌ Vault only | Query language     |
| `getSubtree/getAncestors`                | ❌ Vault only | Tree queries       |
| `appendTaskToFile`                       | ❌ Vault only | File mutation      |

**Conclusion:** Most code genuinely needs Repo features. Pure DataStore usage is rare.
The pattern should be:

- Use `DataStore` for pure tree operations in isolated components
- Use `Repo` for full application features

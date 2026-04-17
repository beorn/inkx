# ADR-002-ALT: Domain Object Architecture (Original Design)

> **Status:** SUPERSEDED by [ADR-002](./002-domain-objects-refactor.md)
>
> This document captures the original design that treated FileStore and DataStore as peer stores implementing the same interface.

---

## Goal

Refactor to **composable domain objects** with clear separation of concerns:

1. **Remove singletons** - No more getDb/setDb/isMemoryMode globals
2. **Composable layers** - FileStore (markdown) + DataStore (.km/) + ConfigStore
3. **Clear Repo composition** - Mix/match real/memory/mock for each layer
4. **Optional: Drizzle** - Typed queries (nice-to-have, not the focus)

**Naming convention:**

- **Repo** = composed domain object (FileStore + DataStore + ConfigStore)
- Methods like `getNode()`, `search()` delegate to `repo.data`

---

## Core Insight

The current architecture has unclear boundaries:

- `Repo` = database + mode + queries + mutations + events + fs + ...
- `mode` = memory vs disk (but _what_ is in memory/disk?)
- `FakeRepo` = completely different implementation, not composition

**Better model:** Repo composes three domain objects:

```
Repo = FileStore + DataStore + ConfigStore
```

Each can be real, in-memory, or mocked independently.

---

## Terminology

A **store** is a tree of content (markdown/text and binary files) that can be stored in:

- A **file store** — markdown files and folders on disk
- A **data store** — a database for nodes + blob store for binary data

**km always operates on the data store**, but may optionally **sync** this to another store (like a file store).

All stores share the same API surface — query, mutate, watch. Stores can be synced: `sync(store1, store2)`.

| Name           | What it is                                                 |
| -------------- | ---------------------------------------------------------- |
| **store**      | A tree of content (tasks, notes, projects) with common API |
| **file store** | Store backed by markdown files you can edit                |
| **data store** | Store backed by database + blobs (what km operates on)     |
| **sync**       | Bidirectional update between two stores                    |
| **config**     | Settings (cosmicconfig: `km.config.yaml`, `.kmrc`, etc.)   |

---

## What Happens When You Run km

When you run `km` on a file store (point it at a folder or markdown file):

1. **If `.km/` exists:**
   - Load config via cosmicconfig rooted at repo path
   - Open DataStore from `.km/store/` (database, blobs) + `.km/store-events.jsonl`
   - Sync is **opt-in** — call `vault.sync()` or `vault.watch()` to start
   - Both stores persist independently

2. **If no `.km/` exists:**
   - Create an in-memory DataStore (cache for fast queries)
   - FileStore (markdown files) IS the persistence
   - Changes sync immediately back to files
   - `km init` creates `.km/` for persistent DataStore

**Key distinction:**

- **With `.km/`**: Two persistent stores syncing bidirectionally
- **Without `.km/`**: FileStore persists, DataStore is just a query cache

```
/my-repo/
├── km.config.yaml            ← config (cosmicconfig at root)
├── projects.md               ┐
├── inbox.md                  ├─ file store
├── notes/meeting.md          ┘
└── .km/                      ← created by `km init`
    ├── store-events.jsonl    ← event log (can rebuild store, git-friendly)
    └── store/                ← derived DataStore (gitignored)
        ├── state.db          ← nodes database
        └── blobs/            ← content-addressable storage
```

```
┌────────────┐                  ┌────────────┐
│ file store │ ←──── sync ────→ │ data store │
└────────────┘                  └────────────┘
   optional*                       required
   (always persisted               (memory or disk)
    when present)
```

---

## Store API

**All stores have the same API surface** — file stores and data stores implement the same interface:

> **Important:** DataStore is the canonical query path for interactive use. FileStore implements Store semantics to enable diff/sync operations, but its operations are expensive (O(n) file parsing). Never use FileStore for product queries.

```typescript
interface Store extends Disposable {
  // Query
  getNode(id: string): Node | null
  getChildren(parentId: string | null): Node[]
  search(query: string): Node[] // "is:task", "status:todo", "type:section", etc.

  // Mutate
  addNode(parentId: string | null, data: NodeData): string
  updateNode(id: string, changes: Partial<Node>): void
  deleteNode(id: string): void

  // Watch for changes in THIS store
  watch(): Watcher // AsyncDisposable, emits Change events
}

// Note: Store.watch() watches ONE store for changes
// Repo.watch() coordinates sync BETWEEN stores (files ↔ data)

// Both file and data stores implement the same interface:
interface FileStore extends Store {
  /* file-specific: root, readFile, etc. */
}
interface DataStore extends Store {
  nodes: NodeDb
  blobs: BlobStore
  events: EventLog
}
```

**Stores can be synced:** Today, km syncs FileStore ↔ DataStore. A generic `sync(store1, store2)` is a future refactor once `Store.watch()` is stable.

---

## Canonical Tree Contract

Both FileStore and DataStore project to the **same logical tree model**. This means:

- A node with ID `abc123` represents the same logical entity in both stores
- The tree structure (parent-child relationships) is identical
- Content and metadata are semantically equivalent

This shared model is what makes `sync(fileStore, dataStore)` meaningful — it's comparing two representations of the same tree, not two unrelated data structures.

---

## Store Invariants

These invariants MUST hold for all Store implementations:

1. **Identity**: `getNode(id)` returns the same logical node regardless of backend
2. **Hierarchy**: `getChildren(parentId)` returns nodes whose `parent_id === parentId`
3. **Ordering**: Children are sorted by `parent_idx` (fractional indexing)
4. **Mutations**: After `updateNode(id, changes)`, `getNode(id)` reflects those changes
5. **Watch consistency**: Changes emitted by `watch()` match mutations applied to the store

Note: Performance characteristics differ (see Backend Semantics), but semantics are identical.

**FileStore implementation notes:**

- Mutations rewrite markdown files; changes are visible after file write completes
- `watch()` MUST be loop-safe: self-authored writes do not re-emit as external changes
- Move and ordering are represented via frontmatter `parent_id` and `parent_idx`

---

## Store vs Repo: Which to Use?

**Store** is the simpler interface — use it when you only need tree operations:

| Use Store when...            | Use Repo when...                  |
| ---------------------------- | --------------------------------- |
| Unit testing tree logic      | Need sync between files ↔ data    |
| Components that query/mutate | Need config (TUI settings, etc.)  |
| Board navigation logic       | CLI commands on full repos        |
| Pure data transformations    | File watching / watcher lifecycle |

```typescript
// Board only needs Store (tree operations)
function createBoard(store: Store, rootId: string): Board

// Many tests can use Store directly
test("getChildren returns sorted nodes", () => {
  const store = createMapDataStore()
  store.addNode(null, { type: "task", content: "A" })
  // ...
})

// Repo for full CLI commands
async function viewCommand(path: string) {
  using repo = createRepo(path)
  const board = createBoard(repo.data, "@projects")
  // ...
}
```

---

## Architecture: Two Peer Stores

**Key insight:** FileStore and DataStore are peers - two different storage backends for the same repo that sync with each other.

| Aspect   | FileStore                     | DataStore                     |
| -------- | ----------------------------- | ----------------------------- |
| What     | Markdown files                | Nodes + blobs + events        |
| Format   | Human-readable text           | Structured database           |
| Editing  | VS Code, Obsidian, any editor | TUI, CLI, API                 |
| Truth    | Source of truth for content   | Source of truth for structure |
| Backends | node:fs, memfs                | SQLite, PostgreSQL, MongoDB   |

**When files is null:** No filesystem sync - useful for daemon, database-only queries, imports, API server.

---

## Backend Semantics (Performance Asymmetry)

While FileStore and DataStore share the Store interface, their performance profiles differ dramatically:

| Operation         | DataStore            | FileStore                        |
| ----------------- | -------------------- | -------------------------------- |
| `getNode(id)`     | O(1) indexed lookup  | O(n) parse all files to find     |
| `getChildren(id)` | O(log n) indexed     | O(n) parse files                 |
| `search(query)`   | O(log n) via FTS5    | O(n) parse all, filter in memory |
| `watch()`         | Event log / triggers | fs.watch() + reparse             |

**How FileStore implements Store:**

- `fileStore.getNode(id)` → find file containing node, parse it, return node
- `fileStore.search(query)` → parse all files, filter results (expensive!)
- Real-world usage: DataStore handles queries, FileStore only used for sync diffs

**Implication:** FileStore is primarily used for sync operations (comparing against DataStore), not for interactive queries. DataStore handles all user-facing queries.

**Anti-pattern:** Don't call `fileStore.search()` in a hot path — it parses every file.

---

## Sync Protocol

Sync keeps two stores in alignment. It has two phases:

1. **Initial reconciliation** — Compare current state, align differences
2. **Ongoing sync** — Watch both stores, propagate changes

```typescript
// Sync operations on Repo
interface Repo {
  // One-shot: reconcile now and return
  sync(): Promise<SyncResult>

  // Ongoing: watch both stores, keep them in sync
  watch(): Watcher // AsyncDisposable
}

// SyncResult from one-shot sync
interface SyncResult {
  fromFiles: number // Changes applied from files → data
  fromData: number // Changes applied from data → files
  conflicts: Conflict[]
}

// Change event emitted by watch()
interface Change {
  type: "add" | "update" | "delete" | "move"
  nodeId: string
  source: "files" | "data"
  node?: Node
  changes?: Partial<Node>
}
```

**Current implementation (to be refactored):**

| Direction | Current                                         | Target                                   |
| --------- | ----------------------------------------------- | ---------------------------------------- |
| FS → DB   | `reconcileDirectory()` (inode/mtime comparison) | `fileStore.watch()` → apply to dataStore |
| DB → FS   | `applyEventToFs()` (event-driven regeneration)  | `dataStore.watch()` → apply to fileStore |

**Key insight:** The current `reconcileDirectory()` is really `diff(fileStore, dataStore)` but with FS-specific optimizations (inode tracking, mtime comparison). The refactored version should:

1. Make `FileStore.watch()` emit change events (not raw fs events)
2. Make `DataStore.watch()` emit change events
3. `sync()` subscribes to both and cross-applies changes

**Conflict resolution:**

- Default: last-write-wins (compare updated_at)
- Option: `"files_wins"` or `"data_wins"` for deterministic resolution

---

## Component Interfaces

```typescript
interface ConfigStore {
  readonly tui: TuiConfig
  readonly beads: BeadsConfig
  reload(): void
}

interface NodeDb {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  search(query: string): KNode[]
  insertNode(node: NewNode): void
  updateNode(id: string, changes: Partial<KNode>): void
  deleteNode(id: string): void
  rawQuery?<T>(sql: string, params?: unknown[]): T[] // SQLite only
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

## Factory Pattern

```typescript
function createRepo(
  path: string,
  options?: {
    files?: FileStore
    data?: DataStore
    config?: Config
  },
): Repo {
  const files = options?.files ?? createDiskFileStore(path)
  const data =
    options?.data ??
    (existsSync(join(path, ".km/store"))
      ? createDiskDataStore(join(path, ".km/store"))
      : createMemDataStore()) // In-memory until `km init`
  const config = options?.config ?? createCosmicConfig(path, "km")

  // Note: sync is NOT started automatically
  // Caller must use repo.sync() or repo.watch()
  return { files, data, config, ...methods }
}
```

**For testing**, swap store implementations:

- `createMemDataStore()` — SQLite in memory (real queries, no disk)
- `createMapDataStore()` — Pure Maps (fastest, no SQL)
- `createMemFileStore()` — In-memory filesystem

**DataStore Implementations:**

```typescript
// Disk data store (production)
createDiskDataStore(storeDir: string): DataStore
// - nodes: SQLite at .km/store/state.db
// - blobs: filesystem at .km/store/blobs/
// - events: append to .km/store-events.jsonl

// Memory data store (testing with real SQLite)
createMemDataStore(): DataStore
// - nodes: SQLite :memory:
// - blobs: Map<string, string>
// - events: array in memory

// Map data store (fastest, for FakeRepo)
createMapDataStore(): DataStore
// - nodes: Map<string, KNode> (no SQLite overhead)
// - blobs: Map<string, string>
// - events: no-op (null)
```

**FileStore Implementations:**

```typescript
createDiskFileStore(root: string): FileStore   // node:fs
createMemFileStore(): FileStore                // memfs
```

**Repo Factories:**

```typescript
// Full repo with files + data (most common)
createRepo(path: string, options?: {
  data?: DataStore        // Override data store (default: auto based on .km/)
  files?: FileStore       // Override file store (default: node:fs)
}): Repo

// Data-only repo - no files, just structured data
createDataRepo(data: DataStore, config?: ConfigStore): Repo
// files: null (no sync)
// Useful for: daemon, database-only ops, imports, API server

// Fake repo - all in-memory, fastest
createFakeRepo(options?: { nodes?: KNode[] }): Repo
// files: null
// data: createMapDataStore()
// Fastest for unit tests with canned data
```

**Naming convention:**

| Creates            | Factory name            | Example                                  |
| ------------------ | ----------------------- | ---------------------------------------- |
| Repo (full)        | `createRepo()`          | `createRepo("/path")`                    |
| Repo (data-only)   | `createDataRepo()`      | `createDataRepo(dataStore)`              |
| Repo (testing)     | `createFakeRepo()`      | `createFakeRepo({ nodes })`              |
| DataStore (disk)   | `createDiskDataStore()` | `createDiskDataStore("/path/.km/store")` |
| DataStore (memory) | `createMemDataStore()`  | `createMemDataStore()`                   |
| DataStore (maps)   | `createMapDataStore()`  | `createMapDataStore()`                   |
| FileStore (disk)   | `createDiskFileStore()` | `createDiskFileStore("/path")`           |
| FileStore (memory) | `createMemFileStore()`  | `createMemFileStore()`                   |
| Tasks (view)       | `createTasks()`         | `createTasks(store)`                     |

---

## Pluggability

DataStore bundles nodes + blobs + events because they need transactional consistency:

- Nodes reference `content_hash` → blobs store content by hash
- Replaying events rebuilds both nodes and blobs
- Swapping SQLite → PostgreSQL swaps all three together

ConfigStore stays separate — it doesn't change when you swap data backends.

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
2. **FileStore**: IDs are embedded in frontmatter; files without IDs get one on first sync
3. **DataStore**: IDs are the primary key in the `nodes` table
4. **Sync**: IDs are the join key — same ID = same node

**ID format:** Short random strings (nanoid-style). Implementation detail, not part of contract.

---

## Composition Principles

| Principle                   | Test                                            | Example                  |
| --------------------------- | ----------------------------------------------- | ------------------------ |
| **Peers, not nested**       | "Do A and B sync?" → peers                      | files ↔ data are peers   |
| **Bundle for consistency**  | "If I swap X, does Y swap?" → bundle            | nodes + blobs + events   |
| **Separate if independent** | "Does X change when Y changes?" → no → separate | config vs data           |
| **Optional when possible**  | "Can this work without X?" → nullable           | files: FileStore \| null |

---

## Historical Context: What Went Wrong

### The Backwards Compatibility Trap

On Jan 25, commit `8014128` introduced "singleton wrappers for backwards compatibility":

**This was the wrong approach.** It led to:

1. **Gradual migration never completed** - With fallbacks available, old patterns persisted
2. **Fix-on-top-of-fix cycle** - Many commits patching symptoms instead of removing root cause
3. **Inconsistent codebase** - Some code used new patterns, some still used singletons
4. **False sense of progress** - Exports removed but internal code still depended on singletons

### Lesson Learned

> "I find that you have a tendency to 'fall back' to the way you did it historically"

**The user's key insight:** When fixing breaks, the temptation is to restore old patterns. The solution is to make fallbacks impossible by deleting the code first.

---

## CRITICAL: Implementation Strategy

**DELETE FIRST, FIX SECOND** - To avoid falling back to old patterns:

1. **Delete all singleton code from db-instance.ts** - Make fallbacks impossible
2. **Run tsc --noEmit** - Get full list of breaks
3. **Fix each break using correct pattern** - env.db, repo.database, or direct db param
4. **Never re-add getDb/setDb/etc.** - If tempted to "fall back", STOP and use correct pattern

---

## Execution Order

### Phase 0: Update Steering Docs (FIRST)

1. **Create `.claude/skills/refactor.md`** with COMMENT OUT WITH GUIDANCE pattern
2. **Update CLAUDE.md Section 15** with composition principles

### Phase 1: Remove Singletons

1. **Comment out singleton code in db-instance.ts** with stern warnings
2. **Run `bun tsc --noEmit`** - Capture all breaks
3. **Fix internal source files** - query.ts, watcher.ts, rebuild.ts, store.ts, repo-loader.ts, db-ops.ts
4. **Fix testing/env.ts** - Replace runWithDb usage
5. **Fix test files** - 11 files use getDb()
6. **Verify** - `bun tsc --noEmit && bun run test:fast`

### Phase 2: DataStore Domain Object

7. **Create DataStore interface** with properties: `nodes`, `blobs`, `events`
8. **Create component interfaces** - NodeDb, BlobStore, EventLog
9. **Create ConfigStore interface** - separate from DataStore
10. **Implement createDiskDataStore(kmDir)** - SQLite + filesystem blobs
11. **Implement createMemoryDataStore()** - SQLite :memory: + Map blobs
12. **Implement createMapDataStore()** - Pure Maps (fastest, no SQL)

### Phase 3: FileStore Domain Object

13. **Create FileStore interface** - (read/write/exists/readdir/stat/watch)
14. **Implement createNodeFileStore(root)** - Real node:fs
15. **Implement createMemoryFileStore()** - In-memory (memfs)
16. **Update sync layer** - Use FileStore instead of direct fs calls

### Phase 4: Repo Composition

17. **Create Repo interface** - `{ config, files, data }` with files optional
18. **Implement createRepo()** - files + data, auto-detection
19. **Implement createDataRepo()** - data only, no files (daemon/db-only)
20. **Implement createFakeRepo()** - Map data store, no files (fastest)
21. **Migrate existing createRepo() callers**
22. **Delete old store.ts** - Replaced by new DataStore

### Phase 5: Store vs Repo Audit

23. **Audit tests** - Which tests create Repo but only need Store?
24. **Audit components** - Which take Repo but only use Store methods?
25. **Simplify signatures** - Change `repo: Repo` to `store: Store` where possible

---

## Files to Remove/Consolidate

| File                         | Action                               |
| ---------------------------- | ------------------------------------ |
| `db-instance.ts`             | Keep only `getDbPath()`, `closeDb()` |
| `store.ts`                   | Delete - use Repo instead            |
| Singleton exports in `db.ts` | Remove                               |
| `isMemoryMode()`             | Delete - use explicit mode           |
| `runWithDb()`                | Delete - tests use env.db            |

---

## Verification

```bash
bun tsc --noEmit        # No getDb/setDb errors
bun run test:fast       # Tests pass
bun km view /tmp/repo  # TUI works
```

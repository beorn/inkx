# Repo — mutation API and event semantics

The Repo is km's data-store facade. Factory: `createRepo(path)` → disposable. All tree queries and mutations go through it; storage internals (SQLite, file watching, event emission) are hidden behind this surface.

Defined in: `@km/storage` (see `packages/km-storage/src/repo/repo.ts`).

## The interface

```typescript
export interface Repo extends Disposable {
  readonly path: string
  readonly mode: "memory" | "disk"
  readonly data: DataStore
  readonly files: FileTree | null
  readonly config: Config
  readonly database: Database
  readonly loadErrors: LoadError[]
  readonly stats: RepoStats
  
  version: number
  subscribe(callback: () => void): () => void
  getSnapshot(): number
  touch(): void
  
  // ... (see sections below for full API)
}
```

**Reference:** `packages/km-storage/src/repo/repo.ts:763–1010`

Repo is:
- **Composed whole:** combines DataStore (indexed tree), FileTree (human-editable files), and Config
- **Mutation facade:** hides SQLite, event emitter, file watcher, link cache
- **Event source:** subscribers notified after each mutation via version counter
- **Disposable:** `close()` releases database, file watcher, and other resources

## Lifecycle and subscription

### subscribe(callback) → unsubscribe function

Subscribe to mutation events. Callback invoked after each mutation (addNode, updateNode, moveNode, deleteNode).

Returns an unsubscribe function.

Use with React's `useSyncExternalStore`:

```typescript
const version = useSyncExternalStore(
  (callback) => repo.subscribe(callback),
  () => repo.getSnapshot(),
)
```

**Reference:** `packages/km-storage/src/repo/repo.ts:797`

### getSnapshot() → number

Returns current version — stable reference for `useSyncExternalStore`.

Each mutation increments version and notifies subscribers.

**Reference:** `packages/km-storage/src/repo/repo.ts:800`

### touch() → void

Bump version and notify subscribers. Use after bulk DB writes that bypass the mutation API (e.g., background link resolution, rule evaluation).

**Reference:** `packages/km-storage/src/repo/repo.ts:804`

### close() → void

Close and release all resources: database handle, file watcher, emitter.

**Reference:** `packages/km-storage/src/repo/repo.ts:1007`

## Queries (read-side)

### getNode(id: string) → KNode | null

Get a single node by ID.

### getNodesBatch(ids: string[]) → Map<string, KNode>

Get multiple nodes by ID in a single query.

### getChildren(parentId: string | null) → KNode[]

Get children of a node. Pass null for root.

**Cached:** Children are cached per-parent. Cache is busted on every mutation affecting that parent.

### getChildIds(parentId: string | null) → readonly string[]

Get child IDs of a node (structural read without full node hydration).

### getSubtree(nodeId: string) → KNode[]

Get full subtree under a node (depth-first, includes root).

### preloadSubtree(rootId: string | null, maxDepth: number) → void

Preload a depth-limited subtree into the children cache using a single recursive CTE query instead of N individual `getChildren` calls.

Use before operations that walk the tree (e.g., `computeDefaultFoldDepths`).

**Reference:** `packages/km-storage/src/repo/repo.ts:860`

### validateCache() → void

Validate children cache against DB. Throws on mismatch. For testing.

### getAncestors(nodeId: string) → KNode[]

Get ancestors of a node (from root to parent).

### getAllTasks() → KNode[]

Get all tasks (nodes where `item.task` is defined).

### getTasksByStatus(status: TaskStatus) → KNode[]

Get tasks by status: "todo", "wip", "blocked", "done", "dropped".

### search(query: string) → KNode[]

Full-text search using FTS5 + BM25 ranking.

### query(expression: string) → KNode[]

Execute query language expression (parser + executor in `@km/storage/query.ts`).

### queryTasks(expression: string) → KNode[]

Execute query language expression, returning only tasks.

### getLinksTo(targetId: string) → KNode[]

Get nodes linking to a target (backlink sources).

### getOutgoingLinks(sourceId: string) → KLink[]

Get outgoing links from a node (link records with href, rel, context).

### getBacklinks(nodeId: string) → KLink[]

Get backlinks (link records pointing to this node).

**Cached:** Backlink cache is keyed by node ID.

### getRenameImpact(nodeId: string) → { backlinks, childCount, ruleRefs, propRefs }

Get impact of renaming a node: backlink count, child count, rule references, property references.

### resolveNode(query: string, typeOrOptions?) → KNode | null

Smart node resolver — finds a node by ID, path, or filename.

Optional filter: `{ type?: string; taskOnly?: boolean }`.

### resolveByName(name: string) → KNode | null

Fast name-based resolution using pre-built in-memory index. O(1) lookup.

Use for render-time wikilink resolution instead of `resolveNode`.

### getRepoRootNode() → KNode | null

Get the virtual root node (parent of all top-level files).

### getChildCounts(parentIds: string[]) → Map<string, number>

Batch get child counts for multiple parent IDs.

**Reference:** `packages/km-storage/src/repo/repo.ts:838–907`

## Mutations (write-side)

Each mutation emits a Change event and returns once durable (or caller calls `subscribe` to be notified).

### addNode(parentId: string | null, node: Partial<KNode>) → string

Add a new node.

**Args:**
- `parentId: string | null` — parent ID (null for root)
- `node: Partial<KNode>` — node properties

**Returns:** ID of the newly created node.

**Event:** `node_created` Change with full node data.

**Side effects:**
- Increments version, notifies subscribers
- Busts children cache for parent
- Triggers normalization (if configured)

### updateNode(id: string, changes: Partial<KNode>) → void

Update a node's properties.

**Event:** `node_updated` Change with changed properties.

**Side effects:**
- Increments version, notifies subscribers
- Busts children cache if parent changed
- Triggers normalization

### moveNode(id: string, newParentId: string, position: number) → void

Move a node to a new parent with new sort order.

**Args:**
- `id: string` — node to move
- `newParentId: string` — target parent ID
- `position: number` — sort order (index)

**Event:** `node_moved` Change with old/new parent and position.

**Side effects:**
- Increments version, notifies subscribers
- Busts children cache for both old and new parents
- Triggers normalization

### deleteNode(id: string) → void

Delete a node.

**Event:** `node_deleted` Change with node snapshot.

**Side effects:**
- Increments version, notifies subscribers
- Busts children cache for parent
- Triggers normalization

### cloneTask(sourceId: string, changes: Partial<KNode>) → string | null

Clone a task with modifications (e.g., for recurring tasks).

**Returns:** ID of the new task, or null if source not found.

### renameNode(id: string, newContent: string, onProgress?) → void

Rename a node and update all backlinks referencing it.

Optional progress callback: `(info: { updated: number; total: number }) => void`.

### appendTaskToFile(filePath: string, content: string, options?) → void

Append a task line to a markdown file.

**Args:**
- `filePath: string` — relative or absolute path
- `content: string` — content to append
- `options.ensure?: boolean` — create file/directory if not exists

**Throws:** Error if repo has no files (bare repo).

### pathExists(relativePath: string) → boolean

Check if a path exists relative to repo root.

### rawQuery<T>(sql: string, params?: unknown[]) → T[]

Execute a raw SQL query on the database.

Returns query results as array of objects.

**Reference:** `packages/km-storage/src/repo/repo.ts:919–960`

## Event semantics

Changes flow through three stages:

1. **Apply:** `repo.apply(change)` → DB write + emitter + file sync
2. **Commit:** `repo.commit(change)` → DB write + emitter (no file sync)
3. **Subscribe:** Subscribers notified via version increment

**Change type signatures:**

| Change Type | Target | Data | Origin |
|-------------|--------|------|--------|
| `node_created` | node ID | full node | "tui", "fs", "replay", "system" |
| `node_updated` | node ID | changed properties | "tui", "fs", "system" |
| `node_moved` | node ID | {oldParent, oldPos, newParent, newPos} | "tui", "fs" |
| `node_deleted` | node ID | node snapshot | "tui", "fs" |
| (others) | — | — | — |

**Reference:** `packages/km-core/src/types.ts` (Change interface)

## Batch mutation helpers

### withDeferredFs<T>(fn: () => T) → T

Run a function with FS sync paused. Mutations inside `fn` write to DB/changes.jsonl but skip FS regeneration. After `fn` completes, call `syncToFs(nodeId)` to regenerate affected files.

Use for bulk operations where per-mutation file sync would be expensive.

**Reference:** `packages/km-storage/src/repo/repo.ts:971`

### syncToFs(nodeId: string) → void

Regenerate the .md file that contains `nodeId`. Walks up the parent chain to find the file node, then writes its subtree.

No-op if the node has no file ancestor or if there's no FS writer configured.

**Reference:** `packages/km-storage/src/repo/repo.ts:978`

## Sync and watching

### sync() → Promise<SyncResult>

One-shot sync between files and data. Reconciles current state of files with current state of data.

Only meaningful when `files` is present (non-bare repo).

**Throws:** Error if repo has no files (bare repo).

### watch(options?: Partial<WatcherOptions>) → Watcher

Create a Watcher for continuous sync. The watcher implements the Service interface with start/stop lifecycle.

Only available when `files` is present.

**Throws:** Error if repo has no files (bare repo).

**Reference:** `packages/km-storage/src/repo/repo.ts:992–1002`

## See also

- `docs/design/model/knode.md` — KNode shape and invariants
- `docs/design/model/tree-mutator.md` — TreeMutator operations (split/merge/normalize)
- `docs/design/model/klink.md` — link model and backlink cache
- `packages/km-storage/src/data-store.ts` — DataStore interface (peer to Repo)
- `packages/km-storage/src/emitter.ts` — Change emission and event sourcing
- `packages/km-core/src/types.ts` — Change type definitions

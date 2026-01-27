# Loading vs Syncing Unification Plan

## Status: Planning

## Problem

Two separate code paths handle markdown file → database operations:

1. **Loading** (`repo-loader.ts`) - initial repo load
2. **Syncing** (`reconcile.ts`) - incremental file changes

Both paths duplicate significant logic with subtle differences.

## Current Architecture

### Loading Path (repo-loader.ts)

Triggered by `createRepo({ loadFiles: true })`:

```
Filesystem → discoverFromFilesystem() → Event[] → applyEvents() → resolveLinks()
                     ↓
              parseMarkdownWithLinks()
                     ↓
              PendingLink[] collected
                     ↓
              buildFileIndex() for O(1) lookup
```

Key characteristics:

- Batch mode: collects all events, applies in transaction
- Deferred link resolution: `buildFileIndex()` after all files loaded
- Creates `PendingLink[]` for batch resolution
- No content hashing (missing optimization)

### Syncing Path (reconcile.ts)

Triggered by FileSystemWatcher events:

```
FSEvent → reconcileDirectory() → ReconcileOp[] → applyReconcileOps()
                                                        ↓
                                                 handleCreate/Update()
                                                        ↓
                                                 parseMarkdownWithLinks()
                                                        ↓
                                                 LinkResolver for O(1) lookup
```

Key characteristics:

- Incremental: processes changed files one-at-a-time
- Immediate link resolution: `LinkResolver` uses pre-existing DB state
- Content hashing: skips unchanged files via `hashContent()`
- Emits events via `emitNodeCreated/Updated/Deleted`

## Duplication Found

| Component        | Loading                                   | Syncing                                |
| ---------------- | ----------------------------------------- | -------------------------------------- |
| Markdown parsing | `parseMarkdownWithLinks()`                | Same                                   |
| File index       | `buildFileIndex()` → `Map<string, KNode>` | `LinkResolver` → `Map<string, string>` |
| Folder creation  | Implicit in event generation              | `ensureFolderHierarchy()`              |
| Content hashing  | Missing                                   | `hashContent()` comparison             |
| Link storage     | `linksToInsert[]` batch                   | `addLink()` per-link                   |

## Proposed Unification

### 1. Consolidate File Index

Use `LinkResolver` pattern in both paths:

```typescript
// Current: two implementations
// Loading: buildFileIndex() returns Map<string, KNode>
// Syncing: LinkResolver stores only IDs

// Proposed: single LinkResolver with optional full node storage
interface LinkResolver {
  resolveTarget(name: string): string | null
  resolveSection(fileId: string, section: string): string | null
  addFile(id: string, name: string): void
  getNode?(id: string): KNode | null // optional, for loading path
}
```

### 2. Add Content Hashing to Loading

Loading currently parses every file on each run. Add hash-based skip:

```typescript
// In discoverFromFilesystem():
const existingHash = getNodeContentHash(db, nodeId)
const newHash = hashContent(content)
if (existingHash === newHash) {
  // Skip parsing, reuse existing nodes
  continue
}
```

Note: This only helps on subsequent runs, not first load.

### 3. Extract Shared File Processing

Create a `processMarkdownFile()` helper:

```typescript
interface ProcessOptions {
  resolver?: LinkResolver // for immediate resolution
  pendingLinks?: PendingLink[] // for deferred resolution
  emitter?: Emitter // for event emission (sync only)
}

function processMarkdownFile(
  db: Database,
  path: string,
  content: string,
  options: ProcessOptions,
): {
  nodes: KNode[]
  wikilinks: WikilinkInfo[]
  hash: string
}
```

Both paths would call this with different options:

- Loading: `{ pendingLinks: [] }` - collect for batch
- Syncing: `{ resolver, emitter }` - resolve immediately, emit events

### 4. Unify Event Generation

Loading generates `Event[]` then applies them.
Syncing calls `emitNodeCreated()` which generates events.

These could share the same node-to-event conversion:

```typescript
function nodeToCreatedEvent(node: KNode, actor: string): Event {
  return {
    id: ulid(),
    type: "node_created",
    actor,
    ts: Date.now(),
    data: { ...node },
  }
}
```

## Non-Goals

- Don't unify the triggering mechanisms (batch vs incremental)
- Don't change the public API
- Don't merge `repo-loader.ts` and `reconcile.ts` into one file

## Migration Path

1. **Phase 1**: Use `LinkResolver` in loading path (replace `buildFileIndex()`)
2. **Phase 2**: Add content hashing to loading path
3. **Phase 3**: Extract `processMarkdownFile()` helper
4. **Phase 4**: Consolidate event generation

Each phase should be a separate PR with tests.

## Performance Impact

| Optimization               | Expected Impact              |
| -------------------------- | ---------------------------- |
| Shared LinkResolver        | Reduced code, no perf change |
| Content hashing in loading | Faster subsequent runs       |
| Shared processMarkdownFile | Reduced code, no perf change |

## Files Affected

- `packages/km-storage/src/repo-loader.ts` - loading path
- `packages/km-storage/src/watch/reconcile.ts` - syncing path
- `packages/km-storage/src/link-resolver.ts` - shared resolver
- `packages/km-storage/src/index.ts` - exports

## Open Questions

1. Should `LinkResolver` store full `KNode` or just IDs?
   - Full node: more memory, but loading path needs it for `findChildByContent()`
   - Just IDs: less memory, but requires DB query for section resolution

2. Should we use `LinkResolver.addFile()` during loading?
   - Pro: enables forward references (file A links to file B before B is loaded)
   - Con: more complex than current batch-at-end approach

3. Is content hashing worth it for loading?
   - First run: no benefit (nothing to compare against)
   - Memory mode: no benefit (no persisted state)
   - Disk mode subsequent runs: significant benefit

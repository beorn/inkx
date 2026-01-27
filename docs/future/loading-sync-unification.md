# Loading vs Syncing Unification Plan

## Status: In Progress

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
              LinkResolver for O(1) lookup (Phase 1 ✅)
```

Key characteristics:

- Batch mode: collects all events, applies in transaction
- Deferred link resolution: `LinkResolver` after all files loaded
- Creates `PendingLink[]` for batch resolution
- Memory mode only (disk mode loads from event log)

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

| Component        | Loading                    | Syncing                         | Status       |
| ---------------- | -------------------------- | ------------------------------- | ------------ |
| Markdown parsing | `parseMarkdownWithLinks()` | Same                            | Duplicated   |
| File index       | `LinkResolver`             | `LinkResolver`                  | ✅ Unified   |
| Folder creation  | Implicit in event gen      | `ensureFolderHierarchy()`       | Duplicated   |
| Content hashing  | N/A (see below)            | `hashContent()` comparison      | N/A          |
| Link storage     | `linksToInsert[]` batch    | `addLink()` per-link            | Intentional  |

## Proposed Unification

### Phase 1: Consolidate File Index ✅ COMPLETE

Both paths now use `LinkResolver` from `link-resolver.ts`:

```typescript
const resolver = createLinkResolver(db)
const targetId = resolver.resolveTarget(link.target)
if (targetId && link.section) {
  const sectionId = resolver.resolveSection(targetId, link.section)
}
```

**Commit**: `e3da819 refactor(storage): use shared LinkResolver in repo-loader`

### ~~Phase 2: Add Content Hashing to Loading~~ REMOVED

**Why this doesn't apply:**

- **Memory mode** (`discoverFromFilesystem`): Always starts with empty `:memory:` database. There's no existing hash to compare against.
- **Disk mode** (`discoverFromEvents`): Loads from the event log, doesn't scan the filesystem at all.

Content hashing is only useful when comparing current file content to previously-known content. The loading path either has no previous state (memory mode) or doesn't read files (disk mode).

The sync path (reconcile.ts) already has content hashing and that's where it belongs.

### Phase 2: Extract Shared File Processing

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

### Phase 3: Unify Event Generation

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

1. ✅ **Phase 1**: Use `LinkResolver` in loading path (replace `buildFileIndex()`)
2. **Phase 2**: Extract `processMarkdownFile()` helper
3. **Phase 3**: Consolidate event generation

Each phase should be a separate PR with tests.

## Performance Impact

| Optimization               | Expected Impact              | Status     |
| -------------------------- | ---------------------------- | ---------- |
| Shared LinkResolver        | Reduced code, no perf change | ✅ Done    |
| Shared processMarkdownFile | Reduced code, no perf change | Planned    |

## Files Affected

- `packages/km-storage/src/repo-loader.ts` - loading path
- `packages/km-storage/src/watch/reconcile.ts` - syncing path
- `packages/km-storage/src/link-resolver.ts` - shared resolver
- `packages/km-storage/src/index.ts` - exports

## Open Questions

1. ~~Should `LinkResolver` store full `KNode` or just IDs?~~
   **Resolved**: Just IDs. The `resolveSection()` method handles DB queries internally.

2. Should we use `LinkResolver.addFile()` during loading?
   - Pro: enables forward references (file A links to file B before B is loaded)
   - Con: more complex than current batch-at-end approach
   - **Current**: Not used during loading; batch resolution happens after all files loaded

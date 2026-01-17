# Unified Node Model Migration Plan

**Epic:** km-node
**Status:** Draft - Awaiting Review
**Author:** Claude
**Date:** 2026-01-16

---

## Executive Summary

Migrate from 3 separate node types to a single extensible `KNode` type:

```
BEFORE                          AFTER
──────                          ─────
DBNode (27 fields)              KNode (15 fields)
   ↓ copy/rename                   ↓ spread + add children
TNode (19 fields)               TreeNode extends KNode
   ↓ copy/rename                   ↓ (no change, just check Sets)
NodeViewModel (13 fields)       (removed - use TreeNode + Sets)
```

**Note:** We use `KNode` instead of `Node` to avoid conflicts with DOM Node during migration. Can be renamed to `Node` after migration is complete.

---

## Current Problems

### 1. Property Duplication
Same data copied at each layer with different names:
- `id` → `nodeId` → `id` (back again!)
- `parent_id` → `parentId` → (removed)
- `task_status` → `taskStatus` → `taskStatus`
- `fs_path` → `fsPath` → (removed)

### 2. Conversion Overhead
Two 20+ line conversion functions:
- `nodeToTNode()` in apps/km-cli/src/tui2/tui2.tsx
- `toNodeViewModel()` in packages/km-board/src/transformers.ts

### 3. Inconsistent Naming
- DBNode: snake_case (`parent_id`, `task_status`)
- TNode: camelCase (`parentId`, `taskStatus`)
- Mixed: `nodeId` vs `id`

### 4. Computed Fields on Type
Fields that should be computed are stored:
- `isTask` = `taskStatus !== undefined`
- `icon` = always undefined
- `color` = `rules?.color`
- `childCount` = `getChildren(id).length`

---

## Proposed Architecture

### Base KNode Type

```typescript
// @km/core/types.ts
interface KNode {
  // Identity (required)
  id: string;
  type: NodeType;

  // Structure (required)
  parentId: string | null;
  parentIdx: number;

  // Identity (optional)
  name?: string;      // Stable slug (filename, heading slug)
  title?: string;     // Display text

  // Content
  content?: string;   // Body text

  // Task properties
  taskStatus?: TaskStatus;
  priority?: number;
  dueDate?: string;
  scheduledDate?: string;

  // File location (sparse - only folder/file/section)
  fsPath?: string;
  mdLine?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;

  // Extension bucket (for rare fields)
  data: Record<string, unknown>;
}
```

### TreeNode Extension

```typescript
// @km/tree/types.ts
interface TreeNode extends KNode {
  children: TreeNode[];
  depth: number;
}
```

### UI State (NOT on nodes)

```typescript
// @km/board/boardTypes.ts - ALREADY EXISTS
interface BoardState {
  foldedNodes: Set<string>;     // ✓ exists
  selectedNodes: Set<string>;   // ✓ exists
  collapsedNodes: Set<string>;  // ✓ exists
}

// Remove NodeViewModel - use TreeNode directly
// Check isFolded via: foldedNodes.has(node.id)
```

---

## Field Disposition

### Keep on KNode (15 fields)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Required, ULID |
| `type` | NodeType | Required |
| `parentId` | string \| null | Required, tree structure |
| `parentIdx` | number | Required, ordering |
| `name` | string? | Stable identifier |
| `title` | string? | Display text |
| `content` | string? | Body text |
| `taskStatus` | TaskStatus? | Workflow |
| `priority` | number? | Task |
| `dueDate` | string? | Task |
| `scheduledDate` | string? | Task |
| `fsPath` | string? | File location |
| `mdLine` | number? | File location |
| `createdAt` | number | Metadata |
| `updatedAt` | number | Metadata |
| `data` | Record | Extension bucket |

### Move to `data` Bucket

| Field | Reason | Access Pattern |
|-------|--------|----------------|
| `symlinkTo` | Rare feature | `node.data.symlinkTo as string` |
| `taskMark` | Only for serialization | `node.data.taskMark as TaskMark` |
| `assignedTo` | Rarely used | `node.data.assignedTo as string` |
| `recurrence` | Rare | `node.data.recurrence as string` |
| `recurPrev` | Rare | `node.data.recurPrev as string` |
| `sourceEmbedding` | Transclusion only | `node.data.sourceEmbedding as string` |
| `rules` | Parsed from inline attrs | `node.data.rules as NodeRules` |

### Remove (compute on demand)

| Field | Replacement |
|-------|-------------|
| `isTask` | `node.taskStatus !== undefined` |
| `icon` | Remove (always undefined) |
| `color` | `(node.data.rules as NodeRules)?.color` |
| `childCount` | `node.children.length` or `getChildren(id).length` |
| `hasBacklinks` | `getBacklinks(id).length > 0` |
| `refsCount` | `getOutgoingLinks(id).length` |

### Internal Only (not on KNode interface)

| Field | Location | Reason |
|-------|----------|--------|
| `fsIno` | Storage internal | Rename detection only |
| `mdPos` | Storage internal | File sync only |
| `mdSlug` | Remove | DEPRECATED |
| `contentHash` | Storage internal | CAS for large content |
| `version` | Storage internal | Sync only |

---

## Migration Phases

### Phase 0: Prerequisites (km-node.1)
- [ ] Remove fsPath/mdLine from TNode (warmup cleanup)

### Phase 1: Create KNode Type (km-node.2)
**Files:** `packages/km-core/src/types.ts`

1. Create new `KNode` interface alongside `DBNode`
2. Add deprecation comment to `DBNode`
3. Create type aliases for compatibility:
   ```typescript
   /** @deprecated Use KNode */
   export type DBNode = KNode;
   ```

### Phase 2: Update Storage Layer (km-node.3)
**Files:** `packages/km-storage/src/*.ts`

1. Add mapping layer for SQLite snake_case ↔ KNode camelCase
2. Update `getNode()`, `getChildren()` to return `KNode`
3. Update all storage functions to use `KNode`
4. Keep SQLite schema as-is (snake_case columns)

**Mapping function:**
```typescript
function rowToKNode(row: Record<string, unknown>): KNode {
  return {
    id: row.id as string,
    type: row.type as NodeType,
    parentId: row.parent_id as string | null,
    parentIdx: row.parent_idx as number,
    name: row.name as string | undefined,
    title: row.title as string | undefined,
    content: row.content as string | undefined,
    taskStatus: row.task_status as TaskStatus | undefined,
    priority: row.priority as number | undefined,
    dueDate: row.due_date as string | undefined,
    scheduledDate: row.scheduled_date as string | undefined,
    fsPath: row.fs_path as string | undefined,
    mdLine: row.md_line as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    data: {
      ...(row.data ? JSON.parse(row.data as string) : {}),
      // Move sparse fields to data
      ...(row.symlink_to && { symlinkTo: row.symlink_to }),
      ...(row.task_mark && { taskMark: row.task_mark }),
      ...(row.assigned_to && { assignedTo: row.assigned_to }),
      ...(row.recurrence && { recurrence: row.recurrence }),
      ...(row.recur_prev && { recurPrev: row.recur_prev }),
      ...(row.source_embedding && { sourceEmbedding: row.source_embedding }),
      ...(row.rules && { rules: JSON.parse(row.rules as string) }),
    },
  };
}
```

### Phase 3: Update Tree Layer (km-node.4)
**Files:** `packages/km-tree/src/*.ts`

1. Change `TNode` to extend `KNode`:
   ```typescript
   interface TreeNode extends KNode {
     children: TreeNode[];
     depth: number;
   }

   /** @deprecated Use TreeNode */
   export type TNode = TreeNode;
   ```

2. Remove duplicate properties from old TNode
3. Update `buildTree()` to use spread:
   ```typescript
   function buildTree(nodes: KNode[], depth = 0): TreeNode[] {
     return nodes.map(node => ({
       ...node,  // Spread all KNode properties
       children: buildTree(getChildren(node.id), depth + 1),
       depth,
     }));
   }
   ```

### Phase 4: Update Board Layer (km-node.5)
**Files:** `packages/km-board/src/*.ts`

1. Remove `NodeViewModel` type
2. Update `BoardState.nodes` to use `TreeNode[]`
3. Remove `toNodeViewModel()` transformer
4. Update selectors to check `foldedNodes.has(node.id)` directly

**Before:**
```typescript
interface NodeViewModel {
  id: string;
  // ... 13 fields
  isFolded: boolean;
}

function toNodeViewModel(node: TNode, foldedNodes: Set<string>): NodeViewModel {
  return {
    id: node.nodeId,
    // ... copy 12 more fields
    isFolded: foldedNodes.has(node.nodeId),
  };
}
```

**After:**
```typescript
// Just use TreeNode directly
// Check fold state inline: foldedNodes.has(node.id)
```

### Phase 5: Update Apps (km-node.6)
**Files:** `apps/*/src/**/*.{ts,tsx}`

1. Update imports: `TNode` → `TreeNode`, `DBNode` → `KNode`
2. Remove `nodeToTNode()` conversion functions
3. Update property access: `node.nodeId` → `node.id`
4. Update computed checks: `node.isTask` → `node.taskStatus !== undefined`
5. Update color access: `node.color` → `(node.data.rules as NodeRules)?.color`

### Phase 6: Cleanup (km-node.7)
**Files:** All packages

1. Remove deprecated type aliases
2. Remove `nodeToTNode()` and `toNodeViewModel()`
3. Update all tests
4. Update documentation

---

## Risk Assessment

### High Risk Areas

1. **Storage Layer Changes**
   - SQLite mapping must be bulletproof
   - Test: Full round-trip (read → modify → write → read)

2. **Spread Semantics**
   - `...node` must include all properties
   - Watch for: Missing optional properties, prototype issues

3. **Type Narrowing**
   - Some code may rely on type narrowing based on presence of properties
   - Watch for: `if ('nodeId' in node)` patterns

### Mitigation Strategies

1. **Incremental Migration**
   - Keep deprecated aliases during transition
   - Migrate one layer at a time
   - Run full test suite after each phase

2. **Type Safety**
   - Add runtime checks in mapping functions
   - Use strict TypeScript settings
   - Add tests for edge cases

3. **Rollback Plan**
   - Keep old types as `*Legacy` until fully migrated
   - Git tags at each phase completion

---

## Testing Strategy

### Unit Tests (per phase)

1. **Storage Layer**
   - `rowToNode()` mapping correctness
   - `nodeToRow()` reverse mapping
   - Round-trip preservation
   - `data` bucket field access

2. **Tree Layer**
   - `buildTree()` produces correct structure
   - Spread includes all properties
   - Depth calculation correct

3. **Board Layer**
   - Fold state checking works
   - Selection state checking works
   - Reducer operations work with TreeNode

### Integration Tests

1. **TUI Navigation**
   - j/k/h/l movement
   - Zoom in/out
   - Fold/unfold

2. **Task Operations**
   - Status toggle (x key)
   - Task creation
   - Task deletion

3. **File Sync**
   - Edit in TUI → file updates
   - Edit file → TUI updates

### Manual Testing Checklist

- [ ] `bun km view` - TUI loads and renders
- [ ] Navigation works (j/k/h/l, arrows)
- [ ] Task status toggle (x key)
- [ ] Fold/unfold (z key)
- [ ] Open in editor (e key)
- [ ] Create new task (a key)
- [ ] `bun km tasks` - CLI list works
- [ ] `bun km sh` - Shell REPL works
- [ ] File watch sync works

---

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 0 (Prerequisites) | 1 hour | Low |
| Phase 1 (Create Node) | 2 hours | Low |
| Phase 2 (Storage) | 4 hours | High |
| Phase 3 (Tree) | 2 hours | Medium |
| Phase 4 (Board) | 3 hours | Medium |
| Phase 5 (Apps) | 4 hours | Medium |
| Phase 6 (Cleanup) | 2 hours | Low |
| **Total** | **~18 hours** | |

---

## Questions for Review

1. **Naming:** ~~Should we use `Node` or `KmNode` to avoid conflicts with DOM Node?~~
   **RESOLVED:** Using `KNode` during migration to avoid DOM Node conflicts. Can rename to `Node` after migration is complete and stable.

2. **Data bucket:** Should sparse fields in `data` have typed accessors?
   ```typescript
   function getSymlinkTo(node: KNode): string | undefined {
     return node.data.symlinkTo as string | undefined;
   }
   ```

3. **TreeNode location:** Should `TreeNode` stay in @km/tree or move to @km/core?

4. **Deprecation period:** How long to keep deprecated aliases?

---

## Approval Checklist

- [ ] Field disposition reviewed and approved
- [ ] Migration phases make sense
- [ ] Risk assessment adequate
- [ ] Testing strategy sufficient
- [ ] Effort estimate reasonable
- [ ] Questions answered

**Approved by:** _______________
**Date:** _______________

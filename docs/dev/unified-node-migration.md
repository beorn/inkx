# Unified Node Model Migration Plan

**Epic:** km-node
**Status:** Draft - Awaiting Review
**Author:** Claude
**Date:** 2026-01-16

---

## Executive Summary

Migrate from 3 separate node types to a single extensible `KNode` type with JSONB storage:

```
BEFORE                          AFTER
──────                          ─────
DBNode (27 fields)              KNode (5 columns + props JSONB)
   ↓ copy/rename                   ↓ spread + add children
TNode (19 fields)               TreeNode extends KNode
   ↓ copy/rename                   ↓ (no change, just check Sets)
NodeViewModel (13 fields)       (removed - use TreeNode + Sets)
```

**Key changes:**

- Use `KNode` name to avoid DOM Node conflicts
- Use `title` + `body` (not `content`)
- Use `source` field instead of `fsPath`/`mdLine`
- Store all data in JSONB `props` with virtual columns for queries
- Path derived from tree structure (no duplicate storage)

---

## Current Problems

### 1. Property Duplication

Same data copied at each layer with different names:

- `id` → `nodeId` → `id` (back again!)
- `parent_id` → `parentId` → (removed)
- `task_status` → `taskStatus` → `taskStatus`
- `fs_path` → `fsPath` → (removed)
- `content` → `body` (renamed for no reason)

### 2. Conversion Overhead

Two 20+ line conversion functions:

- `nodeToTNode()` in apps/km-cli/src/tui2/tui2.tsx
- `toNodeViewModel()` in packages/km-board/src/transformers.ts

### 3. Redundant Path Storage

- `fs_path` stores full path like `/Users/beorn/vault/projects/km.md`
- But tree structure already encodes path via `parentId` relationships
- Path can be derived: `vaultRoot + ancestors.map(a => a.name).join("/")`

### 4. Computed Fields on Type

Fields that should be computed are stored:

- `isTask` = `taskStatus !== undefined`
- `icon` = always undefined
- `color` = `rules?.color`
- `childCount` = `getChildren(id).length`

---

## Proposed Architecture

### SQLite Schema (Columns + JSONB for type-specific data)

```sql
CREATE TABLE nodes (
  -- === Structural (all nodes) ===
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES nodes(id),
  parent_idx INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  name TEXT,  -- basename: "km.md", "projects", "My Heading"

  -- === Content (most nodes) ===
  title TEXT,           -- display text (heading, task text, filename)
  body TEXT,            -- content below title

  -- === Source location (for nodes inside files) ===
  source TEXT,          -- JSON: {type:"markdown", line:42} or {type:"caldav", uri:"..."}

  -- === Metadata (all nodes) ===
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- === Type-specific properties (JSONB) ===
  props TEXT NOT NULL DEFAULT '{}'
  -- Task: {taskStatus, priority, dueDate, scheduledDate, taskMark, assignedTo, recurrence}
  -- Section: {rules}
  -- Link: {linkTo}
  -- etc.
);

-- Virtual columns for common task queries
-- (computed from props JSONB, indexed for fast filtering)
CREATE INDEX idx_task_status ON nodes(json_extract(props, '$.taskStatus'))
  WHERE json_extract(props, '$.taskStatus') IS NOT NULL;
CREATE INDEX idx_due_date ON nodes(json_extract(props, '$.dueDate'))
  WHERE json_extract(props, '$.dueDate') IS NOT NULL;
CREATE INDEX idx_priority ON nodes(json_extract(props, '$.priority'))
  WHERE json_extract(props, '$.priority') IS NOT NULL;

-- Structural indexes
CREATE INDEX idx_parent ON nodes(parent_id, parent_idx);
CREATE INDEX idx_type ON nodes(type);
```

### Base KNode Type

```typescript
// @km/core/types.ts

// Source location - varies by node origin
type Source =
  | { type: "markdown"; line?: number; offset?: number } // line in containing file
  | { type: "caldav"; uri: string; etag?: string } // CalDAV resource
  | { type: "api"; endpoint: string; id: string } // External API
  | { type: "memory" }; // Ephemeral, not persisted

interface KNode {
  // === Structural (SQLite columns) ===
  id: string; // ULID
  type: NodeType; // folder, file, section, task, etc.
  parentId: string | null; // Tree structure
  parentIdx: number; // Ordering within parent
  name?: string; // Basename: "km.md", "projects", "My Heading"

  // === Content (SQLite columns) ===
  title?: string; // Display text (heading text, task text)
  body?: string; // Content below title (paragraph text, code)

  // === Source (SQLite column, JSON) ===
  source?: Source; // Where this node came from

  // === Metadata (SQLite columns) ===
  createdAt: number;
  updatedAt: number;

  // === Type-specific properties (from props JSONB) ===
  // Task properties
  taskStatus?: TaskStatus;
  priority?: number;
  dueDate?: string;
  scheduledDate?: string;
  taskMark?: TaskMark;
  assignedTo?: string;
  recurrence?: string;

  // Section properties
  rules?: NodeRules;

  // Link properties
  linkTo?: string;

  // ... other type-specific fields accessed via props
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
  foldedNodes: Set<string>; // ✓ exists
  selectedNodes: Set<string>; // ✓ exists
  collapsedNodes: Set<string>; // ✓ exists
}

// Remove NodeViewModel - use TreeNode directly
// Check isFolded via: foldedNodes.has(node.id)
```

---

## Node Types and Their Representation

### File System Nodes

| Node Type | `type`   | `name`        | `source`           | `title`      | `body` |
| --------- | -------- | ------------- | ------------------ | ------------ | ------ |
| Folder    | `folder` | "projects"    | -                  | -            | -      |
| MD File   | `file`   | "tasks.md"    | -                  | -            | -      |
| Binary    | `file`   | "image.png"   | -                  | -            | -      |
| Section   | `section`| "my-heading"  | `{type:"markdown", line:42}` | "My Heading" | -      |
| Task      | `task`   | -             | `{type:"markdown", line:55}` | "Do thing"   | "details..." |
| Paragraph | `paragraph` | -          | `{type:"markdown", line:60}` | -            | "Text content" |

**Key insight:** For file-based nodes, the full path IS the tree structure:

```
folder(name="vault") → folder(name="projects") → file(name="tasks.md") → section(name="inbox")
```

Full path = `getAncestors(node).map(n => n.name).join("/")` + vault root

### External Source Nodes

| Source Type | Example | `source` value |
| ----------- | ------- | -------------- |
| CalDAV task | Fastmail | `{type:"caldav", uri:"https://...", etag:"abc123"}` |
| API item    | Linear issue | `{type:"api", endpoint:"linear", id:"LIN-123"}` |
| Memory only | Ephemeral | `{type:"memory"}` or `undefined` |

---

## Field Disposition

### SQLite Columns (common to most nodes)

| Field       | Type           | Notes                        |
| ----------- | -------------- | ---------------------------- |
| `id`        | string         | PRIMARY KEY, ULID            |
| `type`      | NodeType       | NOT NULL                     |
| `parentId`  | string \| null | REFERENCES nodes(id)         |
| `parentIdx` | number         | Ordering, NOT NULL DEFAULT 0 |
| `name`      | string?        | Basename for path derivation |
| `title`     | string?        | Display text                 |
| `body`      | string?        | Content below title          |
| `source`    | JSON?          | Origin location (line, URI)  |
| `createdAt` | number         | Unix timestamp               |
| `updatedAt` | number         | Unix timestamp               |

### Props JSONB (type-specific fields)

| Field           | Node Types    | Notes                              |
| --------------- | ------------- | ---------------------------------- |
| `taskStatus`    | task          | Indexed via expression             |
| `priority`      | task          | Indexed via expression             |
| `dueDate`       | task          | Indexed via expression             |
| `scheduledDate` | task          | Task scheduling                    |
| `taskMark`      | task          | Checkbox mark for serialization    |
| `assignedTo`    | task          | Rarely used                        |
| `recurrence`    | task          | iCal RRULE format                  |
| `rules`         | section       | Parsed inline attributes           |
| `linkTo`        | any           | Rare: link/symlink target          |

### Remove (compute on demand)

| Field          | Replacement                                        |
| -------------- | -------------------------------------------------- |
| `isTask`       | `node.taskStatus !== undefined`                    |
| `icon`         | Remove (always undefined)                          |
| `color`        | `node.rules?.color`                                |
| `childCount`   | `node.children.length` or `getChildren(id).length` |
| `hasBacklinks` | `getBacklinks(id).length > 0`                      |
| `refsCount`    | `getOutgoingLinks(id).length`                      |
| `fsPath`       | Derive from tree: `getPath(node)`                  |
| `mdLine`       | `node.source?.line` (if source.type === 'markdown')|

### Storage Internal (not on KNode)

| Field         | Location         | Reason                |
| ------------- | ---------------- | --------------------- |
| `fsIno`       | Storage internal | Rename detection only |
| `mdPos`       | Storage internal | File sync only        |
| `contentHash` | Storage internal | CAS for large content |
| `version`     | Storage internal | Sync only             |

---

## Helper Functions

```typescript
// Derive full filesystem path from tree structure
function getPath(node: KNode, vaultRoot: string): string {
  const ancestors = getAncestors(node.id);
  const names = [...ancestors, node]
    .filter((n) => n.name)
    .map((n) => n.name);
  return path.join(vaultRoot, ...names);
}

// Get line number for editor integration
function getSourceLine(node: KNode): number | undefined {
  if (node.source?.type === "markdown") {
    return node.source.line;
  }
  return undefined;
}

// Check if node is a task
function isTask(node: KNode): boolean {
  return node.taskStatus !== undefined;
}
```

---

## Migration Phases

### Phase 0: Prerequisites (km-node.1)

- [ ] Remove fsPath/mdLine from TNode (warmup cleanup)
- [ ] Update App.tsx to always use storage lookup for editor integration

### Phase 1: Create KNode Type (km-node.2)

**Files:** `packages/km-core/src/types.ts`

1. Create `Source` type
2. Create `KNode` interface
3. Add deprecation comment to `DBNode`
4. Create type alias: `export type DBNode = KNode;`

### Phase 2: Update Storage Layer (km-node.3)

**Files:** `packages/km-storage/src/*.ts`

1. Migrate SQLite schema to JSONB + virtual columns
2. Create `rowToKNode()` / `knodeToRow()` mapping
3. Update all storage functions to use `KNode`
4. Add `getPath()` helper function

**Schema migration:**

```sql
-- Add props column
ALTER TABLE nodes ADD COLUMN props TEXT NOT NULL DEFAULT '{}';

-- Migrate existing data to props
UPDATE nodes SET props = json_object(
  'title', title,
  'body', content,
  'taskStatus', task_status,
  'priority', priority,
  'dueDate', due_date,
  'scheduledDate', scheduled_date,
  'createdAt', created_at,
  'updatedAt', updated_at,
  'source', CASE
    WHEN md_line IS NOT NULL THEN json_object('type', 'markdown', 'line', md_line)
    ELSE NULL
  END,
  -- ... other fields
);

-- Add virtual columns
-- (SQLite doesn't support ADD COLUMN for generated columns,
--  so we need to recreate the table or use a view)
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

2. Remove duplicate properties
3. Update `buildTree()` to use spread

### Phase 4: Update Board Layer (km-node.5)

**Files:** `packages/km-board/src/*.ts`

1. Remove `NodeViewModel` type
2. Update `BoardState.nodes` to use `TreeNode[]`
3. Remove `toNodeViewModel()` transformer
4. Update selectors to check Sets directly

### Phase 5: Update Apps (km-node.6)

**Files:** `apps/*/src/**/*.{ts,tsx}`

1. Update imports: `TNode` → `TreeNode`, `DBNode` → `KNode`
2. Remove `nodeToTNode()` conversion functions
3. Update property access:
   - `node.nodeId` → `node.id`
   - `node.content` / `node.body` → `node.body`
   - `node.fsPath` → `getPath(node, vaultRoot)`
   - `node.mdLine` → `getSourceLine(node)`
4. Update computed checks: `node.isTask` → `isTask(node)`

### Phase 6: Cleanup (km-node.7)

**Files:** All packages

1. Remove deprecated type aliases
2. Remove old columns from SQLite (if safe)
3. Update all tests
4. Update documentation

---

## Risk Assessment

### High Risk Areas

1. **Schema Migration**

   - SQLite virtual columns require table recreation
   - Test: Full round-trip with real data

2. **Path Derivation**

   - Must handle all node types correctly
   - Test: folder, file, section, task paths all resolve

3. **Source Field Semantics**
   - Different source types need different handling
   - Test: markdown, caldav, api, memory sources

### Mitigation Strategies

1. **Incremental Migration**

   - Keep deprecated aliases during transition
   - Migrate one layer at a time
   - Run full test suite after each phase

2. **Dual Write**

   - During transition, write to both old and new columns
   - Verify consistency before dropping old columns

3. **Rollback Plan**
   - Git tags at each phase completion
   - Keep old schema columns until fully validated

---

## Testing Strategy

### Unit Tests (per phase)

1. **Storage Layer**

   - `rowToKNode()` / `knodeToRow()` mapping
   - Virtual column queries work
   - `getPath()` returns correct paths
   - Round-trip preservation

2. **Tree Layer**

   - `buildTree()` produces correct structure
   - Spread includes all properties
   - Depth calculation correct

3. **Board Layer**
   - Fold/selection state checking works
   - Reducer operations work with TreeNode

### Integration Tests

1. **Path Resolution**

   - Folder → file → section → task paths
   - Binary file paths
   - External source nodes (no path)

2. **Editor Integration**

   - Open in editor works (via `getPath` + `getSourceLine`)
   - New task creation finds correct file

3. **Queries**
   - `WHERE task_status = 'todo'` uses virtual column
   - `WHERE due_date < date('now')` works

### Manual Testing Checklist

- [ ] `bun km view` - TUI loads and renders
- [ ] Navigation works (j/k/h/l, arrows)
- [ ] Task status toggle (x key)
- [ ] Fold/unfold (z key)
- [ ] Open in editor (e key) - path derived correctly
- [ ] Create new task (a key)
- [ ] `bun km tasks` - CLI list works
- [ ] `bun km sh` - Shell REPL works
- [ ] File watch sync works

---

## Questions for Review

1. **Naming:** ~~Should we use `Node` or `KmNode` to avoid conflicts with DOM Node?~~
   **RESOLVED:** Using `KNode` during migration. Can rename to `Node` after migration is complete.

2. ~~**Data bucket:** Should sparse fields in `data` have typed accessors?~~
   **RESOLVED:** Common fields are columns; type-specific fields in `props` JSONB with typed interface.

3. **TreeNode location:** Should `TreeNode` stay in @km/tree or move to @km/core?

4. **Virtual column performance:** Should we benchmark virtual columns vs real columns for common queries?

5. **Binary files:** Should binary files have a `source` field, or is `type: 'file'` + `name` sufficient?

---

## Approval Checklist

- [ ] Field disposition reviewed and approved
- [ ] JSONB + virtual columns approach approved
- [ ] `source` field design approved
- [ ] Path derivation approach approved
- [ ] Migration phases make sense
- [ ] Risk assessment adequate
- [ ] Testing strategy sufficient

**Approved by:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
**Date:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

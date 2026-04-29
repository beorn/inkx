---
id: "@km/node"
aliases:
  - km-node
  - "@km/_orphan/node"
created_at: 2026-01-16T22:21:48Z
closed_at: 2026-01-17T00:28:25Z
---

# [x] Unify Node Types: Migrate DBNode/TNode/NodeViewModel to single Node type @km/node #epic #P1

# Epic: Unified Node Model Migration

Migrate from 3 separate node types to a single extensible `KNode` type.

## Summary

```
BEFORE                          AFTER
──────                          ─────
DBNode (27 fields)              KNode (base type)
   ↓ copy/rename                   ↓ spread + add children
TNode (19 fields)               TreeNode extends KNode
   ↓ copy/rename                   ↓ (no change, just check Sets)
NodeViewModel (13 fields)       (removed - use TreeNode + Sets)
```

**Key changes:**
- Single `KNode` type with all properties
- `TreeNode extends KNode` adds only `children[]` and `depth`
- Remove `NodeViewModel` - use `TreeNode` + `foldedNodes`/`selectedNodes` Sets
- Use `source` field instead of `fsPath`/`mdLine`
- Use branded `ULID` type for IDs

## Current Problems

1. **Property duplication** - Same data copied/renamed at each layer
2. **Conversion overhead** - Two 20+ line conversion functions
3. **Redundant path storage** - `fs_path` duplicates tree structure
4. **Computed fields stored** - `isTask`, `icon`, `color`, `childCount`

## Proposed Architecture

### Source Type

```typescript
type Source =
  | { type: "folder"; ino?: number }              // Directory
  | { type: "file"; ino?: number }                // File (binary or md root)
  | { type: "md"; line: number; pos?: number }    // Position within markdown file
  | { type: "memory" };                           // Ephemeral (not persisted)
  // Future: { type: "sync"; uri: string; etag?: string }  // CalDAV/CardDAV
  // Future: { type: "api"; endpoint: string; id: string } // External API
```

**Note:** Full path is derived from tree structure via `name` fields. No redundant path storage.

### Node Types

```typescript
// === Mix-in properties (can be added to ANY node) ===

interface CommonProps {
  status?: Status;          // todo, wip, blocked, done, dropped
  dueDate?: string;         // YYYY-MM-DD
  scheduledDate?: string;   // YYYY-MM-DD
  assignee?: string;
  priority?: number;        // 1-5
  recurrence?: string;      // iCal RRULE
}

// === Base properties ===

interface KNodeBase extends CommonProps {
  id: ULID;
  parentId: ULID | null;
  parentIdx: number;
  name?: string;
  source?: Source;
  createdAt: number;
  updatedAt: number;
}

// === Node types (discriminated union) ===

// Empty containers (no extra properties)
interface ContainerNode extends KNodeBase { type: "folder" | "ul"; }

// Containers with title
interface TitledContainerNode extends KNodeBase { type: "file" | "task"; title?: string; body?: string; }

// Section (has rules)
interface SectionNode extends KNodeBase { type: "section"; title?: string; rules?: NodeRules; }

// Ordered list (has start)
interface OlNode extends KNodeBase { type: "ol"; start?: number; }

// Body-only content
interface BodyNode extends KNodeBase { type: "paragraph" | "quote" | "table" | "html"; body?: string; }

// Code (has lang)
interface CodeNode extends KNodeBase { type: "code"; body?: string; lang?: string; }

// Empty content
interface HrNode extends KNodeBase { type: "hr"; }

// Special nodes
interface AgentNode extends KNodeBase { type: "agent"; model?: string; }
interface BoardNode extends KNodeBase { type: "board"; query?: string; }

// Reference nodes (require target)
interface LinkNode extends KNodeBase { type: "link"; linkTo: ULID; }
interface BlobNode extends KNodeBase { type: "blob"; hash: string; }

type KNode =
  | ContainerNode | TitledContainerNode | SectionNode | OlNode
  | BodyNode | CodeNode | HrNode
  | AgentNode | BoardNode
  | LinkNode | BlobNode;
```

Types with identical structure are combined using union types.

### TreeNode Extension

```typescript
interface TreeNode extends KNode {
  children: TreeNode[];
  depth: number;
}

// Aliases for migration
export type DBNode = KNode;
export type TNode = TreeNode;
```

### UI State (NOT on nodes)

```typescript
// Already exists in @km/board
interface BoardState {
  foldedNodes: Set<ULID>;
  selectedNodes: Set<ULID>;
  // Check via: foldedNodes.has(node.id)
}
```

## Status and Checkbox Marks

`Status` is the domain model; `TaskMark` is markdown serialization:

| Status | Mark | Markdown |
|--------|------|----------|
| `todo` | ` ` | `- [ ]` |
| `wip` | `/` | `- [/]` |
| `blocked` | `!` | `- [!]` |
| `done` | `x` | `- [x]` |
| `dropped` | `-` | `- [-]` |

`TaskMark` is NOT stored - derived from `status` during serialization.

## Removed/Computed Fields

| Old Field | New Approach |
|-----------|--------------|
| `isTask` | `node.status !== undefined` |
| `taskMark` | Derived from `status` |
| `fsPath` | Derive via `getPath(node)` from tree structure |
| `mdLine` | `node.source.line` (for `md` source) |
| `icon`, `color` | Compute if needed |
| `childCount` | `node.children.length` |

## SQLite Schema

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES nodes(id),
  parent_idx INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  name TEXT,
  title TEXT,
  body TEXT,
  hash TEXT,
  link_to TEXT,
  source TEXT,  -- JSON: {type:"folder"|"file"|"md"|"memory", ...}
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  props TEXT NOT NULL DEFAULT '{}'  -- JSONB for CommonProps
);

CREATE INDEX idx_parent ON nodes(parent_id, parent_idx);
CREATE INDEX idx_type ON nodes(type);
CREATE INDEX idx_status ON nodes(json_extract(props, '$.status'))
  WHERE json_extract(props, '$.status') IS NOT NULL;
```

## Phases

- @km/node/1-remove-fspath-mdline-from-tnode: Warmup - Remove fsPath/mdLine from TNode
- @km/node/2-create-knode-type-deprecate-dbnode: Define Types - Create Source, KNodeBase, KNode union
- @km/node/3-update-storage-layer-sqlite-mapping: Update Storage - Add mapping functions, Source helpers
- @km/node/4-update-tree-layer-treenode-extends-knode: Update Consumers - Tree/board/apps (merged phases)
- @km/node/7-cleanup-deprecated-types: Cleanup - Remove deprecated aliases

## Risk Assessment

**High risk:** Schema migration (if we change columns later)
**Medium risk:** Path derivation must handle all node types
**Mitigation:** Keep deprecated aliases during transition, run tests after each phase

## Testing

**After each phase:**
- `bun run typecheck`
- `bun run test:fast`

**Manual verification:**
- TUI loads and renders
- Navigation works (j/k/h/l)
- Task status toggle (x key)
- Open in editor (e key)
- Create new task (a key)
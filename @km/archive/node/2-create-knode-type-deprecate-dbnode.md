---
mentions:
  - km
id: "@km/node/2-create-knode-type-deprecate-dbnode"
aliases:
  - km-node.2
  - km-node-2
  - "@km/node/2"
created_at: 2026-01-16T22:22:09Z
closed_at: 2026-01-17T00:20:17Z
---

# [x] Create KNode type, deprecate DBNode @km/node #task #P1

## Phase 1: Create KNode types

Create the new unified KNode discriminated union in packages/@km/_orphan/core/src/types.ts.

### Type Definitions

```typescript
// Source type (replaces fsPath/mdLine)
type Source =
  | { type: "folder"; ino?: number }
  | { type: "file"; ino?: number }
  | { type: "md"; line: number; pos?: number }
  | { type: "memory" };

// Common properties (can be on any node)
interface CommonProps {
  status?: TaskStatus;
  dueDate?: string;
  scheduledDate?: string;
  assignee?: string;
  priority?: number;
  recurrence?: string;
}

// Base properties
interface KNodeBase extends CommonProps {
  id: ULID;
  parentId: ULID | null;
  parentIdx: number;
  name?: string;
  source?: Source;
  createdAt: number;
  updatedAt: number;
}

// All node types (discriminated union)
type KNode =
  | FolderNode | FileNode | SectionNode | UlNode | OlNode
  | ParagraphNode | QuoteNode | CodeNode | TaskNode | TableNode | HrNode | HtmlNode
  | AgentNode | BoardNode | LinkNode | BlobNode;
```

### Changes

1. Add `Source` type definition
2. Add `CommonProps` interface
3. Add `KNodeBase` interface
4. Add all 16 node type interfaces
5. Add `KNode` discriminated union
6. Add deprecation alias: `export type DBNode = KNode;`

### Files

- packages/@km/_orphan/core/src/types.ts

### Verification

- `bun run typecheck` passes


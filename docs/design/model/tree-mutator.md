# TreeMutator — atomic tree operations

The TreeMutator interface provides atomic, inverse-able operations on the km tree. Operations are pure data (serializable); inverses are computed at apply time for undo/redo.

Lives in: `@km/tree` (see `packages/km-tree/src/ops/block-ops.ts`).

## The interface

```typescript
export interface TreeMutator {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  addNode(parentId: string | null, node: Partial<KNode>): string
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
  deleteNode(id: string): void
}
```

**Reference:** `packages/km-tree/src/ops/block-ops.ts:23–30`

Minimal read/write contract. All high-level operations (split, merge, indent, outdent) build on these 6 primitives. `Repo` satisfies this interface without adapter code.

## Operations

### split(tree, nodeId, offset) → SplitResult

**Purpose:** Split a node's content at cursor position into two siblings.

**Args:**
- `tree: TreeMutator` — mutation interface
- `nodeId: string` — ID of the node to split
- `offset: number` — character offset in display text (name or content)

**Effect on tree:**
1. Original node keeps text before the cursor
2. New sibling created with text after the cursor
3. Children of original node move to the new sibling
4. New sibling inserted immediately after original (sort order via midpoint)

**Inverse:** `merge(tree, newId, survivorId)` — conceptually; the inverse operation is computed from the `split_node` TreeOp.

**Split rules** (from Enter keyboard table):
- Content at start: insert empty sibling before
- Content in middle: split into two; children move to new node
- Content at end: new empty sibling after

**Reference:** `packages/km-tree/src/ops/block-ops.ts:71–112`

### mergeBackward(tree, nodeId) → MergeResult | null

**Purpose:** Merge a node with its previous sibling (Backspace at start of title).

**Args:**
- `tree: TreeMutator`
- `nodeId: string` — ID of the node to merge backward

**Returns:** `MergeResult` with survivor ID and cursor offset, or null if no merge possible (no parent, no previous sibling).

**Effect on tree:** Depends on node state:

| Condition | Action | Survivor |
|-----------|--------|----------|
| Empty + no children | Delete this, cursor to prev | prev |
| Content + prev is childless | Prepend prev content, delete prev | this |
| Content + prev has children | Move this as last child of prev | this (now child) |
| No prev sibling (outdent case) | Move to sibling of parent | this (parent's sibling) |

**Merge rules** (from Backspace keyboard table):
- Empty node with no children: just delete, cursor at end of prev
- Node with content, prev is childless: merge prev into this, delete prev
- Node with content, prev has children: outdent this as last child of prev
- No prev, has parent: outdent (become sibling after parent)

**Reference:** `packages/km-tree/src/ops/block-ops.ts:131–193`

### mergeForward(tree, nodeId) → MergeResult | null

**Purpose:** Merge a node with its next sibling (Delete at end of title).

**Args:**
- `tree: TreeMutator`
- `nodeId: string` — ID of the node to merge forward from

**Returns:** `MergeResult` with survivor ID and cursor offset, or null if no next sibling.

**Effect on tree:** Current node survives (keeps its type/traits).

| Condition | Action |
|-----------|--------|
| Next is empty + no children | Delete next |
| Next has content + no children | Append next's text, delete next |
| Next has content + children | Append next's text, reparent next's children |
| No next sibling | Return null (boundary) |

**Reference:** `packages/km-tree/src/ops/block-ops.ts:215–265`

## TreeOp types and inverse

The `operations.ts` module defines 7 serializable operation types, each with an inverse:

| Op | Type | Inverse | Purpose |
|-------|------|---------|---------|
| `insert_node` | Add node at index | `remove_node` | Create node |
| `remove_node` | Delete node (snapshot stored) | `insert_node` | Delete node |
| `set_node` | Update node properties | `set_node` (swapped) | Modify traits/metadata |
| `move_node` | Reparent + reorder | `move_node` (swapped) | Tree structure changes |
| `split_node` | Split at offset (compound) | `merge_node` | Split for Enter |
| `merge_node` | Merge two nodes (compound) | `split_node` | Merge for Backspace/Delete |
| `set_selection` | Cursor position (effect only) | `set_selection` (swapped) | Selection restore on undo |

**Reference:** `packages/km-tree/src/ops/operations.ts:25–93`

### inverse(op: TreeOp) → TreeOp

Compute the inverse of an operation. `apply(inverse(op))` undoes the effect of `apply(op)`.

Contract:
- Every operation type has a corresponding inverse
- Insert ↔ Remove (with full snapshot)
- Set ↔ Set (properties swapped)
- Move ↔ Move (old/new indices swapped)
- Split ↔ Merge (offset preserved)
- Selection ↔ Selection (states swapped)

**Reference:** `packages/km-tree/src/ops/operations.ts:99–165`

### applyTreeOp(tree: TreeMutator, op: TreeOp) → void

Apply a single operation to the tree. Handles compound operations (split_node, merge_node) as atomic units.

Compound operations:
- `split_node`: truncate original, insert new sibling with remainder
- `merge_node`: append source text to target, delete source

**Reference:** `packages/km-tree/src/ops/operations.ts:178–247`

## Normalization

### withNormalization(tree, customNormalizers?) → NormalizedTreeMutator

Wraps a TreeMutator to auto-normalize after every mutation. Prevents forgetting normalization (SlateJS-inspired).

Default normalizers enforce schema rules:
1. **Blocks cannot have children** — move children to parent
2. **Items must be type "h"** — correct type if needed

Custom normalizers can be added via the `customNormalizers` parameter.

**Deferred normalization:**
- `withoutNormalizing(fn)` — batch operations, defer normalization until outermost batch completes
- All dirty nodes collected and flushed in a stable iteration (up to 10 passes)
- Prevents infinite loops by tracking normalization state

**Reference:** `packages/km-tree/src/ops/normalize.ts:132–215`

### normalize(tree, nodeId) → void

Normalize a single node through the normalizer chain.

**Reference:** `packages/km-tree/src/ops/normalize.ts:94–103`

### normalizeAll(tree) → void

Normalize all root-reachable nodes (depth-first traversal).

**Reference:** `packages/km-tree/src/ops/normalize.ts:105–114`

## Schema constraints

Enforced by normalization and validation:

```typescript
/** Can this node have children? Only items can. */
export function canHaveChildren(node: { item?: unknown }): boolean

/** Can parent accept child? Items can have any children. Blocks cannot. */
export function canParent(parent, child): boolean

/** Can this node become a block (lose item trait)? Only if it has no children. */
export function canBecomeBlock(tree, nodeId): boolean
```

**Violations corrected by normalization:**
- Block with children → children moved to block's parent
- Item with non-"h" type → type corrected to "h"
- Parent that cannot have children → children reparented

**Reference:** `packages/km-tree/src/schema.ts:10–23`

## Prefix conversion (Markdown shortcuts)

### detectPrefixConversion(content: string) → PrefixConversion | null

Detect markdown prefix at start of content. Returns `{ prefixLength, nodeChanges }` or null.

**Supported prefixes:**
- `- `, `* `, `+ ` → list item
- `1. `, `2. ` etc. → numbered list
- `# `, `## ` ... `###### ` → outline item (heading)
- `[] `, `[ ] ` → task (todo)
- `[x] `, `[X] ` → task (done)
- `[/] ` → task (wip)
- `[!] ` → task (blocked)
- `[-] ` → task (dropped)
- `> ` → block quote

Triggered after user types space following prefix (e.g., "- " or "# ").

**Reference:** `packages/km-tree/src/ops/block-ops.ts:300–363`

## Invariants

1. **Atomic:** Each operation is all-or-nothing. Partial mutations do not occur.
2. **Inverse exists:** Every operation has a deterministic inverse computable from apply-time state.
3. **No mutations outside TreeMutator:** Only 6 primitives (getNode, getChildren, addNode, updateNode, moveNode, deleteNode) mutate the tree.
4. **Normalization is idempotent:** Running normalization twice on the same dirty set produces the same result.
5. **Schema enforcement:** Tree remains in valid state after normalization (all schema rules satisfied).
6. **Children cache coherence:** TreeMutator implementations (e.g., Repo) maintain consistent children caches busted on every mutation.

## See also

- `docs/design/model/knode.md` — KNode shape, items vs blocks
- `docs/design/model/repo-api.md` — Repo mutation API (addNode/updateNode/moveNode/deleteNode)
- `packages/km-tree/src/outliner.ts` — outliner reducer using TreeMutator
- `packages/km-tree/tests/block-ops.test.ts` — split/merge test fixtures

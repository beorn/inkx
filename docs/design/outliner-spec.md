# Outliner Behavior Specification

Shared spec for outliner editing operations across km (TUI) and Decker (web). Defines behavior for every operation in every cursor context. Tests are derived from this spec.

**Prior art**: WorkFlowy, Dynalist, Logseq, Roam, Notion, Tana. No formal spec exists — this creates one.

**Prerequisites**: Read [data-model.md](data-model.md) for the node tree (items vs blocks, positional roles).

**Architecture**: Operations are **semantic intents** (splitBlock, joinBackward, indent), not keybindings. Each product maps keys to intents. The spec defines intent behavior.

## Semantic Intents

| Intent | km key | Decker key | Description |
|---|---|---|---|
| `splitBlock` | Enter | Return | Split/create at cursor position |
| `indent` | Tab | Tab | Reparent under previous sibling |
| `outdent` | Shift+Tab | Shift+Tab | Reparent as sibling of parent |
| `joinBackward` | Backspace (at start) | Backspace (at start) | Merge/degrade backward |
| `joinForward` | Delete (at end) | Delete (at end) | Merge forward |
| `deleteBlock` | d (normal mode) | — | Delete entire block |
| `navigateDown` | j | j | Next visible block (spatial) |
| `navigateUp` | k | k | Previous visible block (spatial) |

## Context Variables

Derived from node position + state. Compound guards simplify cases.

| Variable | Description |
|---|---|
| `isItem` | `node.item === true` — structural node, can have children |
| `isTask` | Has task_marker/task_status |
| `isFirstChild` | No previous sibling |
| `isLastChild` | No next sibling |
| `hasVisibleChildren` | Has children AND they're expanded (not collapsed) |
| `isEmpty` | No text content |
| `cursorAtStart` | Cursor at position 0 in title |
| `cursorAtEnd` | Cursor at end of title |
| `isRoot` | Top-level node (column child) |
| `canIndent` | `isItem && !isFirstChild` — combines the two guards into one check |
| `canOutdent` | `isItem && !isRoot` — has grandparent to outdent to |

**Compound guards** (`canIndent`, `canOutdent`, `hasVisibleChildren`) eliminate repeated multi-condition checks in operations.

## splitBlock (Enter)

| Context | Behavior | Note |
|---|---|---|
| `cursorAtStart` | Create empty sibling BEFORE, enter edit | Content stays on current |
| `cursorAtMiddle` | Split at cursor: before stays, after becomes new sibling | Children move to new node |
| `cursorAtEnd` + `hasVisibleChildren` | Create new first CHILD, enter edit | WorkFlowy/Dynalist convention |
| `cursorAtEnd` + `!hasVisibleChildren` | Create sibling AFTER, enter edit | Collapsed children or no children |
| `isEmpty` | Create sibling AFTER, enter edit | Don't split empty |

### Split Inheritance

New node inherits from source via `extractProps()` (denylist model — SYSTEM_KEYS excluded, everything else inherits). **Exception**: `task_status` resets to "todo", `task_marker` resets to "[ ]" on new nodes.

## indent (Tab)

| Context | Behavior |
|---|---|
| `canIndent` | Reparent as last child of previous sibling |
| `!canIndent` | **No-op + bell** |

`canIndent = isItem && !isFirstChild`. One check, no separate guards.

**Multi-select**: All-or-nothing. If any node fails `canIndent`, none indent.

**Target**: Always the previous **sibling**, not the previous visible block. Indent is structural, not spatial.

**Schema gate**: Before executing, check if the result would be valid (e.g., would creating a child of the previous sibling violate any structural rule?). If not valid, no-op + bell.

## outdent (Shift+Tab)

| Context | Behavior |
|---|---|
| `canOutdent` | Reparent as sibling after parent (at grandparent level) |
| `!canOutdent` | **No-op + bell** |

`canOutdent = isItem && !isRoot`. One check.

## joinBackward (Backspace at start)

Degradation ladder — strip traits before merging. Try each in order, stop at first match:

| Step | Guard | Action |
|---|---|---|
| 1 | `isTask` | Remove task trait (clear task_marker + task_status) |
| 2 | `isItem` | Remove item trait (set item: undefined → becomes block) |
| 3 | `type !== "p"` | Convert to paragraph (h/quote/code → p) |
| 4 | `isEmpty && !hasVisibleChildren` | Delete node, cursor to end of previous |
| 5 | `!isFirstChild` + prev is childless | Merge: prepend prev content, delete prev |
| 6 | `!isFirstChild` + prev has children | Reparent: move as last child of prev |
| 7 | `isFirstChild` | Outdent (move to parent's level) |

Steps 1-3 degrade one trait per backspace press. The user keeps pressing to strip all traits, then merges. This matches Logseq/Roam behavior.

**Schema gate**: Before steps 4-7, check if the resulting tree structure would be valid. If not, no-op.

**Merge survivor**: The node the cursor ends up on keeps its ID. This matters for CRDT, undo, and backlinks.

## joinForward (Delete at end)

| Context | Behavior | Note |
|---|---|---|
| Next is empty + no children | Delete next | Simple case |
| Next has content + no children | Append next's text, delete next | Standard merge |
| Next has children | **No-op** | Conservative — Decker + Notion precedent |

**Design decision**: km currently merges text + adopts children. GPT 5.4 Pro recommends aligning with Decker's conservative no-op for child-bearing next blocks. This avoids surprising reparenting and is safer for CRDT.

## deleteBlock (d in normal mode)

| Context | Behavior |
|---|---|
| Empty, no children, no backlinks | Delete immediately |
| Has children/backlinks/metadata | Confirm first, then recursive delete |

Cursor moves to: next sibling → previous sibling → parent.

## navigateDown/Up (j/k) — Spatial Navigation

**Model**: Walk visible blocks in document order. J = next visible block below, K = previous visible block above. Strict inverses: if J goes A→B, then K from B goes to A.

**Not tree traversal**. Not sibling-only. Pure visual/spatial — whatever is rendered above/below in the column.

| Context | Behavior |
|---|---|
| Normal | Move to next/prev visible block in column |
| At boundary (top/bottom of column) | Bell — don't cross columns |
| Collapsed card | Skip hidden children, move to next visible |

**Implementation**: Flatten column into rendered visible-block list, j/k moves by ±1 index.

**Structural navigation** (parent/child/sibling) lives on separate keys (h/l, </>, or TBD).

## Schema Gate (Pre-Operation Validation)

Before executing a structural operation (indent, outdent, merge, reparent), check if the resulting tree would be valid. If not, no-op + bell.

```typescript
// Pseudocode — the outliner checks before mutating:
function indent(nodeId) {
  if (!canIndent) return bell()
  const newParentId = previousSibling.id
  if (!tree.wouldBeValid({ move: nodeId, to: newParentId })) return bell()
  tree.moveNode(nodeId, newParentId, sortOrder)
}
```

This catches structural violations the compound guards miss — e.g., "this node CAN indent (has previous sibling), but the result would put a block under a block (invalid)."

The `wouldBeValid` check uses the same `validate()` system — dry-run the mutation, validate, rollback if invalid. Or simpler: check the specific structural rule that the operation could violate.

## Policy Points (Product-Specific)

These are NOT part of the shared spec — each product defines them:

| Policy | km | Decker |
|---|---|---|
| `canIndent(node)` | `isItem && !isFirstChild` | `!isFirstChild` (all blocks indentable) |
| `splitInheritancePolicy` | `extractProps()` denylist | Slate `splitNodes` default |
| `navigateModel` | Spatial (visible blocks) | Sibling-only (same depth) |
| `deleteForwardChildBearing` | No-op (align with Decker) | No-op |
| `maxUndoGrouping` | Batch related ops | Yjs undo manager |

## Test Matrix

Each cell = `{before-tree, cursor-position, operation} → {after-tree, cursor-position}`.

Tests should be executable JSON fixtures that both km and Decker can consume:

```json
{
  "name": "indent second child",
  "before": ["A", ["B", "C"]],
  "cursor": "C",
  "operation": "indent",
  "after": ["A", ["B", ["C"]]],
  "cursorAfter": "C"
}
```

## Open Questions

1. **Collapsed children + Enter**: Spec says create sibling after collapsed subtree. Decker may differ — verify.
2. **Cross-type merge**: When heading merges with paragraph, which type survives? (Current: paragraph)
3. **Rich text split**: How do inline spans (bold, link) behave at split point? (Decker concern)
4. **Concurrent operations**: CRDT normalization for concurrent indent/split. (Decker concern via Yjs)

# Visual Navigation

Design document for km's navigation model. Informed by SlateJS (Path arithmetic) and Decker (DOM-based visual navigation).

## Core concepts

### Path

A `Path` is a `number[]` describing a node's position in the tree by sibling indices at each level. Aligned with SlateJS terminology.

```
[]        = board level (no selection)
[2]       = 3rd child of root
[2, 5]    = 6th child of that node
[2, 5, 0] = 1st child of that node
```

Path is the **structural** coordinate system — it describes tree position, not visual role. What a given depth means visually (column, card, block, etc.) depends entirely on the view mode and the tree structure. Path doesn't know or care about visual types.

Derived lazily from `cursorNodeId` via `NodePath.pathOf(repo, rootId, nodeId)` — one `getAncestors` CTE + depth `getChildren` queries, ~0.3ms total.

Path helpers (pure arithmetic, no repo):
- `Path.parent(path)` — `[2, 5, 0]` -> `[2, 5]`
- `Path.next(path)` — `[2, 5]` -> `[2, 6]`
- `Path.previous(path)` — `[2, 5]` -> `[2, 4]`
- `Path.ancestors(path)` — all prefixes
- `Path.compare(a, b)` — lexicographic ordering
- `Path.isAncestor(a, b)` — prefix check
- `Path.depth(path)` — `path.length`

Repo-aware resolution:
- `NodePath.pathOf(repo, rootId, nodeId)` — cursor -> path
- `NodePath.nodeAt(repo, rootId, path)` — path -> node
- `NodePath.siblings(repo, rootId, path)` — siblings at path level

### All navigation is visual

hjkl always means "move to the visually adjacent node":

| Key | Meaning |
|-----|---------|
| j   | Visually below |
| k   | Visually above |
| h   | Visually left |
| l   | Visually right |

It happens that j/k matches structural sibling order in current views. But the model doesn't assume this — the view resolves direction to target.

### Views own navigation policy

Each view implements:

```ts
interface ViewNavigation {
  navigate(dir: "up" | "down" | "left" | "right", cursor: string, curswantY: number): string | null
}
```

The navigation layer asks "where should I go?", the view answers with a nodeId. No column/index concepts exist in the navigation layer.

### curswantY

Sticky vertical position (same concept as vim's curswant). Set by j/k movement, preserved across h/l movement. Used for ALL cross-group lateral navigation — "I was at visual row 5, stay near row 5 in the target group."

## h/l rules by view

The rules are defined in terms of the **visual role** the cursor node plays in that view, not tree depth. The same node at the same depth may be a "card" in one view and a "visible block" in another.

### Cards view

| Cursor is on | h/l behavior |
|-------------|--------------|
| Block inside a card | Ascend to the parent card. No column crossing. |
| Card | Lateral to adjacent column, match card by curswantY. |
| Column header | Lateral to adjacent column header. |

Blocks are visually "inside" cards — you exit the card before crossing columns.

### List view

Single visual group. h = zoom out (ascend root), l = zoom in (descend into selected). No lateral movement.

### Columns view (outline per column)

| Cursor is on | h/l behavior |
|-------------|--------------|
| Any node in a column | Lateral to node at curswantY in adjacent column. |
| Column header | Lateral to adjacent column header. |

All nodes are top-level visible items within their column — h/l moves laterally regardless of tree depth.

### Tabs view

h/l switches active tab (top-level group). Within a tab, j/k navigates vertically.

## Relationship to rendering

```
Store (minimal):
  cursorNodeId: string
  rootId: string
  foldedNodes: Set<string>

Key input:
  keypress
    -> view.navigate(dir, cursorNodeId, curswantY)
    -> store.set({ cursorNodeId: resultId })

Render:
  cursorNodeId changed -> Board re-renders
    -> useColumns(repo, rootId, foldedNodes)  // memoized, cache hit on cursor move
    -> cursorPath = NodePath.pathOf(repo, rootId, cursorNodeId)
    -> pass cursorPath to view for highlighting
    -> no store feedback loop
```

The key handler and renderer derive what they need independently from the same source (`cursorNodeId + repo`). No `recomputeLayout()`, no `updateLayout()` effect, no store-React-store feedback loop.

## Future: selection

Current `cursorNodeId` is a degenerate case of:

```ts
interface Selection {
  anchor: Path   // where selection started
  focus: Path    // where cursor is now
}
```

Single cursor: anchor === focus. Range select: anchor stays, focus moves. Visual mode: anchor fixed, focus follows navigation. Path.compare gives ordering for "all nodes between anchor and focus."

## References

- **SlateJS**: Path type, Node helpers, lazy derivation. No pre-computed layout cache.
- **Decker**: DOM bounding-box navigation, `getInVisualDirection()`, store only IDs.
- **Vim**: curswant (sticky column during vertical movement — we use sticky Y for lateral movement).

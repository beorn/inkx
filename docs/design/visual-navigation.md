# Visual Navigation

Design document for km's navigation and rendering model. Informed by SlateJS (Path arithmetic) and Decker (DOM-based visual navigation, store only IDs).

## Core concepts

### Path

A `Path` is a `number[]` describing a node's position in the tree by sibling indices at each level. Aligned with SlateJS terminology.

```
[]        = board level (no selection)
[2]       = 3rd child of root
[2, 5]    = 6th child of that node
[2, 5, 0] = 1st child of that node
```

Path is the **structural** coordinate system — it describes tree position, not visual role. What a given depth means visually (column, card, block, etc.) depends entirely on the view mode. Path doesn't know or care about visual types.

Derived lazily from `cursorNodeId` via cache lookups (no SQL after first access).

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

### Per-node children cache

The repo caches `getChildren(parentId)` results per parent node. Populated lazily on first access. Surgical invalidation:

| Mutation | Invalidate |
|----------|-----------|
| `addNode(parentId)` | parentId |
| `deleteNode(id)` | node's parent |
| `moveNode(id, newParent)` | old parent + new parent |
| `updateNode(id, changes)` | nothing |

All consumers benefit: rendering, navigation, path derivation. After first render, all `getChildren` calls are cache hits. Path derivation becomes pure map lookups.

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

The navigation layer asks "where should I go?", the view answers with a nodeId.

### curswantY

Sticky vertical position (same concept as vim's curswant). Set by j/k movement, preserved across h/l movement. Used for ALL cross-group lateral navigation.

## Visual model

Every node is rendered as a visual box. The key distinction is whether a node's box **wraps its children**:

- **Card**: box contains title + body + sub-items. Children rendered inside the card boundary.
- **Everything else** (board, column, block): box is just the node itself (title, maybe body). Children are rendered as independent items outside the box.

Cards are the only visual container. "Inside a card" is a real visual state — blocks are spatially within the card boundary. "Inside a column" isn't — you're just among its children, which are independent items.

The one consequence: **h/l from inside a card hits the card boundary and selects the card.** That's the only special behavior cards create — lateral movement can't pass through the card's visual box without selecting the card first. j/k is unaffected.

## The navigation rule

One rule for all directions, all views:

**Move to the next selectable node in that direction.**

The selectable set isn't static — a modifier or mode change can make deeper nodes selectable. The rule doesn't change, just the set of selectable nodes.

## Flows

### Key input

```
keypress
  → view.navigate(dir, cursorNodeId, curswantY)
    → repo.getChildren (cache hits) to find next selectable node
  → store.set({ cursorNodeId: newId })
```

### Render

```
cursorNodeId changed → Zustand notifies
  → Board re-renders
    → useChildren(repo, rootId)    — cache hit
    → Column: useChildren(repo, colId)  — cache hit
    → Card: useChildren(repo, cardId)   — cache hit
    → isSelected via store selector (per component)
    → React.memo: only old + new cursor nodes re-render
  → silvery: reconcile → yoga → paint → diff → output
```

### Mutation

```
action → repo.mutate(...)
  → cache: surgical invalidation (affected parents only)
  → store.set({ cursorNodeId: targetId })
  → re-render
    → useChildren: cache miss for affected parents, hits for rest
```

### What's gone

No `recomputeLayout()`. No `deriveCursorPosition()`. No `updateLayout()` effect. No `useColumns`. No `ColumnsLayout`/`ColumnState`/`CardState` types. No `colIndex`/`cardIndex`/`selectionLevel`. No store→React→store feedback loop.

## Store

Minimal — only primary state, no derived fields:

```ts
cursorNodeId: string
rootId: string | null
foldDepths: Map<string, number>
viewMode: ViewMode
```

UI state (isSelected, isFolded, etc.) consumed via store selectors in each component.

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

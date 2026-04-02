# Discoverable Interfaces — Fewer Concepts, Richer Reuse

**TL;DR**: The system's quality scales with the richness of a few core domain objects — not the number of ad-hoc helpers scattered across files. Put operations on core namespaces. Make them discoverable. Let the vocabulary do the work.

---

## The Design Philosophy

A well-designed system has **few concepts that compose richly**, not many concepts that each do one thing. When you add a new operation, the question isn't "where should this function go?" — it's "which domain object does this belong to?"

In km, the domain objects are:

| Layer | Node | Tree | Traversal |
|-------|------|------|-----------|
| Data | `KNode` | `KTree` (future) | `KTree.nodes(root, { match, into })` |
| View | `ViewNode` | `ViewTree` | `ViewTree.nodes(root, { match, into })` |

These aren't just data structures — they're the **vocabulary of the system**. Every operation on a tree (traverse, find siblings, get descendants, find deepest node) belongs on these namespaces. Every type check on a node (`isOutline`, `isTask`, `isBody`) belongs on the node namespace.

When a developer (or AI agent) needs to do something with a ViewNode, they type `ViewTree.` and see the full API. They don't grep. They don't write a new function. They use the vocabulary.

**The principle**: if you find yourself writing a helper function that operates on a core domain object, it probably belongs ON that domain object's namespace. The function isn't wrong — its location is wrong. Moving it to the namespace makes it discoverable and prevents the next person from reimplementing it.

## The Problem

During the nav-clarity refactor (2026-04-02), we found the same DFS traversal reimplemented three times:

1. `getVisibleDescendantIds` in board-app.ts — foldDepth-limited repo walk
2. `getVisibleColumnBlocks` in board-actions-nav.ts — manual stack-based DFS of ViewTree
3. `getVisibleCardDescendants` in board-actions-nav.ts — identical DFS, different root

Each was written independently by a different session. Each works. None knew the others existed.

Meanwhile, `dfsTraversal` — the correct, tested, canonical DFS — sat exported from `@km/board` but was never found by the code that needed it. It was a bare function in a 500-line file, not a method on the data structure it operates on.

## Why It Happens

When an agent (or human) needs "all visible descendants of a ViewNode," they:

1. Look at the `ViewNode` interface — no traversal methods
2. Look at `viewIndex` (a `Map`) — no traversal methods
3. Grep for "descendants" — find `getVisibleDescendantIds` (wrong function, foldDepth-limited)
4. Write their own DFS

Step 3 is the trap. They find *a* function but not *the right* function. Or they find nothing and write from scratch. Either way, duplication.

If `ViewNode` had a `descendants()` method, or there was a `ViewTree` namespace with `ViewTree.descendants(index, rootId)`, step 1 would have found it immediately.

## The Principle

**Core data structures should carry their operations.** Not as implementation details, but as the vocabulary of the system.

When you put `descendants()` on ViewTree, you're not just saving code — you're defining a concept. You're saying "this is how you ask for descendants in this system." Every future session, every agent, every contributor discovers it by inspecting the type.

Bare functions hide vocabulary. Interface methods *are* vocabulary.

## The Pattern

```
// BAD: bare function in a large file
// Nobody finds this unless they know to grep for "dfsTraversal"
export function* dfsTraversal(tree: ViewNode): Generator<ViewNode> { ... }

// GOOD: namespace method — discoverable via autocomplete + type inspection
export const ViewTree = {
  dfs(node: ViewNode): Generator<ViewNode>,
  descendantIds(index: Map<string, ViewNode>, rootId: string): string[],
  adjacentSibling(node: ViewNode, delta: 1 | -1): ViewNode | null,
  deepestLast(index: Map<string, ViewNode>, nodeId: string): ViewNode | null,
}
```

The difference isn't technical — both work. The difference is that an agent writing navigation code will type `ViewTree.` and see the full API surface. They'll never see a bare function buried in another file.

## The Design Heuristic

Ask: "If I needed this operation, where would I look first?"

- If the answer is "the interface/namespace of the data structure" → put it there
- If the answer is "I'd grep for it" → it's invisible and will be reimplemented

This applies at every level:

| Data | Vocabulary |
|------|-----------|
| `KNode` | `KNode.isOutline()`, `KNode.isTask()`, `KNode.matches()` |
| `TreeWalk` | `TreeWalk.nodes(tree, root, { match, into })` |
| `ViewTree` | `ViewTree.dfs()`, `ViewTree.descendantIds()`, `ViewTree.adjacentSibling()` |
| `Repo` | `repo.getNode()`, `repo.getChildren()` |

`KNode` and `TreeWalk` already follow this pattern. `ViewTree` doesn't yet — that's why navigation reimplemented DFS three times.

## Unify API Shapes Across Layers

When two layers have the same concept (tree traversal), give them the same API shape. An agent who learns one immediately understands the other.

```
// Repo layer (data model)
TreeWalk.nodes(tree, rootId, { match, into, reverse })

// View layer (rendered model) — same shape, different types
ViewTree.nodes(root, { match, into, reverse })
```

Same concept. Same predicate model (`match` = what to yield, `into` = what to descend into). Different tree structure. This is how you build a system vocabulary — consistent patterns across layers so knowledge transfers.

If the Repo layer has `TreeWalk.nodes` with pluggable predicates but the View layer has a bare `dfsTraversal` with zero options, agents will reinvent predicate-filtered traversal in consumer code because they can't see it exists at the right layer.

## Code Reads Like Pseudocode

The ultimate payoff: when the vocabulary is rich enough, **core algorithms read like their own documentation**. The implementation disappears into the domain language.

```typescript
// BAD: implementation details visible at every call site
const stack = [colView]
while (stack.length > 0) {
  const vn = stack.pop()!
  blocks.push(vn.id)
  for (let i = vn.children.length - 1; i >= 0; i--) {
    stack.push(vn.children[i]!)
  }
}
const idx = blocks.indexOf(cursorId)
const nextIdx = idx + 1
if (nextIdx < blocks.length) dispatchBoard({ type: "SELECT", nodeId: blocks[nextIdx] })

// GOOD: reads like English — what, not how
const visible = ViewTree.descendantIds(viewIndex, column.id)
const target = navigate(visible, cursor, "down")
```

The first version requires you to mentally simulate a stack-based DFS to understand what it does. The second tells you: "get visible descendants, navigate down." The algorithm IS the domain language.

This is the north star for km's codebase: **a reader should understand what a function does by reading it, without tracing into its dependencies.** The vocabulary (KNode, ViewTree, KTree) carries the "how." The algorithms carry the "what." Core flows — navigation, rendering, sync — should read almost like pseudocode because every operation is a named concept on a domain object.

When this works, the flow is expressed in **one place** using **composable domain operations**, not scattered across files as reimplemented primitives. A new developer reads the navigation handler and sees the full flow — not implementation details they have to piece together from 5 files.

## Rules

1. **If a function operates on a core data structure, it belongs on that structure's namespace.** Not in a consumer file.

2. **If two sessions independently write the same operation, the interface is missing a method.** Add it to the source, not as another bare function.

3. **Namespaces over instance methods.** Keep data structures plain (no methods on `ViewNode`). Put operations on a companion namespace (`ViewTree.*`). This is the SlateJS/KNode pattern — proven and consistent.

4. **Export the namespace from the barrel.** If `ViewTree.descendantIds` exists but isn't in `@km/board`'s index.ts, it's still invisible.

5. **Unify API shapes across layers.** When Repo and View both have "traverse children with predicates," use the same parameter names (`match`, `into`, `reverse`). Knowledge of one layer should transfer to the other.

## Related

- [docs/principles.md — Plain Domain Language](../principles.md#principle-plain-language): "Name things so that someone unfamiliar with the codebase can read a function and understand what it does."
- [docs/principles.md — Composable Domain Objects](../principles.md#principle-plain-objects): The vocabulary principle extends objects to operations — the API surface IS the domain language.
- [docs/lessons/refactoring.md — Case Study 3](refactoring.md): Documentation drift — same root cause (the canonical way exists but isn't discoverable).

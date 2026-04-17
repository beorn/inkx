# View — Visibility and folder-note collapse

This doc owns two related concerns in km's view layer: which nodes participate in a view (visibility), and how folder/file/H1 runs collapse into a single display line (folder-note model).

For the broader view pipeline (how nodes render once visible), see [rendering.md](rendering.md). For selection and cursor mechanics, see [selection.md](selection.md). For spatial layout, see [layout.md](layout.md).

---

# Visibility Model

How km decides which nodes are visible, navigable, and rendered.

## The Lens Pipeline

km has a three-layer visibility pipeline. Each layer is a [TreeLens](../glossary.md#treelens) — a pure data interface for navigating tree structures with no state and no signals. Layers compose by wrapping:

```
repo                                  all nodes, SQLite-backed
  └── createViewLens(repo, opts)      rooted subtree, hidden filtered, roles computed
        └── createVisibleLens(view)   collapsed/filtered/task-status applied
              └── createViewTree()    React-side projection (per-node signals via ProjectedMap)
```

| Layer | Where | What it does | What it filters |
|---|---|---|---|
| **Repo** | `@km/storage` | Source of truth, SQLite-backed | Nothing — every KNode is in here |
| **ViewLens** | `packages/km-board/src/view-lens.ts` | Walks the repo from a root, computes visual roles, resolves embeds, classifies body content | Hidden nodes (`hiddenNodeIds`), structural exclusions (`isCollapsedChild`, `isDetailOnly`, frontmatter `km.collapse:: true`), folder-index file expansion |
| **VisibleLens** | `packages/km-board/src/visible-lens.ts` | Wraps a ViewLens; further restricts which nodes are visible | Collapsed columns (`collapsedNodes`), task-status filter (`taskStatusFilter`), card-level predicate (`cardFilter`) |
| **ViewTree** | `packages/km-board/src/view-tree-projection.ts` | React-side projection of any TreeLens; per-node signal bags via `ProjectedMap`; iterator API (`nodes()`) | None — same visibility as the underlying lens. ViewTree's job is *reactivity*, not filtering. |

A node is "visible" if and only if it appears in the lens's `walkOrder`. The cursor lives in `walkOrder` — this makes "cursor on hidden node" structurally impossible by construction.

## The Three Visibility Mechanisms

There are three independent ways a node can be excluded from view, each operating at a different layer.

### 1. Structural exclusion (ViewLens construction)

**Where**: `packages/km-board/src/view-lens.ts` and `view-lens-helpers.ts` — `isCollapsedChild()`, `isDetailOnly()`, hidden-node set.

**When**: When the ViewLens computes `children(id)` for a parent. Excluded children never appear in `walkOrder`.

**What it matches**:
- Nodes with `detailOnly: true` in their data
- Well-known metadata sections: "activity", "comments", "attachments"
- Nodes with `km.collapse:: true` in their heading rules
- Nodes whose ID is in the `hiddenNodeIds` set passed at lens construction

**Effect**: Structural — excluded nodes have no presence in the lens. They cannot be navigated to, rendered, or counted by anything reading from the lens (which is everything downstream).

### 2. Collapsed columns (VisibleLens construction)

**Where**: `packages/km-board/src/visible-lens.ts` — `collapsedNodes` option.

**When**: When the VisibleLens computes `children(id)` for a column header. If the column is in `collapsedNodes`, its children are excluded entirely.

**How it works**: `collapsedNodes` is a `Set<string>` on `BoardState`. Columns whose node ID is in this set still have their header in the lens (so cursor can land on the column row), but their card children are not in `walkOrder`. `Board.tsx` syncs `km.collapse:: true` rules into this set on mount; users toggle with horizontal collapse keys.

**Effect**: Visual + navigational — cards within collapsed columns are not rendered AND not enumerable from the lens. Navigation skips into collapsed columns (lands on the header row, not on cards inside).

### 3. Per-node fold (NodeStore, React layer)

**Where**: `apps/km-tui/src/state/reactive.ts` — `createNodeStore()`. Fold signals written directly by `Board.tsx`.

**When**: At React render time. `TreeNode.tsx` reads per-node fold signals via the reactive node store and skips rendering folded subtrees.

**Why not in the lens?** Filter text changes on every keystroke. If fold/filter lived in the lens (as construction options), every keypress would invalidate `walkOrder`, the children cache, and the visible-lens cache — kills the per-node-signal incremental rendering that makes cards view fast. The current design keeps fold at the React layer where NodeStore can flip a single per-node signal and only the affected `TreeNode` re-renders.

**Caveat (current limitation)**: This means **only the cards view honors fold**. The alternate views (`columns`, `list`, `tabs`) consume the lens directly via `useSignal(ps.visibleLens)` and never read the node store. They render flat (one row per column-direct child) and have no per-card fold awareness. See `bd show km-tui.view-mode-feature-parity` for the planned fix — the alternate views need to graduate to consuming `ViewTree` (the React-side projection) the way cards view does.

## Choosing the Right API

**In a React component**: use `ViewTree` via `useNode(id)`.
- Per-node subscriptions; component re-renders only when *that node's* state changes
- Iterator: `viewTree.nodes({ from?, reverse? })`
- Lookups: `viewTree.node(id)`, `viewTree.children(id)`, `viewTree.parent(id)`
- Navigation: `viewTree.next(id)`, `viewTree.prev(id)`

**In non-React code** (reducers, selectors, navigation helpers, store, pane signals): use `TreeLens` directly.
- No per-node signals — bulk computation is cheaper without them
- Use `lens.walkOrder` for the eager array; use the underlying repo for raw queries
- Lookups: `lens.get(id)`, `lens.children(id)`, `lens.parent(id)`
- Navigation: `lens.nextInWalk(id)`, `lens.prevInWalk(id)`

## Historical: The Semantic Mismatch (Resolved)

Previously, **rendering used the ViewNode tree but navigation/counting used raw repo traversal with `foldDepths`** (`walkVisibleDescendants`, `getVisibleDescendantIds`). This caused bugs where navigation could reach invisible nodes or miss visible ones (see bead `km-tui.j-skips-grandchildren`).

**Resolution**: The lens migration (commits `fabf49e8c`, `ce58aca85`, completed in `2910f2dd8` which deleted the legacy `view-tree.ts` + `view-snapshot.ts`) replaced both paths. Navigation now uses `viewTree.nodes()` and `viewTree.next()/prev()`, and rendering uses the same TreeLens via `useNode(id)`. Both layers read from the same source of truth.

The old bare functions (`walkVisibleDescendants`, `countVisibleDescendants`, `getVisibleDescendantIds`, `getVisibleDescendants`, `dfsTraversal`, `buildViewTree`, `buildViewIndex`) have all been removed.

## Summary

| Mechanism | Layer | Mechanism | Scope |
|---|---|---|---|
| Structural exclusion | ViewLens construction | Predicates on KNode + `hiddenNodeIds` set | Nodes never appear in `walkOrder` at all |
| Collapsed columns | VisibleLens construction | `collapsedNodes` set | Card children of collapsed columns excluded |
| Per-node fold | NodeStore (React layer) | `foldDepths` map → per-node signals | Subtree rendering skipped in cards view; alternate views currently bypassed (see km-tui.view-mode-feature-parity) |

**Open work**: pushing fold into the lens layer would simplify the architecture (alternate views would honor it for free) but conflicts with per-node-signal incremental rendering performance. Tracked in `km-tui.view-mode-feature-parity` — the proposed approach is to keep fold at the React layer but graduate alternate views to consume `ViewTree` (and per-node signals) instead of the raw lens.


---

# Folder-note model

**Status**: parked — design discussion, not implementing yet.
**Tracking bead**: `km-tui.folder-note-model` (to be created)
**Date parked**: 2026-04-14

Related fixes landed this week (which the refined model would partially revert):
- `27db42fcf` — `fix(board): zoom stack overflow + folder-note column expansion`
- `efb1db1ff` — `fix(tui): preserve inline formatting + bullets in body blocks`
- `74b466b2` (silvery) — eventLoop error dump that caught the zoom recursion

## Problem

When a folder contains a file with the same name (`tst2/tst2.md`, `_index.md`, `.md`), km treats that file as the folder's "index" / "folder-note". The current implementation merges the file into the folder at view time, which produces two classes of bugs (`km-tui.zoom-stack-overflow`, `km-tui.folder-note-same-name`) and makes the DB tree shape diverge from the view tree shape. The question: what's the right merge model?

## Current architecture — hybrid DB + view

**DB layer** (`packages/km-storage/src/watch/handlers/update-handler.ts:228` `syncIndexFileToFolder`):
- **Title promotion**: `folder.content = index.title` at DB level whenever the index file is parsed. The folder node carries the index file's H1 as its display title.
- **Child ordering**: folder children are reordered based on `![[./name]]` slot references in the index file. The index file acts as a curator of sibling order.
- **Index file remains a real child of the folder in the DB** — it's not absorbed. The DB tree is clean.

**View layer** (`packages/km-board/src/view-lens.ts`):
- `getRootChildIds` → `expandIndexFile` (when the folder is the board root)
- `computeColumnChildren` (when the folder is a column — patched in `27db42fcf` to match root path)
- Both **filter the index file out** of the folder's children and **splice in the index file's sections** as the folder's cards. Body paragraphs become a virtual `body-column` card. Other folder children (sibling files/folders) are appended.

The view layer lies about tree shape: in the DB, `tst2` has one child (`tst2.md` with sections). In the view, `tst2` "contains" the sections directly and `tst2.md` is invisible.

## User's refined position (the one we're parking)

**Keep the folder-file as a subitem of the folder**, but:
- DO merge **title** (already at DB level — keep)
- DO merge **body content** (file's body paragraphs render at the top of the folder column)
- DO merge **subitem ordering via slot references** (`![[./child]]` controls folder child order)
- If the folder-file has its OWN subitems (non-slot H2/H3 sections), **keep them as the file's subitems** — don't hoist them into the folder

### Concrete cases

**Case A — pure dashboard folder-file** (`+taxes/+taxes.md` contains only `![[./+taxomatic]]` + `![[./drafts]]`):
- Slots expand to folder children in order
- No non-slot sections → folder-file has no own content to preserve
- File becomes invisible (fully merged — matches current behavior)

**Case B — dashboard + own content** (folder-file has `![[./child]]` slots AND `## My Section`):
- Slots expand to folder children
- Body paragraphs render as folder body
- The `## My Section` and its subitems **stay inside the file**
- File is visible as a subitem of the folder (position: after slot-referenced children, or as a body card — TBD)

**Case C — plain content folder-file** (`tst2/tst2.md` has `# A test project` + `## Sub-section` with no slots):
- Title promoted (already done at DB level)
- Body paragraphs render as folder body
- The `## Sub-section` stays inside the file
- File is visible as a regular child of the folder
- Zooming into the folder shows body + the file as a card
- Zooming into the file shows its sections

## Options considered

| # | Option | Description |
|---|---|---|
| A | Full no-merge, title only | Cleanest code. Biggest UX regression for folders-as-dashboards. Extra zoom for `+taxes` |
| B | No merge + detail pane shows content | Code simplicity of (A), no navigation regression — content visible via detail pane |
| C | Auto-merge only for single-child folders | Semantic feel shifts as siblings are added/removed |
| D | Opt-in via frontmatter/rules | Two modes = more to learn |
| E | Merge only when slot refs present | Slot refs are the explicit curation signal; zero implicit magic |
| **User's refined** | **Merge title+body+slot ordering, keep non-slot sections in file** | **Most surgical — preserves dashboards, avoids surprise hoisting** |

## Pros/cons of user's refined position vs current

| Dimension | Current (full merge) | User's refined (partial merge) |
|---|---|---|
| Code complexity | Dual paths, virtual body-column, view lies | Simpler per-case branching, still has title/body/slot promotion |
| Mental model | "Folder IS its index file" (magic) | "Folder has title/body from file; file keeps its own structure" |
| Slot references | Work (control folder order) | Still work |
| Navigation depth | Zoom once to see sections | Zoom twice to see non-slot sections in a plain-content folder-file |
| Viewing folder-file content | Body visible at top of column | Body visible at top + file visible as child |
| Multi-file folders | Index file invisible, ambiguous "which file does this card come from?" | Clear — file is a regular sibling |
| Single-file folders | Feels like "folder IS the file" — zero friction | File visible as extra container level — fine for non-dashboard use |
| Alignment with fs tools (Finder, VSCode, Obsidian) | Diverges | Matches |
| Folder-note as project dashboard | Perfect fit (view = dashboard) | Preserved when slot refs present |
| Bug count | High — 2 bugs fixed this session originate from the merge | Lower — tree shape matches DB more closely |

## Implementation sketch (when unblocked)

1. Add a helper `hasNonSlotSections(indexFile, children)` that returns true when the index file has any H2+ subitems that are NOT pure slot references. Uses existing `extractSlotTargets`.
2. In `expandIndexFile` + `computeColumnChildren` in `view-lens.ts`:
   - Always merge: title (DB-level, unchanged), body paragraphs, slot-referenced children.
   - When `hasNonSlotSections(indexFile)`: keep the index file as a visible subitem of the folder. Position: probably after slot-referenced children. Open question: is it a card (with the non-slot sections as its own cards on zoom-in), or a body card at the bottom of the column?
3. Update view-lens tests in `packages/km-board/tests/view-lens.test.ts` — add cases for (a) pure dashboard folder-file, (b) dashboard + own content, (c) plain content.
4. Verify `km-tui.slow-folder-discovery` symptom — may resolve if less view recomputation is needed under the refined model. Separate investigation path: look at storage parsing (~1400 files → 10s is not obviously O(n)-bad, may be fine).

## Open questions

1. Where does the visible folder-file sit among the folder's children? After the slot-referenced children? As a body card? Always last?
2. Does title promotion stay? (Yes — it's at the DB level and orthogonal to view merging.)
3. How does fold/unfold work on a folder-file that has non-slot sections — folding the folder hides everything including the file?
4. What about the rare case of a folder whose index file has ONLY non-slot sections (no slots, no body) — is the file visible as the only child?
5. Does the virtual `body-column` still make sense when the file is also visible as a child? Could the file itself be the body (first) and also the subitem container (later)? Or is that double representation?

## Decision

Parked. Current fix (full merge in `computeColumnChildren`) stays in place until this is revisited. The zoom crash + empty-column bugs are resolved and the user's immediate workflow is unblocked.

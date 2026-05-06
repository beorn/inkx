---
mentions:
  - km
id: "@km/all/node-model-v2"
aliases:
  - km-all.node-model-v2
  - km-all-node-model-v2
created_by: claude:36393b5d
created_at: 2026-02-19T01:23:53Z
closed_at: 2026-02-20T08:13:52Z
owner: bjorn@stabell.org
---

# [x] TUI v2: unified model, simplified navigation, rendering fixes @km/all #epic #P1

Redesign @km/ast node model. Simplifies the tree, unifies oi/li, enables lazy loading.

## Architecture Decisions

### One Tree

No separate outline concept. One tree, all nodes in it.

### Two Categories

- Items (oi, li): containers, can have children, zoomable, recursive
- Blocks (p, h, code, quote, table, hr, html, math): leaf content, not zoomable
- Link: reference to another node

### li ~ oi

Structurally almost identical. Both recursive, both navigable, both use .content as title.
Differences: markdown serialization (oi=headings, li=list items), default rendering (oi=card/column, li=checklist row), interleaving (li allows blocks between subitems), lazy loading (oi benefits).

### Flat .children

Both oi and li use .children — ordered list of any node types. No .blocks/.subitems split in the model. View decides columns vs body. Lazy loading via SQL: WHERE type IN (oi,li) for subitems, load blocks on demand.

### Title

.content field IS the title for items. No h child node as title carrier for oi (heading level from tree depth). Title resolution: content → name → id.

### Rendering

Context-dependent. Embedded nodes take on host rendering style.

### Board View (view concern)

Same-type item children → columns. Other children → body pane.

---

## Execution Plan

### Stream 1: Data Model (@km/all/node-model-v2/data-model) — FOUNDATIONAL

Everything else depends on this. ~30% done.

Done:

- SQL query helpers (getChildrenByType/getBodyChildren/getSubitems)
- Stale .blocks/.subitems comment cleanup

Remaining:

1. Parser: stop creating h child for oi, use .content for title
2. Remove __body__ virtual node
3. Remove .blocks/.subitems split (or make view-only helpers)
4. Update predicates (isItem = primary structural check)
5. Storage: lazy loading queries
6. DB migration for existing databases
7. Update board view split logic
8. Update docs/design/@km/ast/model.md with v2 model

### Stream 2: Visual Nav Migration (@km/tui/visual-nav-migration) — 6 PHASES

Core navigation refactor. Phase 0 done, Phase 1 started. Design doc: docs/design/visual-navigation.md

Phase 0 (DONE): Foundation — Path, NodePath, ViewNavigation, useChildren, children cache
Phase 1 (STARTED): Self-selecting components via cursorNodeId — cursorCardNodeId/cursorColumnNodeId added to CursorStore, useIsCursorAtNode hook (commit fdf519fb)
Phase 2: Remove updateLayout effect — kill store→React→store feedback loop (recomputeLayout + syncLayout + _layoutRepoVersion). Blocked by test leak at Phase 1→2 boundary.
Phase 3: Replace useColumns with useChildren
Phase 4: Remove ColumnsLayout and index types
Phase 5: Remove ColumnState/CardState
Phase 6: Store simplification → minimal { cursorNodeId, rootId, foldedNodes, selectedNodes, viewMode }

~40 src files, ~25 test files, ~2250 lines changed.
Depends on: data-model (Phase 2+ needs no __body__)

### Stream 3: Render Pipeline (@km/tui/render-pipeline) — NODEVIEW UNIFICATION

Unified NodeView component replacing 6+ duplicate rendering paths. ~20% done.

API: NodeView({ node, view, isSelected, ancestorDone, ancestorSelected })

Views (detail levels):

- board: Column header — title + child count (DONE)
- column: Section header (§) — section name + count
- tab: Tab bar — title pill
- line: Subitem in card/detail — icon + title (1 line, truncated)
- card: Board column — icon + title + badges + N subitems (as lines) + overflow
- detail: Side pane — metadata table + body + children (as cards) + backlinks

Components to eliminate: TreeNode.tsx, TaskDetailPane, FolderDetailPane, ColumnItems, tree-node-helpers.ts, detail-pane-helpers.ts, shared-components.tsx

Key principle: Children recurse one level down: detail→card→line. Same rich text pipeline, same icon/color logic, same badge formatting at every level.

Depends on: data-model (needs isItem predicates, no __body__)

### Stream 4: Context-Dependent Rendering (@km/all/node-model-v2/rendering) — FINAL

Embedded nodes take on host rendering style. ~40% done.

Done: Card fixes (shouldDim, stripKnownMentions, date colorization, breadcrumb separators)
Remaining: Embedded/linked node style inheritance

Depends on: data-model + render-pipeline

---

## Dependency Graph

```
data-model ──→ visual-nav (Phase 2+ needs no __body__)
           ──→ render-pipeline (needs isItem predicates)
           ──→ rendering (needs data model + pipeline)
```

data-model is the critical path. visual-nav and render-pipeline can run in parallel once data-model lands.

## Recommended Sequencing

Wave A: data-model (foundational — do first)
Wave B: visual-nav + render-pipeline (parallel — different files)
Wave C: rendering (depends on A+B)


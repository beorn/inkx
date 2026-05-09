---
aliases:
  - km-tui.cursor-ancestor-highlight-depth
  - km-tui-cursor-ancestor-highlight-depth
created_at: 2026-05-08T23:25:17.571Z
---

# Ancestor-of-cursor highlight missing for hidden grandchildren #bug #P2 #bug #P2

## Symptom

When the cursor lands on a hidden grandchild (depth ≥ 2 — behind "+N more" / collapsed), the visible card that is an ancestor of the cursor does NOT receive the spec-required ancestor-of-cursor highlight (yellow fg + faint bg).

Reproduced 2026-05-08 in `bun km view @agent/3`:

- Initial breadcrumb: `@agent / @agent/3 > P0 — folder-note unification ... > folder-note-same-name`
- `folder-note-same-name` is a hidden grandchild under "+7 more" of card "Folder-note model"
- The card "Folder-note model" is on the cursor path but receives no ancestor highlight
- Pressing `j` advances breadcrumb to `folder-note-model` — still no visible card highlight

The user has no visual indicator of where the cursor lives.

## Spec

`apps/km-tui/src/views/selection-style.ts:106-109` (Rule 5, PARENT INDICATORS):

> "Regardless of cursor depth: Card surface uses `selectedBg(theme)` when a descendant has cursor"

Spec says "any depth descendant." Implementation only honors depth 1.

## Root cause (investigated)

`apps/km-tui/src/views/CardColumn.tsx:352-353`:

```ts
const cursorInCardDescendant = cursorInDescendant || cursorRevealChildId !== null
const isSelected = isCursorOnThis || cursorInCardDescendant
```

- `treeNode.cursorDescendant` (`TreeNode.tsx:261`) only fires when the cursor is a **direct child** of the card's TreeNode (depth 1). Grandchildren are rendered inside intermediate TreeNodes and never set the parent card's `cursorDescendant`.
- `cursorRevealChildId` only triggers when `card.embed_of` is set (embedded boards), not for normal overflow-hidden grandchildren.
- Result: depth-2+ cursor positions get no ancestor highlight at the card level.

The card-bg apply site at `CardColumn.tsx:490-612` is correct — it's the predicate that's narrow.

## Acceptance

- When cursor is on a node at any depth ≥ 1, every visible ancestor card gets `selectedBg(theme)` per Rule 5
- Regression test: cursor lands on hidden grandchild via fold/overflow; visible parent card title shows ancestor highlight
- Existing render-invariants don't catch this — `no-invisible-cursors-render-invariants.md` only enforces "exactly one visible cursor," not "ancestors are highlighted."

## Fix strategy (out of scope of this bead — capture only)

Either (a) extend `treeNode.cursorDescendant` to report any-depth descendants, or (b) walk the tree from card → cursor in `CardColumn` to detect deep descendants. Approach (a) is cleaner if the signal layer can do it without re-traversing per render.

## Provenance

Discovered 2026-05-08 during `@km/tui/explore-km-view-invariants` exploration session (agent4 / @agent/4). Full investigation: `/tmp/agent4-cursor-visibility-finding.md`. Adjacent newly-created bead `@km/tui/cursor-single-visible-invariant` (also 2026-05-08) is empty and does not cover ancestor-highlight propagation.

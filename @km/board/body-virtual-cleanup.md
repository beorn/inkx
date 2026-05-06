---
mentions:
  - km
id: "@km/board/body-virtual-cleanup"
aliases:
  - km-board.body-virtual-cleanup
  - km-board-body-virtual-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-09T15:17:40Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-board.body-virtual-cleanup
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-15T12:19:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] Replace __body__ virtual KNode pattern with cleaner abstraction @km/board #task #P3

blocks:: [[@km/tui]]

## Why

`createVirtualBodyNode` in `packages/km-board/src/view-lens-helpers.ts` synthesizes a fake KNode to act as a 'body column' for body content (paragraphs/code/hr) that appears before the first heading in a markdown file. The virtual KNode masquerades as real, with synthesized id (`__body__<parent>`), type (`h`), title (`Description`), and fstype.

## What's wrong with it

- Lies in the type system: it's a KNode that doesn't exist in storage
- Special-cased in navigation (`bodyColumnId`, `structuralColumnIds`, body-column branches in `vnNavigateHorizontal`)
- Special-cased in cursor classification, view-tree projection, lens iteration
- Multiple `__body__` string literal checks scattered across the code
- Confusing for new contributors — looks like a real node but isn't

## What's RIGHT about it

- Single source of truth: synthesized once in createVirtualBodyNode, then behaves consistently everywhere
- Removing it without a replacement would break body content rendering, body-column navigation, and the cards-mode body region

## The trap

The naive fix is to 'stop pretending it's a KNode' by exposing `lens.bodyChildren()` separately and using a string virtual ID. But this REPLACES a single localized lie with N distributed lies — every nav function, every projection method, every cursor classification gains an explicit body-column branch. Net: more code, same behavior.

## Real options

**Option B (rename + clean up)**: keep the virtual KNode, rename to `createBodyColumnNode`, document why it exists, add `KNode.isVirtual()` predicate, type-tag it. Smallest change, highest ROI.

**Option D (eliminate body-column concept entirely)**: body blocks render in a flat region above columns with no card chrome, no header, NO cursor targetability in cards mode. This is a behavior change — body blocks become non-selectable in cards view. Needs UX review.

**Option C (promote body to real lens children)**: body blocks become real children of root in the lens (skip the virtual wrapper). But blocks aren't items (`KNode.isBlock()`) — making them tree-children-of-root conflicts with KNode semantics. Low likelihood of working without semantic damage.

## Recommendation

Default to Option B unless UX review approves Option D.

## /complete

```bash
# Option B (rename + clean up)
rg 'createVirtualBodyNode' --glob '!.beads' -t ts -c | wc -l   # 0
rg 'createBodyColumnNode' --glob '!.beads' -t ts -c | wc -l    # >0
rg 'KNode.isVirtual' --glob '!.beads' -t ts -c | wc -l         # >0
# OR Option D
rg '__body__' --glob '!.beads' -t ts -c | wc -l                # 0
```


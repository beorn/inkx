---
id: "@km/silvery/overlay-anchor-system"
aliases:
  - km-silvery.overlay-anchor-system
  - km-silvery-overlay-anchor-system
created_by: claude:2405c72e
created_at: 2026-04-25T16:15:55Z
---

# [/] General overlay/anchor system: caret + selection + focus + popovers + tooltips as one mechanism @km/silvery #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery/view-as-layout-output]]

Pro review (2026-04-25) identified this as the long-term destination for what view-as-layout-output is moving toward: instead of bespoke per-overlay layout signals (`cursorRect`, `selectionRange`, `focusedNodeId`), formalize a general derived-overlays mechanism.

## Concept

Components declare semantic **inputs** on AgNodes:
- `caret: { offset, visible, focused }`
- `selectionIntent: { from, to }`
- `focusIntent: { focused }`
- `anchorRef: { id, edge?: 'top' | 'bottom' | 'left' | 'right' }`
- `decorations: Decoration[]`

Layout pipeline derives **geometric outputs** (frame artifacts):
- `caretRect`
- `selectionFragments: Rect[]` (multi-line wrap-spanning)
- `focusRingRects: Rect[]`
- `anchorRects: { [id: string]: Rect }` — for popover/tooltip positioning
- `overlayLayer: { z, kind, rects }[]` — composited by output phase

Scheduler / output phase consumes the overlay layer directly. No scheduler-side WeakMap reads. No store/effect bridges.

## Why this is the destination

- **Generalizes** popovers, tooltips, focus rings, selection highlights, hover indicators — they're all the same shape.
- **Cross-target** — terminal scheduler emits ANSI for caret/selection; canvas renderer paints rects; DOM renderer becomes `<div class=overlay>`. Same input/output contract.
- **Semantic** — focus ownership, selection intent are state, not geometry. Geometry is derived from them.
- **Composable** — third-party plugins (silvery extensions) can declare their own overlay kinds without modifying core.

## Prior art

- **CSS anchor positioning** (Chrome 125+) — declarative anchor refs, popover positioning derived from layout
- **SwiftUI anchors** + `AnchorPreference`
- **Popper.js / Floating UI** — anchor-driven positioning library
- **ProseMirror Decorations** — selection, marks, widgets as frame-time output
- **TextKit / AppKit** — caret + selection rectangles derived from text layout

## Relationship to other beads

- Parent: `km-silvery.view-as-layout-output` (the substrate this builds on)
- Blocks: Phase 4b (selection as overlay) — `km-silvery.phase4-split-focus-selection`
- Coordinates with: `km-silvery.tea` (commands/handlers can emit overlay-state changes; layout derives the geometry)
- Future: silvercode autolinks popovers (`km-silvercode.autolinks-uri-pivot`) become anchored overlays

## Acceptance (research bead — produces a design doc)

- [ ] Survey CSS anchor positioning, SwiftUI anchors, ProseMirror decorations, Popper.js
- [ ] Design `Decoration` / `Overlay` shape that subsumes caret, selection, focus, popover, tooltip, hover
- [ ] Define semantic-input → geometric-output mapping in the layout pipeline
- [ ] Cross-target story: terminal vs canvas vs DOM rendering of overlays
- [ ] Identify which Phase 4+ work transitions to this model when (likely Phase 4c per `phase4-split-focus-selection`)
- [ ] Design doc at `vendor/silvery/docs/design/overlay-anchor-system.md` (or hub/silvery/design/ if internal)

## What this is NOT

- NOT a v1 ship — research + design only.
- NOT a blocker for Phase 4a (focus) or 4b (selection-as-fragments). Those ship in their bespoke shape; lift to this general model in a Phase 4c follow-up.

## References

- /pro #1: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-5zsn.txt` § 6 (general overlay/anchor system as next plateau)
- /pro #2: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-yvaz.txt` § A (frame artifacts framing)
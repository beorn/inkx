---
mentions:
  - km
  - claude
id: "@km/silvery/phase4-split-focus-selection"
aliases:
  - km-silvery.phase4-split-focus-selection
  - km-silvery-phase4-split-focus-selection
created_by: claude:2405c72e
created_at: 2026-04-25T16:15:13Z
closed_at: 2026-04-25T20:39:19Z
close_reason: Phase 4a (focus) + 4b (selection) both shipped. 4a in silvery
  7b56b5c2 + km 16417c825; 4b in silvery da040837 + km 6f9e91291. Phase 4c
  (general overlay/anchor system) tracked separately at
  km-silvery.overlay-anchor-system.
started_at: 2026-04-25T19:50:12Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.phase4-split-focus-selection
    depends_on_id: km-silvery.view-as-layout-output
    type: parent-child
    created_at: 2026-04-25T09:15:17Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.view-as-layout-output
---

# [x] Phase 4 plan revision: split focus and selection; selection as overlay/decoration not single Range @km/silvery #feature #P1 @claude:2405c72e

blocks:: [[@km/silvery/view-as-layout-output]]

Phase 4 of `km-silvery.view-as-layout-output` originally bundled focus + selection as peer layout-signals (`focusedNodeId`, `selectionRange`). Pro review (2026-04-25, both runs) called this the weakest part of the plan.

## Pro findings

### 1. Bundling is risky

Focus is box-level (relatively simple). Selection is much harder — wraps multiple visual lines, may need grapheme-aware behavior, will eventually have to work cross-target (terminal + canvas + DOM with very different selection models).

### 2. `selectionRange` is under-modeled

A single Range is wrong for the long term. Real shape:

- `selectionFragments: Rect[]` — array of rectangles (one per visual line in a wrap-spanning selection)
- Or more general: `decorations: Decoration[]` / `overlays: Overlay[]` — abstracts focus rings, selection highlights, popovers, anchors all under one mechanism

ProseMirror, TextKit, AppKit all model this as "frame artifacts" or "derived overlays."

### 3. Reframe — semantic intent vs geometric output

Per /pro #2:

> focusedNodeId and selectionRange are not really 'layout outputs.' They're more like intent/state inputs whose renderable consequence is geometric overlays (focusRects, selectionRects).

Better separation:

- **Inputs** (state): `caret`, `selectionIntent`, `focusIntent`, `anchorRef`
- **Outputs** (geometry): `caretRect`, `selectionRects[]`, `focusRingRects[]`, `anchorRect`

This sets up the long-term direction for a general overlay/anchor system (tracked separately as `km-silvery.overlay-anchor-system`).

## Plan revision

Replace the original `Phase 4 — Selection + focus as layout outputs (2 days)` with:

### Phase 4a — Focus as layout output (1 day)

- Add `focusedNodeId: WritableSignal<string | null>` to LayoutSignals
- Components declare `focused?: boolean` on outer Box (or via focus-scope provider)
- Focus-renderer reads from signal
- Deprecate `useFocus` with one-cycle wrapper
- Test: focused-editable-wins; focus changes recompute on prop change (per cursor-invariants pattern)

### Phase 4b — Selection as overlay/decoration (2-3 days)

- Add `selectionFragments: Rect[]` (NOT `selectionRange`)
- Driven by `selectionIntent` semantic input on owning node
- Layout phase computes per-line rectangles for the wrap-spanning selection
- Selection-renderer reads fragments, paints highlights
- Deprecate `useSelection` with one-cycle wrapper (per cursor pattern)
- Tests: wrap-spanning selection, RTL/CJK width handling, multi-pane selection isolation

### Phase 4c — Generalize as overlay/decoration system (research, blocks Phase 5+)

Move to `km-silvery.overlay-anchor-system` (separate bead). Selection becomes one specific overlay; focus rings become another; popovers/tooltips become a third.

## Hook API split (concurrent with Phase 4)

Per /pro: split `useBoxRect()` (currently overloaded) into:

- `useBoxRectSnapshot()` — deprecated, returns snapshot from prior layout (caveats first-frame zero)
- `useOnBoxLayout(cb)` — post-layout callback (already-correct pattern, fires after layout)

Same split for scroll/screen. Lint rule (move to warn-only NOW per /pro) flags new `*Snapshot` callers in render.

## Acceptance

- [ ] Original Phase 4 in `km-silvery.view-as-layout-output` description split into 4a + 4b + 4c
- [ ] 4a (focus) shipped — `focusedNodeId` signal, prop-driven, deprecated useFocus
- [ ] 4b (selection) shipped — `selectionFragments: Rect[]`, wrap-spanning, deprecated useSelection
- [ ] 4c → research bead `km-silvery.overlay-anchor-system`
- [ ] Hook API split: useBoxRectSnapshot vs useOnBoxLayout
- [ ] Lint rule warn-only (not error) — moved earlier from Phase 6

## References

- /pro #1: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-5zsn.txt` § 2 ("Phase 4 under-specified") + § F
- /pro #2: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-yvaz.txt` § A (selection as frame artifact) + § E
- Parent: `km-silvery.view-as-layout-output`


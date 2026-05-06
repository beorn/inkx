---
mentions:
  - km
  - claude
id: "@km/silvery/cursor-invariants"
aliases:
  - km-silvery.cursor-invariants
  - km-silvery-cursor-invariants
created_by: claude:2405c72e
created_at: 2026-04-25T16:14:00Z
closed_at: 2026-04-25T18:36:22Z
close_reason: "Locked 6 invariants in silvery fc798f8c + km bump 101f825d9. (1)
  Active caret precedence — focused-editable wins > deepest visible > null. (2)
  cursorRect recomputes on prop changes (col/row/visible) even when rect
  identity stable. (3) contentRect peer signal added; computeCursorRect derives
  from it. (4) Clipping default = hide — caret outside overflow=scroll/hidden
  ancestor → null. (5) WeakMap teardown + per-frame walk: no ghost cursors on
  conditional mount. (6) CursorShape rename — core cursorOffset.shape
  @deprecated; new @silvery/ag-term/caret-style derives DECSCUSR shape from
  focus state at terminal-layer. 15 new tests in cursor-invariants.test.tsx, all
  31 cursor-related tests pass, silvercode cursor-startup green, tsc baseline
  unchanged (548)."
started_at: 2026-04-25T18:19:15Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.cursor-invariants
    depends_on_id: km-silvery.view-as-layout-output
    type: parent-child
    created_at: 2026-04-25T09:14:00Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.view-as-layout-output
---

# [x] Cursor as layout output: lock down precedence, clipping, content-origin, prop-change recompute @km/silvery #feature #P1 @claude:2405c72e

blocks:: [[@km/silvery/view-as-layout-output]]

Phase 2 of `km-silvery.view-as-layout-output` shipped the cursor-as-layout-output substrate (vendor/silvery commit bd6a94f8, km commit 327b31880). Pro review (2026-04-25) flagged invariants that need to be defined NOW before Phase 4 builds on the same model.

## Required invariants (from /pro)

### 1. Active cursor precedence

"Last writer wins" / "deepest visible cursor wins" is a temporary impl. Long-term contract:

- focused editable wins
- otherwise topmost in paint-order
- otherwise null

Add deterministic resolution in `findActiveCursorRect`. Test: two visible cursor declarers (e.g., a focused TextArea inside a SelectList that also has a "cursor") — focused must win regardless of paint depth.

### 2. Recompute on semantic prop changes

Currently `syncRectSignals` updates when box rects change. But cursor position can change WITHOUT a rect change:

- typing moves caret column within the same rect
- visible toggle (show/hide cursor) without relayout
- shape change without relayout

Test: assert cursor recomputes when `cursorOffset` prop changes even if the owning Box's rect is unchanged. Risk: re-introducing the original first-frame bug class via the back door.

### 3. Content-box origin as first-class output

Add `contentRect: WritableSignal<Rect | null>` to LayoutSignals (peer of boxRect/scrollRect). Cursor, anchors, popovers, selection all derive from content-box, not border-box. Avoid border+padding math repeated in every consumer.

### 4. Offscreen / clipping behavior

If the caret's owning node is inside a clipped/scrolled region:

- default: hide (don't emit cursor ANSI)
- alternative (opt-in): clamp to nearest visible edge

Document. Test scenarios: caret in a scrolled-off card body, caret in a clipped pane.

### 5. Stale-cleanup on unmount

When the owning AgNode disappears, no stale frame's caret should survive. Test: TextArea conditional-mount across many frames; ensure exactly one cursor at any frame, no ghosts after unmount.

### 6. Cross-target naming hygiene (per /pro #2)

`CursorShape` in core `@silvery/ag` types is a target leak (terminal-specific). Refactor:

- Core: `caret` (semantic — visible, position, focused-state)
- `@silvery/ansi` / `@silvery/ag-term`: terminal-specific shape/style mapping

Affects `vendor/silvery/packages/ag/src/types.ts` cursorOffset shape.

## Acceptance

- [ ] Precedence rule documented + tested (focused-editable-wins)
- [ ] Recompute on prop change (without rect change) — failing test → passing
- [ ] `contentRect` signal added; cursor uses it (no border-padding math in scheduler)
- [ ] Offscreen clipping default = hide; alt clamp opt-in
- [ ] Stale cursor cleanup verified (unmount, ghost-free)
- [ ] `CursorShape` removed from core; `caret` semantic prop only
- [ ] Tests in `vendor/silvery/tests/features/cursor-*.test.tsx`

## References

- /pro deep review: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-5zsn.txt` § Phase 2
- /pro fast review: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-yvaz.txt` § E
- Phase 2 commit: vendor/silvery bd6a94f8 + km 327b31880
- Parent: `km-silvery.view-as-layout-output`


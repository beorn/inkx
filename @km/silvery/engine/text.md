---
id: "@km/silvery/engine/text"
aliases:
  - km-silvery.engine.text
  - km-silvery-engine-text
created_by: claude:fed8de9e
created_at: 2026-03-30T03:47:56Z
closed_at: 2026-03-31T01:25:35Z
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] TextLayoutService + Pretext (v0.5): proportional text on canvas @km/silvery #task #P2 @claude:fed8de9e

Replace charWidth = fontSize * 0.6 in the canvas adapter with real text measurement via Pretext. Same components render on both terminal (monospace) and canvas (proportional) with no API changes.

## Plan

### Step 1: TextLayoutService interface (refactor, no new deps)
Define the interface in @silvery/ag (or future ag-layout):
- TextLayoutService.prepare(text, style) → PreparedText
- PreparedText.intrinsicSizes() → { minContentWidth, maxContentWidth }
- PreparedText.layout(constraints) → TextLayout with width, height, lineCount, baselines
- Geometry on layout result: hitTest, caretRect, selectionRects (reserved, not implemented)
- Direction/locale params for future bidi support

Extract MonospaceMeasurer from current terminal code. Wire it through the existing pipeline. Nothing changes visually — pure refactor.

### Step 2: DeterministicTestMeasurer
Fixed grapheme width table (Latin 0.8, CJK 1.0, emoji 1.8). No Canvas dependency. Reproducible across CI. Add conformance tests: intrinsic sizes, monotonic height, CJK, emoji, combining marks.

### Step 3: PretextMeasurer
Add @chenglou/pretext as dep. Wrap prepare/layout into TextLayoutService. Wire into canvas adapter — automatic when renderToCanvas(). Verify: OffscreenCanvas in Bun, font resolution consistency, cache key strategy.

### Step 4: Canvas text painting
Update canvas adapter to render text at pixel positions from layout results (not character grid). Font resolution must match between measurement and painting.

### Step 5: Killer demos
- Shrinkwrap chat bubbles (zero wasted pixels, impossible in CSS)
- Content-aware tabs/buttons (size from real text width)
- Terminal vs canvas side-by-side (same component, both surfaces)
- Wrapped text in VirtualList with dynamic item heights

## Done When
- Same Text/Box renders correctly on terminal AND canvas
- Proportional text wraps correctly on canvas
- Content-aware flex sizing works
- Tests pass with DeterministicTestMeasurer (no Canvas in CI)
- At least one demo shows shrinkwrap

## Open Questions
- Pretext: npm dep or vendor?
- OffscreenCanvas availability in Bun?
- shrinkWrap: Text prop or layout-level?
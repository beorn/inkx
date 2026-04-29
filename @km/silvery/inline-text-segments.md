---
id: "@km/silvery/inline-text-segments"
aliases:
  - km-silvery.inline-text-segments
  - km-silvery-inline-text-segments
created_by: Bjørn Stabell
created_at: 2026-04-09T20:05:38Z
owner: bjorn@stabell.org
---

# [ ] Nested Text as inline style segments — HTML inline model (wrap + hit-test + styling from one primitive) @km/silvery #feature #P1

# @km/silvery/inline-text-segments

**Horizon**: v1.5 or v2.0 (needs design review)
**Parent**: @km/silvery/positioning
**Moat**: HIGH — structural advantage Ink can't replicate without rewriting text layout
**Effort**: 1-2 weeks (prototype + integration + migration)

## The problem

Clickable text that wraps correctly AND has unified hit testing is impossible in Ink (and currently in silvery). Concrete repro from Claude Code:

```tsx
<Text>
  Press <Text color="cyan" onClick={arm}>arm</Text> <Text color="cyan" onClick={arm}>now</Text> to continue
</Text>
```

Hovering "arm" arms the action. Hovering "now" arms the action. Hovering the SPACE between "arm" and "now" does not. Same for any literal whitespace between inner Text elements.

**Why they split the link across two Text elements**: Ink treats nested `<Text>` as atomic units for wrapping. `<Text onClick>arm now</Text>` cannot break between "arm" and "now" — the whole inner Text is one wrap unit. On narrow terminals that would force the link to one line or overflow. Splitting per word is the workaround, and it corrupts hit testing at the gaps.

## The /big analysis (2026-04-09)

See full analysis in session notes. 20 hypotheses generated across missing-abstraction, wrong-ownership, prior-art, composition, deletion, and reframe categories.

### The reframe (4 hypotheses converged)

**Nested `<Text>` inside `<Text>` should behave like HTML `<span>` inside `<p>` — style segments within one wrappable text run, not atomic layout children.** This is the HTML inline model, the ProseMirror Mark model, the Slate Inline model. Every rich text system with wrapping does this. Ink (and current silvery) conflate tree structure with text layout structure, forcing authors to choose between wrapping correctness and semantic correctness.

### What the new model looks like

1. **Text collection**: when rendering a `<Text>` node, walk its children and collect ALL text into one string, recording style segments as `{start, end, style, handlers, node}` ranges. Inner `<Text>` elements become style spans, not atomic children.
2. **Wrap**: run word-wrap on the combined string. Breaks happen at whitespace regardless of segment boundaries.
3. **Render**: apply style from the segment at each character position. Rebuild style transitions during ANSI emission.
4. **Hit test**: for a given cell, find the segment that owns it. Fire that segment's handlers. Spaces between inner Texts belong to the parent Text (they weren't in any inner segment), so the parent's handlers fire.

### What it fixes (beyond the immediate bug)

1. Hover on spaces between styled words works automatically
2. Per-word hover visuals (e.g., `:hover underline`) via range metadata
3. Long clickable text on narrow terminals wraps freely
4. Multi-style text wrapping in general (bold word mid-sentence, italic phrase) wraps cleanly
5. Author ergonomics — `<Text onClick>{content}</Text>` with inner style children "just works" like HTML
6. **Moat**: closes a class of Ink limitations. Every Ink user who hits the wrappable-link problem would come to silvery.

### Prior art (all confirm the model)

- HTML `<a>` and `<span>` inside `<p>` — inline elements with character-range hit testing, wrap at any whitespace
- ProseMirror Marks — metadata ranges over a flat text sequence
- Slate Leaves — text runs with inline formatting via marks
- Notion — inline formatting + clickable links that wrap and hover correctly

## Implementation notes

### What exists already (80% of the infrastructure)

- `collectTextWithBg()` in render-text.ts already builds `ChildSpan` entries mapping virtual text children to display-width ranges
- `inlineRects` already compute per-child rects for hit testing
- `BgSegment` already handles inline bg color changes across wrap boundaries
- `computeInlineRects()` handles wrapped text producing multiple rects per child

### What needs to change

1. **Extend ChildSpan** to include `handlers: EventHandlers` alongside `style`
2. **Measure phase** — for a `<Text>` with inner `<Text>` children, measure the unified run (not per-child). Inner Texts don't get their own layout node.
3. **Wrap algorithm** — wrap across segment boundaries (already works for plain text, needs validation for styled text)
4. **Hit test** — for a cell inside a `<Text>` rect:
   - Find which character position the cell corresponds to (accounting for wide chars, style transitions)
   - Find which segment owns that character position
   - If the character is interior whitespace not owned by any inner segment, it belongs to the outer Text
   - Walk up from the segment's owning node checking for handlers (segment handler first, then outer Text's handlers)
5. **Render phase** — apply segment styles per character (already close — just needs segments to include non-bg styles like fg, bold, handlers)

### Migration risk

Existing layouts relying on inner `<Text>` as atomic wrap units may behave differently after this change (i.e., they'll wrap mid-link when they previously didn't). Mitigation:
- Opt-in `<Text inline>` flag? (rejected — wrong default)
- Opt-in `<Text atomic>` flag? (better — preserve current behavior for users who need it)
- Default behavior change with migration guide

## First step

Prototype branch. Take Claude Code's "arm now" repro. Implement the segment-collection → unified-wrap → segment-aware-hit-test pipeline end-to-end. Verify with termless that hovering the space arms the action. Measure wrap quality on narrow terminals. Present before full implementation.

## Related beads

- @km/silvery/positioning (parent — moat differentiator)
- @km/silvery/inline-rects (existing infrastructure reuse)
- @km/silvery/ink-compat-upgrade (relevant for Ink 7.0 compat layer)
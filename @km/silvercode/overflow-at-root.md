---
mentions:
  - km
  - claude
id: "@km/silvercode/overflow-at-root"
aliases:
  - km-silvercode.overflow-at-root
  - km-silvercode-overflow-at-root
created_by: claude:0940ca20
created_at: 2026-04-24T20:11:34Z
closed_at: 2026-04-25T10:50:47Z
close_reason: "Shipped: km main 48c524bfb. Most of the bead's scope (per-leaf
  minWidth={0} cleanups in
  MarkdownView/DetectionText/MarkdownTable/InlineRun/bullet/ordered/DiffRendere\
  r) was already done in prior commit 991b0a8ba. This work: removed remaining
  flexShrink={1} wrapper in ToolCallBlock + added regression test
  apps/silvercode/tests/visual/overflow-at-root.test.tsx (verified to FAIL
  without overflow boundary at SessionCard, passes with). Visual suite: 53
  passing (was 51). FINDING: AssistantBlock's flexShrink={1} minWidth={0} is NOT
  redundant — CSS §4.5 propagates min-size:0 only to IMMEDIATE child of overflow
  container, not multi-level descendants. Removal becomes safe when silvery
  adopts CSS preset (km-silvery.flexshrink-default Phase 6 +
  km-flexily.auto-min-size-flex-items)."
started_at: 2026-04-25T10:39:48Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
---

# [x] Overflow prevention at the container root, not per-leaf @km/silvercode #task #P2 @claude:2405c72e

## Problem

silvercode has had **6+ commits** in 2 days adding `minWidth={0}` + `wrap="wrap"` + `overflow="hidden"` to individual components (AssistantBlock, MarkdownView, DetectionText, ToolCallBlock, ToolResultBlock, SyntaxHighlighter, DiffRenderer, MarkdownTable, InlineRun, bullet rows, ordered rows …). Every new renderer reintroduces the same bug: long unwrappable tokens (paths, URLs, JSON strings, code identifiers) expand the flex column past the terminal width and push the side panel off-screen.

## Root cause

Flex containers default to `minWidth: auto` (= natural content width). Any descendant without explicit `minWidth: 0` expands its parents. This is the "min-width-0 on every flex descendant" trap that's well-known in web flex layouts.

**CSS spec 4.5 (confirmed in flexily/src/layout-zero.ts:576)** provides the fix: an ancestor with `overflow: hidden` or `overflow: scroll` gets `min-size = 0` automatically, and this "shrinkability" property propagates. `overflow="hidden"` at the SessionCard root would make every descendant shrinkable without per-component minWidth plumbing.

## Reframe

Instead of per-leaf overflow hardening:

1. Put `overflow="hidden"` on `SessionCard`'s outer Box (or the MessageList column that owns message layout).
2. Remove the scattered `minWidth={0}` from AssistantBlock / MarkdownView / DetectionText / ToolCallBlock / ToolResultBlock / InlineRun / bullet+ordered / MarkdownTable / DiffRenderer / SyntaxHighlighter.
3. Keep `wrap="wrap"` on Text nodes that render user content — that's still needed for word-break behavior.
4. Keep `overflow="hidden"` on leaf rows that must CLIP rather than shrink (e.g. SyntaxHighlighter code lines).

## Acceptance

- [ ] Pick one container (SessionCard vs MessageList vs the ListView item) to own overflow.
- [ ] Add `overflow="hidden"` there.
- [ ] Delete the 10+ scattered `minWidth={0}` props that were workarounds.
- [ ] Long content test: a 600-char unwrappable token in a tool result still keeps the side panel visible.
- [ ] Typecheck + tests pass.
- [ ] Add a test that pastes a 1KB no-whitespace blob into a tool result and asserts the side panel still renders (snapshot / visible-cell-at-x).

## Design

Best container to own `overflow="hidden"`: **the MessageList's ListView item wrapper** (each message gets a bounded-width region) OR **SessionCard's content column** (simpler, one spot). Start with SessionCard for the smallest blast radius.

## Effort

~1 day: 1 file change + 10-ish reverts + 1 test. Low risk; easy to bisect if it regresses.

## Related

- 6+ overflow-prevention commits: 5ca7d89c5, c1280e9a5, 6c015d87c, 9c3a7277a, 6e89c4ab1, c4274e433
- Same pattern on web: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Mastering_wrapping_of_flex_items
- /big analysis session 2026-04-24 (this bead is the output)


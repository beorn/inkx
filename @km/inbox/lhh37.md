---
id: "@km/_orphan/lhh37"
aliases:
  - km-lhh37
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:18Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 1: Homepage identity — replace 'Better Ink' hero, rework feature blurbs @km/_orphan #task #P1

Rework the VitePress homepage (docs/index.md) to establish Silvery's standalone identity.

## Changes

### Hero section
- Replace `text: "Better Ink"` with something like `"React for Terminals, Evolved"` or `"Polished Terminal UIs in React"` (original text before the Ink-focused rewrite)
- Replace tagline: remove "drop-in Ink replacement", lead with Silvery's own value: "Build terminal UIs with responsive layouts, scrollable containers, and lightning-fast updates — all in a familiar React API."
- Keep "Migrate from Ink" as secondary CTA button (it's useful, just not the identity)

### Feature blurbs (8 cards)
- "Drop-in Ink Replacement" → rename to "Familiar API" or "Ink-Compatible API". Details: "Same Box/Text/useInput API. silvery/ink and silvery/chalk compat layers for effortless migration."
- "Layout Feedback" → remove "Ink's #1 issue since 2016, solved." Replace with: "Components query their own dimensions during render. No width prop drilling needed."
- "100x+ Faster Updates" → remove "Ink's 20.7ms" from the card. Say: "Per-node dirty tracking with 7 independent flags. Only changed nodes re-render — 169µs for typical interactive updates." Link to benchmarks for the comparison.
- "Scrollable Containers" → remove "Ink's #1 feature request since 2019, built in." Replace with: 'overflow="scroll" with scrollTo just works. The framework handles measurement and clipping.'

### Migration callout
- Soften: "Already using Ink? Silvery's API is nearly identical — most apps run with just import changes. Try it out →"
- Add alpha caveat or move callout below the examples section
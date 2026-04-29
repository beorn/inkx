---
id: "@km/silvery/proto-heading-component"
aliases:
  - km-silvery.proto-heading-component
  - km-silvery-proto-heading-component
created_by: Bjørn Stabell
created_at: 2026-04-06T09:09:58Z
closed_at: 2026-04-06T09:21:59Z
close_reason: Heading component (h1-h6) with OSC 66 textSize, semantic colors,
  bold, graceful degradation. 14 tests. Demo updated. Silvery commit e209816.
---

# [x] <Heading> component with OSC 66 text sizing @km/silvery #feature #P3

Silvery Heading component that emits OSC 66 for visual hierarchy. <Heading level={1}> renders at 2x, level={2} at 1.5x, etc. Degrades to bold/color on terminals without OSC 66.

## Why
Any silvery app gets real typographic hierarchy. km headings, help dialog sections, board titles could all use larger text.

## Depends on
OSC 66 text-sizing API (already implemented)
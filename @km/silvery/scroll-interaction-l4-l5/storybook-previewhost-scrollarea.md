---
aliases:
  - km-silvercode.storybook-previewhost-scrollarea
  - km-silvercode-storybook-previewhost-scrollarea
created_at: 2026-05-06T00:23:09.047Z
---

# Storybook PreviewHost uses ScrollArea #P2

related:: [[@km/silvery/scroll-interaction-l4-l5]]
blocked_by:: [[@km/silvery/scroll-interaction-l4-l5/scroll-controller-scrollarea]]

## Problem

Silvercode Storybook currently has custom preview measurement and manually
unwraps top-level `Screen` stories into a `Box`. That fixed the immediate
scroll regression, but it is not the L4 design: Storybook should be a host for
story surfaces, not a bespoke scroll implementation.

## Acceptance Criteria

- [ ] Add a `PreviewHost` or equivalent Storybook primitive for terminal
      preview panes.
- [ ] PreviewHost uses canonical `ScrollArea`/controller state.
- [ ] Top-level `Screen` stories render as preview content without claiming
      terminal dimensions.
- [ ] Story-owned scroll remains opt-in and unchanged.
- [ ] Delete local `ScrollableStoryArea` measurement glue that duplicates
      Silvery scroll primitives.
- [ ] Storybook tests cover preview wheel scrolling and scrollbar dragging.

Implemented first phase: silvercode Storybook now consumes Silvery ScrollArea instead of local useKineticScroll/content measurement/Scrollbar glue. Top-level Screen stories are still normalized in runner. Evidence: bun vitest run apps/silvercode/storybook/tests/selection.test.tsx (2 passed).


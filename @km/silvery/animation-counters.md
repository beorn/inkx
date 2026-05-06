---
mentions:
  - km
  - claude
id: "@km/silvery/animation-counters"
aliases:
  - km-silvery.animation-counters
  - km-silvery-animation-counters
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:38Z
closed_at: 2026-04-26T16:38:55Z
close_reason: "Shipped at silvery 865fbabc. 4 components: AnimatedNumber
  (integer roll with format hook), TextShimmer (active-pulse between
  $primary/$muted), TextReveal (typewriter), TimeToFirstDraw (perf marker). 8/8
  tests pass. Built on existing useAnimation hook."
started_at: 2026-04-26T16:36:40Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvery.animation-counters
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T08:37:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] silvery animations — AnimatedNumber, TextShimmer, TextReveal, TimeToFirstDraw @km/silvery #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvery]]

Add animation/counter primitives missing from silvery.

## Audit (2026-04-26)

Already in vendor/silvery/packages/ag-react/src/ui/animation/ + ui/components/:

- useAnimation — low-level frame loop
- useInterval, useTimeout, useTransition — timing hooks
- easing.ts — easing curves
- Spinner — exists (ui/components/Spinner.tsx)

## Real gap (4 components, all built on useAnimation)

- <AnimatedNumber> — smooth integer-to-integer roll (used in tool-count summaries, token meters)
- <TextShimmer> — pulse effect during streaming (used in assistant message during in-flight chunks)
- <TextReveal> — typewriter-style character reveal (used in tool status morphs 'Reading file...' → 'Read 3 files')
- <TimeToFirstDraw> — perf marker overlay (dev-mode only)

## Estimated LOC: ~250-400 (was 400-600 before audit)

## Acceptance

- 4 new components in vendor/silvery/packages/ag-react/src/ui/components/
- Each has a test (rendering at multiple frame ticks; props variants)
- Exported from ag-react barrel
- Listed in vendor/silvery/docs/components/

## Blocks

B.2 tool-status-title, B.2 tool-count-summary, B.7 context-usage.

## Source plan

hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 0 bead 4.


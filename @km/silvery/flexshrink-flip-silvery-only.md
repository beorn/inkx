---
mentions:
  - km
id: "@km/silvery/flexshrink-flip-silvery-only"
aliases:
  - km-silvery.flexshrink-flip-silvery-only
  - km-silvery-flexshrink-flip-silvery-only
created_by: claude:53042a7f
created_at: 2026-04-25T06:52:33Z
closed_at: 2026-04-25T16:02:46Z
close_reason: "Shipped in silvery commit 8d9ce3a6. Production silvery (ag-term,
  browser-renderer, xterm, ag-react/canvas) now uses
  createFlexilyZeroEngine('css') for CSS-correct defaults: flexShrink:1,
  alignContent:stretch, plus auto min-size on flex items via CSS §4.5.
  Ink-compat layer stays on Yoga preset (per /pro review). Pre-flip 58 silvery
  failures (24 new from flip + 34 baseline) → post-flip 35 failures (= baseline
  + 1 flaky memory threshold). All 24 flip-related failures fixed:
  scroll-offset-dirty (6), scroll-snap-child-top (2), termless-coverage (4),
  backdrop-kitty-overlay (3), pretext-layout (3), ink-compat (8),
  examples/dashboard (1), theme-explorer (1), stability/long-running (1). Step D
  (remove preset option from createFlexilyZeroEngine) deferred to follow-up to
  reduce blast radius — option stays as opt-out for now."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.flexshrink-flip-silvery-only
    depends_on_id: km-flexily.auto-min-size-flex-items
    type: blocks
    created_at: 2026-04-25T00:27:55Z
    created_by: claude:53042a7f
    metadata: "{}"
  - issue_id: km-silvery.flexshrink-flip-silvery-only
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T23:52:42Z
    created_by: claude:53042a7f
    metadata: "{}"
  - issue_id: km-silvery.flexshrink-flip-silvery-only
    depends_on_id: km-silvery.flexshrink-audit-silvery
    type: blocks
    created_at: 2026-04-24T23:52:57Z
    created_by: claude:53042a7f
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-flexily.auto-min-size-flex-items
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.flexshrink-audit-silvery
---

# [x] Flip silvery to CSS preset via createFlexilyZeroEngine({defaults:'css'}) (no global flexily flip) @km/silvery #feature #P2

blocks:: [[@km/flexily/auto-min-size-flex-items]], [[@km/silvery]], [[@km/silvery/flexshrink-audit-silvery]]

Cleaner architectural path than flipping flexily DEFAULT_PRESET globally: silvery opts into CSS-correct defaults via the closure-captured preset on its layout engine, while flexily DEFAULT_PRESET stays 'yoga' for drop-in Yoga-compat consumers.

## Why this is cleaner than Phase 6 of @km/silvery/flexshrink-default

- flexily stays drop-in compatible for any consumer that uses bare Node.create() expecting Yoga semantics
- silvery (multi-target framework with web/canvas ambitions) gets CSS-correct defaults
- No module-level state; preset is per-engine
- Reduces blast radius — only silvery components/tests need updating, not flexily's broader user base

## Plan

1. Update silvery's setLayoutEngine call sites to pass {defaults:'css'} to createFlexilyZeroEngine
2. Audit silvery components for rigid widgets that need explicit flexShrink={0} (depends on @km/silvery/flexshrink-audit-silvery)
3. Run silvery test suite, fix breakages
4. Update Prose docstring to current state (sugar, not load-bearing)
5. Update silvery docs to reflect CSS-correct defaults

## Blocked by

- @km/silvery/flexshrink-audit-silvery (component audit)


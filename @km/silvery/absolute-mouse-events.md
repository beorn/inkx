---
mentions:
  - km
id: "@km/silvery/absolute-mouse-events"
aliases:
  - km-silvery.absolute-mouse-events
  - km-silvery-absolute-mouse-events
created_by: claude:db326126
created_at: 2026-03-30T06:20:51Z
closed_at: 2026-04-21T04:26:32Z
close_reason: >-
  Fixed. Silvery's hit-test now uses a two-phase resolution: (1) absolute pass
  walks the whole subtree for absolute-positioned descendants whose scrollRect
  contains (x,y), latest-in-tree wins (matches render paint order); (2) in-flow
  DFS fallback. Absolute children are hittable regardless of whether their
  parent's rect covers the point.


  Commits:

  - silvery 6890e553 feat(silvery): geometry-based hit-test for
  absolute-positioned nodes

  - km 769858bea fix(km-tui): remove popoverHovered workaround — silvery
  hit-test now handles absolute overlays


  Test: vendor/silvery/tests/features/absolute-hit-test.test.tsx — 4 cases
  covering absolute outside tight parent, popover-style overlay across screen
  from anchor, stacked absolutes with topmost winning, absolute under a 1-row
  parent. Before fix: 2 of 4 failed with AssertionError. After fix: all 4 pass.


  Verification:

  - vendor/silvery mouse + hit-test tests: 137/137 pass (selection.test.ts,
  link-hover.test.tsx, interactive-signals.test.ts, inline-rects.test.tsx,
  state-variants.test.tsx, search-bar.test.tsx, text-surface.test.ts,
  absolute-hit-test.test.tsx).

  - All vendor/silvery features-level test failures that remain are pre-existing
  and unrelated (text-frame detachment, useAgNode screenRect, box-in-text
  warning, pipeline fit-content, click-to-position module-resolution error).

  - apps/km-tui/tests: 2332/2332 pass (excluding pre-existing flag-emoji
  nav-garble flake).

  - silvery typecheck: 0 errors in packages/ag-term/src/mouse-events.ts.


  km workaround removed: popoverHovered flag, popoverHovered re-check in hide
  grace timer, and the link-swap suppression that depended on it. HIDE_DELAY
  (300ms grace) preserved as an ergonomics feature (mouse-jitter tolerance), not
  a workaround.
owner: bjorn@stabell.org
---

# [x] Mouse events not dispatched to absolutely positioned elements @km/silvery #bug #P1

silvery's mouse event dispatch doesn't reliably fire mouseEnter/mouseLeave on absolutely positioned Box elements (e.g., popovers). The popover overlay has onMouseEnter/onMouseLeave handlers but they don't fire when the mouse moves from a regular-flow element to the popover.

Workaround: km uses popoverHovered flag + 300ms timer with re-check at fire time. Cards check bounding box geometry in handleMouseLeave. Works but fragile.

Fix: silvery's hit-test dispatch should include absolute positioned nodes in the hover-target resolution, regardless of tree order.


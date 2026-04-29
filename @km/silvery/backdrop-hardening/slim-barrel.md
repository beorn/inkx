---
id: "@km/silvery/backdrop-hardening/slim-barrel"
aliases:
  - km-silvery.backdrop-hardening.slim-barrel
  - km-silvery-backdrop-hardening-slim-barrel
created_by: claude:88c0e764
created_at: 2026-04-20T21:01:08Z
closed_at: 2026-04-20T21:37:29Z
close_reason: Removed forEachFadeRegionCell, mixSrgb, deemphasizeOklch,
  deemphasizeOklchToward from public barrel. Tests now import internals from
  source modules directly (region.ts, color-compat.ts). 100 backdrop tests pass.
  Commit 7172d5c4.
---

# [x] Slim public barrel — stop re-exporting internals @km/silvery #task #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P2.2. After the merciless cleanup, the pipeline/backdrop/index.ts barrel still exports internal utilities:

- forEachFadeRegionCell
- mixSrgb
- deemphasizeOklch
- deemphasizeOklchToward
- normalizeHex (arguably)

Pro: "stop re-exporting internals from the public barrel" — makes later cleanup easier.

## Decision required

Module is either (A) public low-level toolkit (harden everything) or (B) internal pipeline module (slim barrel). Pro's preference: B.

## /complete criteria

- [ ] index.ts public exports = {applyBackdrop, buildPlan, hasBackdropMarkers, BackdropOptions, BackdropResult, Plan, PlanRect, ColorLevel, DEFAULT_AMOUNT, HexColor, normalizeHex?}
- [ ] Internal helpers (forEachFadeRegionCell, mixSrgb, deemphasize*) unreachable from public barrel
- [ ] Any consumer that imported the removed exports updated (check @km/tui, ag.ts, tests)
- [ ] All 81 backdrop tests still green

## Parent

@km/silvery/backdrop-hardening
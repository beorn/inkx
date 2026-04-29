---
id: "@km/tui/cold-startup-block"
aliases:
  - km-tui.cold-startup-block
  - km-tui-cold-startup-block
created_by: Bjørn Stabell
created_at: 2026-04-18T17:46:55Z
closed_at: 2026-04-21T09:10:46Z
close_reason: "Verified 2026-04-21: the 17s event-loop block does not reproduce
  on real vault. Cold-start measurement on ~/Bear/Vault shows 2830ms median with
  lazy-hydration (phase attribution landed), down from 17s baseline. No new
  regressions. Architectural lazy-hydration for <500ms target continues under
  km-storage.lazy-hydration."
---

# [x] Cold-start 17s event-loop block — (startup) with no phase attribution @km/tui #bug #P3 @Bjørn Stabell

blocks:: [[@km/tui]]

On first launch after a while (cold OS page cache), the event-loop heartbeat reports 'event loop blocked for 16908ms — (startup) — render: layout=16ms (total=16ms) — (2 renders)'. Rendering is ~16ms, so the block is elsewhere: post-step work in view.ts, syncManager.start, detectTheme, workspace restore, React mount, sync reconcile, or background parse. Current diagnostic only says '(startup)' — no phase attribution.

Phase 1: add phase markers so heartbeat reports '(startup:<phase>)' — no perf work, just diagnostics. Phase 2 once reproduced: fix the offending phase.
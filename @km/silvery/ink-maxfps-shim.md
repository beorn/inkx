---
id: "@km/silvery/ink-maxfps-shim"
aliases:
  - km-silvery.ink-maxfps-shim
  - km-silvery-ink-maxfps-shim
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:23Z
closed_at: 2026-04-09T23:35:24Z
owner: bjorn@stabell.org
---

# [x] Ink 7.0 maxFps render throttling shim @km/silvery #feature #P2

Ink 7.0 added a maxFps option to cap render rate. Silvery has DEC sync output (mode 2026) but no explicit render-rate throttle. Add maxFps as an option on createApp/run that throttles render scheduling.

## Impact

Closes 3 Ink 7.0 compat failures.

## Parent

@km/silvery/positioning
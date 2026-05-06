---
mentions:
  - km
  - claude
id: "@km/silvery/osc66-probe"
aliases:
  - km-silvery.osc66-probe
  - km-silvery-osc66-probe
created_by: claude:c9beade3
created_at: 2026-03-14T15:20:58Z
closed_at: 2026-03-14T23:45:44Z
close_reason: Implemented and committed in silvery 5b25c8f + termless 3887c47
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Wire detectTextSizingSupport() — progressive enhancement for OSC 66 @km/silvery #task #P1 @claude:c9beade3

Default osc66=false. Async probe at startup. Enable + full redraw on success. Cache by terminal fingerprint. Allow user override (always/auto/never). Never put visible content inside a private control sequence unless support is proven. See docs/lessons/testing-escape-hatches.md.


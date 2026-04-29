---
id: "@km/flexily/fingerprint-abs-pos"
aliases:
  - km-flexily.fingerprint-abs-pos
  - km-flexily-fingerprint-abs-pos
created_by: claude:c9beade3
created_at: 2026-03-13T15:10:24Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
---

# [x] Fingerprint caching ignores absX/absY — stale rounded edges on fractional moves @km/flexily #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review P1. Fingerprint only compares availableWidth/Height/direction/offset but not absolute position that affects edge-based rounding. A fractional ancestor movement changes rounded edges but cache returns stale values.
---
mentions:
  - km
  - claude
id: "@km/silvery/ink-compat"
aliases:
  - km-silvery.ink-compat
  - km-silvery-ink-compat
created_by: claude:0b5ea482
created_at: 2026-03-10T20:36:29Z
closed_at: 2026-03-12T23:36:15Z
close_reason: Ink compat at 98.9% (804/813), Chalk 100% (32/32). Auto-generated
  vitest layer, DRY cleanup done. Superseded by compat-autogen and compat-dry.
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Ink compat test suite: fix bundle crash, reach 90%+ @km/silvery #task #P2 @claude:73d7a332

Ink compat 98.2% (798/813). Started at 95.9% (780/813). Remaining 15 failures: 3 border alignment (Flexily vertical rounding, wide chars column stretch), 2 flex-justify (space-around rounding), 2 flex-wrap (no-wrap overflow behavior), 3 overflow edge cases (text concat, left clip off-by-one, OOB border), 3 aspectRatio (Flexily AR), 1 measure-element, 1 render-to-string.


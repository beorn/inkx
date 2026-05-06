---
mentions:
  - km
id: "@km/termless/interactivity"
aliases:
  - km-termless.interactivity
  - km-termless-interactivity
created_by: claude:4a5961be
created_at: 2026-03-16T22:05:47Z
closed_at: 2026-03-16T23:18:48Z
close_reason: "Implemented Playwright-parity mouse API: click, dblclick,
  mouseDown, mouseUp, mouseMove, wheel. All support button selection
  (left/middle/right) and modifier keys (ctrl/shift/alt). Added MouseOptions and
  MouseModifiers types. Updated docs (best-practices.md, terminal.md API
  reference, CLAUDE.md, README.md). Auto-retry matchers accept { timeout }
  option."
owner: bjorn@stabell.org
---

# [x] termless interactivity: click, dblclick, Playwright-style ergonomics @km/termless #feature #P3

Track click() and dblclick() additions to termless Terminal. Done: click() with modifier support, dblclick() with configurable delay, timeout option on auto-retry matchers, deprecate waitFor. TODO: check Playwright feature parity (drag, hover, right-click, scroll wheel), update docs/reference.


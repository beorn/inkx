---
id: "@km/tui/osc8-card-body"
aliases:
  - km-tui.osc8-card-body
  - km-tui-osc8-card-body
created_by: claude:36393b5d
created_at: 2026-02-19T13:24:37Z
closed_at: 2026-02-19T13:43:50Z
---

# [x] Cards: OSC 8 escape garbage in body content from links @km/tui #bug #P2 @claude:36393b5d

Card body content shows raw OSC 8 escape sequences from hyperlinks instead of clean text. The pretty-URL feature adds OSC 8 hyperlinks but card body truncation/display doesn't handle them properly.
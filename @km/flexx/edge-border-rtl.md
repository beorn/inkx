---
id: "@km/flexx/edge-border-rtl"
aliases:
  - km-flexx.edge-border-rtl
  - km-flexx-edge-border-rtl
created_at: 2026-02-05T12:50:49Z
closed_at: 2026-02-06T21:43:36Z
---

# [x] fix(flexx): setEdgeBorder hardcodes START=LEFT regardless of direction @km/flexx #bug #P2 @claude:a3625ec3

setEdgeBorder resolves START to LEFT unconditionally. Low impact (LTR only) but API correctness issue.
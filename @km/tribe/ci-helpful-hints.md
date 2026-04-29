---
id: "@km/tribe/ci-helpful-hints"
aliases:
  - km-tribe.ci-helpful-hints
  - km-tribe-ci-helpful-hints
created_by: claude:19080504
created_at: 2026-04-01T06:11:52Z
closed_at: 2026-04-01T06:19:19Z
close_reason: "Implemented: CI protocol in system prompt instructs sessions to
  send fix hints on CI alerts"
---

# [x] CI: sessions provide helpful hints when they see failures in their domain @km/tribe #feature #P3 @claude:19080504

When a CI failure broadcasts, sessions with domain expertise can respond with hints.

Example: session working on termless sees 'CI ALERT: beorn/termless CI failed 3x' and responds:
'hint: termless CI needs vt220.js published — run npm publish from vendor/vt100/packages/vt220'

This is protocol-level — add 'github:ci-alert' to the notification types that sessions can respond to. The system prompt should instruct: 'When you see a CI alert for a repo you know about, send a hint with what might fix it.'
---
mentions:
  - km
  - claude
id: "@km/inkx/strict-style-verify"
aliases:
  - km-inkx.strict-style-verify
  - km-inkx-strict-style-verify
created_by: claude:23485adf
created_at: 2026-02-24T11:47:10Z
closed_at: 2026-03-04T16:36:14Z
owner: bjorn@stabell.org
assignee: claude:3c1481f8
---

# [x] INKX_STRICT: verify ANSI SGR output matches buffer styles (catch all rendering issues) @km/inkx #task #P2 @claude:3c1481f8

Current INKX_STRICT and INKX_STRICT_OUTPUT verify buffer content and character positions, but skip SGR/style verification entirely. Both replayAnsi() in output-phase.ts and VirtualTerminal in with-diagnostics.ts ignore SGR sequences. Need a style-aware virtual terminal that can compare fg/bg/attrs of rendered ANSI output against buffer cell data.


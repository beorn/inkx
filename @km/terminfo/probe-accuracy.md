---
id: "@km/terminfo/probe-accuracy"
aliases:
  - km-terminfo.probe-accuracy
  - km-terminfo-probe-accuracy
created_by: claude:4929065a
created_at: 2026-03-26T07:18:49Z
closed_at: 2026-03-26T07:24:53Z
close_reason: "Fixed all 19 vacuous termless probes that returned { pass: true }
  without verification. Each now checks actual terminal state (getMode, getCell,
  getCursor, feedCapture, capabilities). Updated probe metadata in
  features.json. Added ~95 annotations. All result files regenerated."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Fix remaining vacuous termless probes + update probe metadata @km/terminfo #task #P2 @claude:4929065a

14 termless probes still return { pass: true } without verification (modes.mouse-sgr, modes.mouse-all, modes.alt-screen.exit, erase.selective, erase.ed-scroll-region, cursor.*, scrollback.*, text.*, reset.method). Fix each to verify actual terminal state. Update probe metadata in features.json for all changed probes. Re-run all probes, update result files, rebuild site.
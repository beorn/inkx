---
id: "@km/terminfo/version-dedup"
aliases:
  - km-terminfo.version-dedup
  - km-terminfo-version-dedup
created_by: claude:4929065a
created_at: 2026-03-31T18:56:57Z
closed_at: 2026-03-31T19:11:11Z
close_reason: Home page dedup implemented — only best version per backend shown
  (most probes first, then latest version). All backends re-probed at 161
  features. Version history on detail pages deferred to separate bead.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Show only latest version per backend on home page, version history on detail pages @km/terminfo #task #P2 @claude:4929065a

Home page shows 4 xterm.js entries (all 76%). Should show only the latest version per backend. Detail pages should show version history with latest primary and older versions collapsible. Also: clarify unknown vs not-implemented labeling.
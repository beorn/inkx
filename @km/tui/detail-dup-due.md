---
id: "@km/tui/detail-dup-due"
aliases:
  - km-tui.detail-dup-due
  - km-tui-detail-dup-due
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:38:53Z
closed_at: 2026-02-18T14:03:07Z
---

# [x] Detail pane: duplicate 'Due Jan 26' lines accumulate on j/k navigation @km/tui #bug #P2

When navigating between cards with j/k while the detail pane is open, each navigation adds another 'Due Jan 26' line to the metadata. The MetadataTable rows accumulate instead of being replaced. Likely a state/rendering issue where metadata rows are appended rather than recomputed on node change.
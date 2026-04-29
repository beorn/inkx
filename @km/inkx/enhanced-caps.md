---
id: "@km/inkx/enhanced-caps"
aliases:
  - km-inkx.enhanced-caps
  - km-inkx-enhanced-caps
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:32:49Z
closed_at: 2026-03-04T16:23:35Z
owner: bjorn@stabell.org
---

# [x] Enhanced terminal detection via DA1/XTVERSION (runtime queries) @km/inkx #feature #P3

Augment env-based detectTerminalCaps() with runtime DA1/XTVERSION queries when env detection is ambiguous. Precise sixel detection via DA1 param 4. Terminal identification via XTVERSION.

Files: inkx terminal-caps.ts
Depends on: @km/silvery-legacy/device-attrs
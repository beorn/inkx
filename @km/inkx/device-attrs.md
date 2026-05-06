---
mentions:
  - km
id: "@km/inkx/device-attrs"
aliases:
  - km-inkx.device-attrs
  - km-inkx-device-attrs
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:27:32Z
closed_at: 2026-02-25T23:37:05Z
owner: bjorn@stabell.org
---

# [x] DA1/DA2/DA3 + XTVERSION — device attributes and terminal identification @km/inkx #feature #P3

Implement device attribute queries for unambiguous terminal identification:

- DA1 (CSI c): primary device attributes (feature flags like sixel support)
- DA2 (CSI > c): secondary (terminal type + version)
- DA3 (CSI = c): tertiary (terminal unit ID)
- XTVERSION (CSI > 0 q): terminal name and version string (Kitty/Ghostty/WezTerm)

Complements the existing env-based detectTerminalCaps() with runtime queries.


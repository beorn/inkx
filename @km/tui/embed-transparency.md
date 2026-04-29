---
id: "@km/tui/embed-transparency"
aliases:
  - km-tui.embed-transparency
  - km-tui-embed-transparency
created_by: claude:f8196c1c
created_at: 2026-03-28T14:32:41Z
closed_at: 2026-03-28T14:53:15Z
close_reason: "Detail pane now resolves embed_source to target node. Shows
  target's metadata (status, due, etc.) and children. Three resolution sites:
  DetailView render, openDetailPane cursor init, cursor sync. Tests: 2 new embed
  transparency tests pass."
---

# [x] Embed cards should transparently show target's title, icon, body, and children @km/tui #feature #P2 @claude:f8196c1c

Currently embed cards show: raw filename as title (not target's display name), generic icon (not target's type icon), empty detail pane (not target's children/body). Embeds should fully 'take on' the identity of their resolved target — title from getNodeDisplayName(target), icon from target type, children from target, body content from target.
---
id: "@km/tui/embed-excl-sigil"
aliases:
  - km-tui.embed-excl-sigil
  - km-tui-embed-excl-sigil
created_by: claude:a5c7f7de
created_at: 2026-02-15T07:55:53Z
closed_at: 2026-02-15T08:44:14Z
owner: bjorn@stabell.org
---

# [x] Embedded nodes still render with \! prefix after 'km add' @km/tui #bug #P2

After using 'km add' to create embedded links, the nodes still render with the \! prefix (from \![[target]] syntax) in the TUI. See /tmp/vt/@next.
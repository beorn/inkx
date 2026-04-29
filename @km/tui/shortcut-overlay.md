---
id: "@km/tui/shortcut-overlay"
aliases:
  - km-tui.shortcut-overlay
  - km-tui-shortcut-overlay
created_by: claude:656602a3
created_at: 2026-03-16T21:40:24Z
closed_at: 2026-03-16T21:56:49Z
close_reason: "Hold-? shortcut overlay: shows contextual keybindings while ? is
  held, dismisses on release. With Kitty protocol: press ? opens, release ?
  dismisses, repeat ? while open is noop. Without Kitty: press ? toggles
  (legacy). Implementation: board-app.ts handleKey early-returns on release
  events (only ? release dismisses help), keybindings.ts splits ? binding into
  Kitty/non-Kitty variants."
---

# [x] Hold-? shortcut overlay (uses key release events) @km/tui #feature #P2

Hold '?' to show a contextual keyboard shortcuts overlay. Release to dismiss. Requires key release detection (@km/silvery/key-release). Like VS Code's keybinding overlay but triggered by holding a key.
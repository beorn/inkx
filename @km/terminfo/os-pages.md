---
mentions:
  - km
id: "@km/terminfo/os-pages"
aliases:
  - km-terminfo.os-pages
  - km-terminfo-os-pages
created_by: claude:f8196c1c
created_at: 2026-03-26T00:07:59Z
owner: bjorn@stabell.org
---

# [ ] OS pages: /os/{macos,linux,windows} — which terminals and features per platform @km/terminfo #feature #P4

Platform-specific pages showing terminal availability and feature coverage per OS.

Pages:

- /os/macos — Ghostty, iTerm2, Terminal.app, Kitty, Warp, VS Code, Cursor + compliance scores
- /os/linux — Ghostty, Kitty, Alacritty, WezTerm, foot, GNOME Terminal, VS Code + compliance
- /os/windows — Windows Terminal, VS Code, ConPTY + compliance

Content:

- content/platforms.json with OS metadata, available terminals, platform-specific notes
- Platform icons already exist in the matrix
- Can derive from existing probe data (results have 'os' field)
- Analysis per platform: which OS has the best terminal ecosystem, what's missing

SEO value: people search 'best terminal for macOS' / 'linux terminal comparison' / 'windows terminal features'

Dependencies: none (can build from existing data + content)


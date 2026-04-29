---
id: "@km/terminfo/new-probes-q1-2026"
aliases:
  - km-terminfo.new-probes-q1-2026
  - km-terminfo-new-probes-q1-2026
created_by: claude:27beac99
created_at: 2026-03-26T06:51:20Z
closed_at: 2026-03-26T17:10:16Z
close_reason: "Implemented 5 new probes: extensions.osc9-progress (term-only),
  extensions.osc66-text-sizing, extensions.osc5522-clipboard,
  modes.color-scheme-reporting (Mode 2031 + DECDSR 997),
  input.modify-other-keys-3. All with dual termless/term implementations,
  features.json metadata, 27 annotations. Site builds."
owner: bjorn@stabell.org
assignee: claude:27beac99
---

# [x] New probes: OSC 9;4 progress, Mode 2031 color-scheme, OSC 66 text-sizing, OSC 5522 clipboard @km/terminfo #feature #P2 @claude:27beac99

Q1 2026 quarterly review identified 5 high-priority new probes to add:

1. extensions.osc9-progress — ConEmu OSC 9;4 progress bar. Supported by: Ghostty, Windows Terminal, iTerm2, Konsole, mintty, WezTerm. Broad adoption.
2. modes.color-scheme-reporting — Mode 2031 dark/light notifications + DECDSR 997. Supported by: iTerm2, tmux 3.6, Contour, foot, kitty.
3. extensions.osc66-text-sizing — Kitty text sizing protocol (OSC 66). Supported by: kitty, foot. Ghostty parsing only.
4. extensions.osc5522-clipboard — Kitty advanced clipboard (MIME types). Supported by: kitty. Ghostty parsing only.
5. input.modify-other-keys-3 — xterm modifyOtherKeys mode 3 (all keys). Supported by: xterm.

Each needs: features.json metadata + probe-defs termless/term implementations + annotations + re-probe all terminals.

Sources: xterm changelog (patches 397-407), kitty changelog (0.43-0.46), Ghostty 1.2-1.3 release notes, iTerm2 3.6.6-3.6.9.
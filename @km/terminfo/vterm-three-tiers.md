---
mentions:
  - km
  - claude
id: "@km/terminfo/vterm-three-tiers"
aliases:
  - km-terminfo.vterm-three-tiers
  - km-terminfo-vterm-three-tiers
created_by: claude:4929065a
created_at: 2026-03-31T23:30:34Z
closed_at: 2026-03-31T23:47:39Z
close_reason: "Three-tier emulators implemented: vt100.js (strict VT100,
  monochrome), vt220.js (new, 8 colors + IRM + DECSED), vterm.js (unchanged,
  161/161). Termless backends created for all three. CLAUDE.md updated."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Three-tier emulator packages: vt100.js (strict VT100), vt220.js (VT220), vterm.js (modern) @km/terminfo #task #P3 @claude:4929065a

Current vt100.js has VT220 features (8 colors, IRM, DECKPAM). Strip it to strict VT100 (monochrome, bold/underline/blink/reverse, cursor, scroll regions, DA1/DSR). Extract VT220 features into new vt220.js package. All under @vterm scope: @vterm/vt100, @vterm/vt220, @vterm/modern.

Three tiers:

- vt100.js: VT100 (1978) — monochrome, basic SGR, cursor, DECSC/DECRC, DA1/DSR
- vt220.js: VT220 (1983) — + 8 colors, IRM, DECSED, DECSTR, application keypad
- vterm.js: Modern (2026) — everything (161/161 terminfo.dev)


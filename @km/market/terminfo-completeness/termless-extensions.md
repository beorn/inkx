---
id: "@km/market/terminfo-completeness/termless-extensions"
aliases:
  - km-market.terminfo-completeness.termless-extensions
  - km-market-terminfo-completeness-termless-extensions
created_by: Bjørn Stabell
created_at: 2026-04-06T06:01:11Z
closed_at: 2026-04-06T06:12:08Z
close_reason: consolidated into km-market.terminfo-completeness.sgr-visual
owner: bjorn@stabell.org
---

# [x] Extend termless for more probeable features @km/market #task #P2

Extend termless to support more probe verification strategies, reducing the number of "partial" and "unprobed" features.

## Easy wins (small termless additions)
- Hyperlink state per cell (getCell().hyperlink) — verify OSC 8 URL stored
- Title stack (OSC 22;0 t / 23;0 t push/pop) — track stack state
- Clipboard buffer — fake clipboard that OSC 52 writes to, probes read back
- Pointer shape state (OSC 22) — store and expose shape value
- Image protocol receipt — expose parsed sixel/kitty graphics metadata
- Text reflow on resize — simulate resize, verify line rewrapping

## Medium
- Desktop notification tracking (count + last message)
- OSC 99 kitty notification state
- VTE termprop (OSC 666) property bag

## Hard / not worth it
- Font ligatures (rendering concern)
- GPU acceleration (implementation detail)
- Background transparency (visual only)
- IME/CJK behavior (input processing)

## Current status
192 features: 179 automated, 10 partial, 3 unprobed.
Each item above could move 1-3 features from partial/unprobed → automated.

Blocked by: understanding which termless backends (xterm.js, vterm.js, ghostty, kitty, wezterm, alacritty, vt100) support each feature.
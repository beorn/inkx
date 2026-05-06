---
mentions:
  - km
id: "@km/market/terminfo-completeness/sgr-gaps"
aliases:
  - km-market.terminfo-completeness.sgr-gaps
  - km-market-terminfo-completeness-sgr-gaps
created_by: Bjørn Stabell
created_at: 2026-04-06T06:07:59Z
closed_at: 2026-04-06T06:12:07Z
close_reason: consolidated into km-market.terminfo-completeness.sgr-visual
owner: bjorn@stabell.org
---

# [x] Add underline color + SGR gaps (SGR 58/59) @km/market #task #P1

HIGH PRIORITY: underline color is the single most valuable missing SGR feature.

- SGR 58;5;N m — indexed underline color
- SGR 58;2;R;G;B m — truecolor underline color
- SGR 59 m — reset underline color

Widely supported: Kitty, WezTerm, foot, Ghostty, VTE, mintty, Alacritty (recent), iTerm2.

Also check:

- SGR 38:2::R:G:B (ITU T.416 subparameterized color) — different from SGR 38;2;R;G;B
- SGR 58:2::R:G:B same sub-param syntax

Termless already has styled underline attribute support. Should extend to track underline color per cell.


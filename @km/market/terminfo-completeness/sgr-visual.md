---
id: "@km/market/terminfo-completeness/sgr-visual"
aliases:
  - km-market.terminfo-completeness.sgr-visual
  - km-market-terminfo-completeness-sgr-visual
created_by: Bjørn Stabell
created_at: 2026-04-06T06:11:24Z
closed_at: 2026-04-06T07:02:33Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Visual SGR + termless extensions (underline color + rendering verification) @km/market #task #P1 @Bjørn Stabell

Consolidates: sgr-gaps + visual-probes + termless-extensions

## Why together
SGR 58/59 (underline color) is the highest-priority missing SGR feature. Implementing it
requires extending termless to track underline color per cell, which is the same termless
extension work as other partial→automated upgrades. Visual verification via SVG screenshots
validates the result. All touch the same files.

## Deliverables

### 1. Underline color (SGR 58/59) — HIGH PRIORITY
- SGR 58;5;N m — indexed
- SGR 58;2;R;G;B m — truecolor
- SGR 58:2::R:G:B m — ITU T.416 subparam
- SGR 59 m — reset
Widely supported: Kitty, WezTerm, foot, Ghostty, VTE, mintty, Alacritty, iTerm2.

### 2. Termless extensions (move partial → automated)
- Hyperlink state per cell (getCell().hyperlink) — verify OSC 8 URL stored
- Title stack (OSC 22;0 t / 23;0 t)
- Clipboard buffer (OSC 52 round-trip)
- Pointer shape state (OSC 22)
- Image protocol receipt (sixel/kitty graphics metadata)
- Underline color per cell (for SGR 58)
- Text reflow on resize

### 3. Visual rendering probes
Two-tier strategy:
- **Termless SVG** (screenshotSvg): fast, cross-platform, deterministic. State visualization — same info as getCell() rendered visually. Use for CI.
- **Peekaboo PNG** (macOS only): launches real terminal app, captures via screencapture. Use for actual rendering verification.

Candidates for SVG-based verification:
- SGR attribute rendering (bold, italic, underline variants)
- Color accuracy (OSC 4 → cell color matches)
- Cursor shape (DECSCUSR)
- Underline color (SGR 58)
- Box drawing chars
- Extended colors

Still unprobeable even with screenshots:
- Font ligatures, GPU acceleration, transparency, font fallback
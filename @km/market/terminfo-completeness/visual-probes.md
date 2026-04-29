---
id: "@km/market/terminfo-completeness/visual-probes"
aliases:
  - km-market.terminfo-completeness.visual-probes
  - km-market-terminfo-completeness-visual-probes
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:53Z
closed_at: 2026-04-06T06:12:08Z
close_reason: consolidated into km-market.terminfo-completeness.sgr-visual
owner: bjorn@stabell.org
---

# [x] Visual rendering probes via SVG screenshots @km/market #task #P2

Termless already supports SVG/PNG screenshots via term.screenshotSvg().
Use this to add visual verification for features currently marked "partial".

Candidates:
- SGR attribute rendering (bold, italic, underline variants rendered correctly)
- Color accuracy (OSC 4 sets color → screenshot verifies cell color matches)
- Cursor shape (DECSCUSR → screenshot verifies shape in SVG)
- Underline color (SGR 58 → verify underline color in SVG)
- Box drawing characters (DEC special graphics)
- Hyperlinks (OSC 8 → verify underline styling applied)
- Extended colors (256-color, truecolor)

Strategy: compare SVG output against expected pattern, or snapshot-diff against golden files.
Promotes features from "partial" to "automated".

Still unprobeable even with screenshots:
- Font ligatures (per-cell SVG, no shape engine)
- GPU acceleration
- Transparency/blur
- Font fallback
---
mentions:
  - km
id: "@km/inbox/4itju"
aliases:
  - km-4itju
  - "@km/_orphan/4itju"
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:19Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 2: Tone pass — remove Ink digs across all docs @km/_orphan #task #P2

Systematic tone pass across all 7 key docs. Rule: say "Silvery provides X" instead of "Ink lacks X."

## Specific changes by file

### guide/why-silvery.md

- "can't fix without a rewrite" → "addressing this would require fundamentally redesigning the render pipeline"
- "Ink's #1 issue, open since 2016" → "a known limitation in Ink since 2016 (see issue #5)"
- Bullet list: "vs Ink's full-tree re-render" → "compared to full-tree re-render approaches"
- "vs Yoga's monotonically growing WASM memory" → "unlike WASM-based layout engines that can grow memory unboundedly"

### guide/silvery-vs-ink.md

- Intro is already good (acknowledges Ink's maturity). Keep "Shared Foundation" section — it builds trust.
- Real-World Impact section: reframe Claude Code reference. Current: "Claude Code...reported 120+ GB memory usage...crashing every 30-60 minutes. Silvery's pure-TS layout eliminates this entire bug category." → "Large-scale Ink apps have encountered memory issues from Yoga's WASM linear memory growth (e.g., Claude Code saw process memory balloon; see issue). Silvery avoids this class of problem by using pure JS layout with normal garbage collection."
- Flicker paragraph: already credits Ink v6.5/v6.7 improvements — good, keep as-is.
- "Missing capabilities": "features that require significant custom code in Ink" → "features that require additional libraries or manual implementation in Ink"
- Table cells: where Ink has "None", keep factual. Where it links to Ink issues, frame as context not ammunition.

### guide/comparison.md

- Add disclaimer under legend: "Ratings reflect the author's assessment based on documented features and benchmarks."
- Review each ⚡ rating — ensure it's truly category-leading, not just "we do it"
- Ensure other frameworks get ⚡ where deserved (BubbleTea: Elm architecture; Textual: CSS DevTools; Notcurses: image rendering)

### docs/index.md

- Handled in Phase 1 (feature blurbs)

### README.md

- Handled in Phase 7 (README rewrite)


---
id: "@km/silvery/frame-recorder"
aliases:
  - km-silvery.frame-recorder
  - km-silvery-frame-recorder
created_by: Bjørn Stabell
created_at: 2026-04-06T19:59:31Z
owner: bjorn@stabell.org
---

# [ ] Frame-by-frame cell-level testing — record, diff, replay render frames @km/silvery #feature #P3

USE existing frame infrastructure — it's already built.

## Already Works
- termless tape executor: TapeFrame[] with frames array + cell(row, col) → CellView
- silvery renderer: instance.frames exposed on render handle
- TextFrame: cell(col, row) with resolved RGB
- SILVERY_STRICT_ACCUMULATE: replays all frames, cell-by-cell diff
- CellView: per-cell bold/italic/fg/bg/underline access

## What This Bead Is About
Write tests that USE these APIs for frame-level assertions. No new infrastructure needed.

Example:
  using term = createTermless({ cols: 80, rows: 24 })
  const handle = await run(<App />, term)
  handle.press('j')
  
  // Access frames via handle.frames (ANSI strings) or term.cell(r,c) (current)
  // For frame history: use tape executor's TapeFrame[]

Demote to P3 — this is a testing pattern to adopt, not a feature to build.
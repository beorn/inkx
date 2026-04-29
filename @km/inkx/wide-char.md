---
id: "@km/inkx/wide-char"
aliases:
  - km-inkx.wide-char
  - km-inkx-wide-char
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:03:32Z
closed_at: 2026-02-23T00:28:59Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Wide character handling improvements for CJK/emoji @km/inkx #task #P2 @claude:ee8efc0f

Optimize wide character diff in output-phase. Current implementation is correct but falls back to full-row re-render for any row containing wide chars (findWideCharChangedRows). The optimization is to treat the two columns of a wide char as an atomic unit in cell-level diff, avoiding the full-row fallback. Existing infrastructure: unicode.ts (isWideGrapheme, graphemeWidth), buffer.ts (wide cell flag + continuation cells), terminal-adapter.ts (wide char rendering), output-phase.ts (wideCharRows full-row fallback).
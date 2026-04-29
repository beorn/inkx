---
id: "@km/silvery/terminal-support"
aliases:
  - km-silvery.terminal-support
  - km-silvery-terminal-support
created_by: claude:65d845d9
created_at: 2026-03-13T17:58:57Z
closed_at: 2026-03-27T19:02:21Z
close_reason: "Grooming: steps 0-7 complete per notes. Remaining child
  (terminal-width-db) tracked as standalone P2 bead"
---

# [x] Terminal support: unified Cell type, STRICT_TERMINAL, cross-backend matrix @km/silvery #epic #P2

Layered terminal support strategy (docs/design/terminal-support-strategy.md).

Key deliverables:
1. Shared Cell type in @termless/core — one type for termless + silvery (eliminate 3 redundant types)
2. getCell(row, col) convention everywhere (currently reversed between projects)
3. Flatten silvery CellAttrs into Cell (cell.bold not cell.attrs.bold)
4. Delete 400 lines of custom ANSI replay in output-phase.ts (replaced by termless backends)
5. SILVERY_STRICT_TERMINAL invariant — buffer-vs-backend cell comparison
6. Multi-backend wide char matrix tests (extend beyond xterm.js)
7. Character width database (empirical evidence for upstream bug reports)
8. Strategy doc background section (why cross-terminal is hard)

Children: @km/silvery/strict-terminal, @km/silvery/terminal-width-db
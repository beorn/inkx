---
id: "@km/inbox/uv4z"
aliases:
  - km-uv4z
  - "@km/_orphan/uv4z"
created_at: 2026-01-19T14:50:33Z
closed_at: 2026-01-19T15:25:51Z
---

# [x] Migrate TUI to @km/board BoardState as source of truth @km/_orphan #epic #P2

Replace TUI's manual BoardState with @km/board's boardReducer.

Current: TUI has its own BoardState with (colIndex, cardIndex) that's separate from @km/board.
Target: TUI uses @km/board's BoardState with cursor: TPath, derives columns at render time.

Benefits:
- Single source of truth for navigation
- Remove command-bridge.ts state conversion
- boardReducer handles all navigation logic
- TUI becomes a pure view layer

Architecture:
@km/board BoardState → derive ColumnsLayout → render

Parent epic for migration tasks.
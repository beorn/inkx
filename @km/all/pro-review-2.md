---
id: "@km/all/pro-review-2"
aliases:
  - km-all.pro-review-2
  - km-all-pro-review-2
created_by: claude:c9beade3
created_at: 2026-03-13T22:44:49Z
closed_at: 2026-03-18T18:56:24Z
close_reason: "Grooming: Review complete. 9/11 P0+P1 fixed, 2 on feature
  branches. P2s tracked separately."
---

# [x] Pro Review Round 2: 2026-03-13 — termless @km/all #epic #P2 @claude:c9beade3

Pro Review Round 2: 2026-03-13

## Progress
| Package | Status | P0 | P1 | P2 | P3 | Cost |
|---------|--------|----|----|----|----|------|
| termless | 9/11 fixed | 5 | 6 | 2 | 0 | $3.38 |

## Totals
- Findings: 13 (5 P0, 6 P1, 2 P2)
- Fixed: 9/11 P0+P1 (2 already fixed on feature branch)
- Cost: $3.38

## Fixed (this session)
- @km/_orphan/dt7z5: toHaveScrollbackLines now subtracts screenLines
- @km/_orphan/rizhb: snapshot matchers wire into Vitest snapshot API
- @km/_orphan/4msy0: pty.ts spawns directly instead of bash -c
- @km/_orphan/800ff: session creation wrapped in try/catch for cleanup
- @km/_orphan/1uubp: encodeKeyToAnsi delegates to keyToAnsi (single encoder)
- @km/_orphan/otrwl: added onResponse callback to TerminalBackend
- @km/_orphan/gg3fh: defined scrollback/viewport coordinate protocol, fixed vt100+ghostty backends
- @km/_orphan/wsc4n: CursorState fields nullable (visible, style)
- @km/_orphan/ou68u: Peekaboo documented as best-effort visual companion

## Fixed (feature branches, pre-existing)
- @km/_orphan/yg2ng: Cell contract unified on feat/cell-type-unification
- @km/_orphan/79qrz: Selectors made lazy on feat/terminal-support

## P2 (tracked only)
- Recording drops non-text visual changes
- Async Ghostty init doesn't fit sync backend interface
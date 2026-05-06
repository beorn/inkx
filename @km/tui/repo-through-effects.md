---
mentions:
  - km
  - Bjørn
id: "@km/tui/repo-through-effects"
aliases:
  - km-tui.repo-through-effects
  - km-tui-repo-through-effects
created_by: Bjørn Stabell
created_at: 2026-04-02T06:08:40Z
closed_at: 2026-04-02T07:47:59Z
close_reason: "All content-touching mutations routed through
  effect/normalization pipeline. Phase A: Repo-level auto-derive (30df1dad).
  Phase B: board-actions via runRepoEffect (462f7885). Phase C: view files via
  useRepoEffect hook (5bfffb3c). Remaining direct repo calls are non-content
  mutations (type changes, metadata-only)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Route all repo mutations through effect pipeline — normalization + validation coverage @km/tui #task #P1 @Bjørn Stabell

PROBLEM: normalization plugins (withTitle, withName) and validateEffects only cover the 15% of
mutations that go through Board.apply → runBoardEffects. The other 85% (35 direct ctx.repo calls
in board-actions.ts) bypass normalization and validation entirely. This means content/title/name
divergence bugs can still happen through most code paths.

ROOT CAUSE: @km/tui/board-apply was closed prematurely — the effect runner infrastructure was
shipped but the handler migration was abandoned. The bead itself documents "85% still use
imperative ctx.setUI/dispatchBoard directly."

SCOPE: 35 ctx.repo.updateNode/addNode/deleteNode/moveNode calls in board-actions.ts and
board-actions-edit.ts that need to produce BoardEffect values instead of calling repo directly.

APPROACH (incremental, not big-bang):
Phase A: Move validateEffects to Repo level (interim — catch violations at all paths)
Phase B: Migrate content-touching handlers first (handleTitleSave, handleInlineEditConfirm,
         cycleTaskStatus, toggleStatus — the ones that cause title/content bugs)
Phase C: Migrate remaining handlers (indent, outdent, delete, move, create)

Each phase ships independently. Phase A is 30 min. Phase B is the high-value work.
Phase C is mechanical cleanup.

RELATED: @km/tui/board-apply (closed prematurely), @km/tui/normalize-plugins (shipped),
@km/tui/plugin-architecture (parent epic)


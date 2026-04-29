---
id: "@km/tui/tea-deleteConfirm-cutover"
aliases:
  - km-tui.tea-deleteConfirm-cutover
  - km-tui-tea-deleteConfirm-cutover
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:17:35Z
closed_at: 2026-04-21T09:18:13Z
close_reason: >-
  DeleteConfirm TEA cutover landed. Verdict: clean — the dirty-but-resolved
  verdict from SearchDialog still holds at Phase 1 breadth.


  Evidence:

  - 12 reducer unit tests pass (with-delete-confirm.test.ts)

  - 12 parity tests pass on BOTH paths, KM_TEA_DELETE_CONFIRM unset + =1
  (delete-confirm-mini-cutover.spec.ts)

  - Full 114-test plugin suite green

  - 2466 km-tui fast tests pass on flag-off

  - 2466 km-tui fast tests pass on flag-on

  - 0 new lint errors in new files, 0 new typecheck errors (baseline 152)


  Pattern validated at Phase 1 breadth: same 4-file template (plugin + hook +
  bridge + tests) with dual-write integration. DeleteConfirm was simpler than
  SearchDialog:

  - No text input, no focus-scope pushDialogMode, no imperative dialogTargetRef

  - Both open and close paths are reducer-owned (no handler callbacks)

  - Co-location discipline holds vacuously — no unmount race to worry about


  Plugin state: `payload: DeleteConfirmPayload | null` — one slice, two ops
  (show, hide).


  Scope-doc + frictions assessment at `hub/km/tea-phase1-withDialogs-scope.md`.
  No new friction emerged — verdict carries forward.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.tea-deleteConfirm-cutover
    depends_on_id: km-tui.tea-withDialogs
    type: parent-child
    created_at: 2026-04-21T02:17:51Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] TEA cutover — DeleteConfirm (withDialogs Phase 1, easy win) @km/tui #feature #P2

blocks:: [[@km/tui/tea-withDialogs]]

---
id: "@km/tui/tea-help-overlay-v3"
aliases:
  - km-tui.tea-help-overlay-v3
  - km-tui-tea-help-overlay-v3
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:06:40Z
closed_at: 2026-04-28T22:30:36Z
close_reason: >-
  v3 cutover complete — withHelpOverlay() AppPlugin is the unconditional
  production path. v1 (with-help-overlay.ts, 213 LOC), v2 (help-overlay.v2.ts,
  33 LOC), KM_TEA_HELP* feature flags, dual-write code in board-actions, and
  4-way HelpOverlayBridge routing all removed. Net -1036 LOC across plugin +
  test files. Legacy ui.showHelp/helpScrollOffset zustand fields are still
  maintained as a mirror so command-bridge predicates and the escape cascade
  keep working without a wider TEA migration (collapses on
  km-tui.tea-withDialogs).


  Verification: 110/110 plugin tests pass, including 2 termless.
  SILVERY_STRICT=2 110/110 pass. Wider km-tui sweep: 2482/2523 pass (the 3
  unrelated failures — nav-garble-wide, zoom-garble-repro,
  unified-omnibox-integration — are pre-existing, not touched by this change).
  TS errors outside vendor: 3, all unrelated (silvercode session-reducer,
  km-beads migrate test).


  Files: cleanup landed on main as part of d43705dae (commit title
  'docs(cutover): full km bd cutover runbook' bundled my changes during
  cherry-pick). Final improvement (termless test 'scroll keys' replacing flawed
  'idempotent' test) staged on main + on wip/km-tui.tea-help-overlay-v3 in
  worktree.


  Cleanup follow-ups not in scope: definePlugin + useStore in @silvery/create
  are unused in km-tui after this commit but remain in the silvery package
  surface; their removal is a separate vendor/silvery cleanup. The km top-level
  pipe() chain that would let v3 own ui.showHelp directly is tracked by
  km-tui.tea-withDialogs.
started_at: 2026-04-28T22:12:05Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-tui.tea-help-overlay-v3
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T12:06:40Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] HelpOverlay v3 — migrate to withHelpOverlay(app) AppPlugin shape @km/tui #feature #P1 @claude:2405c72e

blocks:: [[@km/silvery/authoring-elegance]]

Migrate HelpOverlay from v1 (300 LOC zustand + bridge + hook) and v2 (33 LOC definePlugin) to v3 (56 code LOC using pipe + with*() + createSlice).

## Pattern

withHelpOverlay: AppPlugin<BaseApp & AppWithApp, BaseApp & AppWithApp & { helpOverlay: Slice }>

Slice owns state (from createSlice); key bindings contributed via existing with-input-chain integration; effects emitted via the base-app drain loop. No factory, no name strings, no per-plugin zustand store.

## Prior art

Spike at /Users/beorn/Code/pim/km/hub/silvery/help-overlay.v3.ts (85 LOC / 56 code LOC). Verify by running the existing v1+v2 parity test bank against v3:
- apps/@km/tui/tests/plugins/with-help-overlay.test.ts
- apps/@km/tui/tests/plugins/help-mini-cutover.spec.ts
- apps/@km/tui/tests/plugins/help-termless.test.ts
- apps/@km/tui/tests/plugins/help-overlay-v2.test.ts

## Feature flag

KM_TEA_HELP_V3=1 enables v3. Default off until parity proven. Once v3 is stable:
- Delete v2 (help-overlay.v2.ts)
- Delete v1 (with-help-overlay.ts)
- Delete definePlugin + useStore in silvery create package
- Delete KM_TEA_HELP / KM_TEA_HELP_V2 flags

## Why v3

See hub/silvery/pipe-with-composition-prototype.md. Pro review + aichat prototype converged on this shape as the right one. Close follow-up for @km/silvery/authoring-elegance: criteria 1, 3, 4 all pass at this LOC; criterion 5 (pipe() ordering type-error) passes via width-typed AppPlugin<Req, Add>.

## Blocks

If v3 succeeds, withDialogs() Phase 1 (@km/tui/tea-withDialogs) adopts the same shape. Estimated ~500 LOC reduction across 5 dialogs (Help, Search, DeleteConfirm, DatePrompt, FilterDialog).
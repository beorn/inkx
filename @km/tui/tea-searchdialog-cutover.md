---
mentions:
  - km
  - claude
id: "@km/tui/tea-searchdialog-cutover"
aliases:
  - km-tui.tea-searchdialog-cutover
  - km-tui-tea-searchdialog-cutover
created_by: claude:8b5b9e1c
created_at: 2026-04-21T07:43:38Z
closed_at: 2026-04-21T08:32:41Z
close_reason: >-
  SearchDialog TEA cutover landed. Verdict: dirty-but-resolved, Phase 1 GO.


  Evidence:

  - 20 reducer unit tests pass (with-search-dialog.test.ts)

  - 23 parity tests pass on BOTH paths, KM_TEA_SEARCH unset + =1
  (search-mini-cutover.spec.ts)

  - 4 termless real-ANSI tests pass (search-termless.test.ts)

  - Full 90-test plugin suite green

  - 2428/2429 km-tui fast tests pass (same 1 pre-existing column-rendering
  failure on both flags; unrelated)

  - 0 new tsc errors (1 pre-existing HelpOverlay test not introduced)


  One friction point surfaced: useSyncExternalStore forces sync React commits

  that drop dialogTargetRef mid-reducer-cycle when plugin.hide is dispatched

  from the reducer. Resolved by co-locating plugin.hide dispatch with the

  setUI it mirrors in handleSearchSelect/handleSearchCancel
  (use-board-dialogs.ts).


  Zero imperative escape hatches introduced. Same 4-file pattern HelpOverlay

  used. Elegance: 417 LOC SearchDialog vs 296 LOC HelpOverlay, entirely in

  the wider bridge wrapper (SearchDialog has 7 props vs 2).


  Phase 1 discipline for withDialogs():

  "Dual-write ops must be co-located with the setUI they mirror, not scheduled

  from the reducer — useSyncExternalStore's sync commits interact badly with

  imperative refs that cleanup on unmount."


  Commits:

  - a04572e6b docs(hub/km): SearchDialog TEA cutover plan + interaction
  inventory

  - e4bb0eb5f feat(km-tui): withSearchDialog plugin — TEA Phase 1 validator

  - 5025cc709 feat(km-tui): wire SearchDialogBridge into WorkspaceChrome

  - 9a3b5c7f3 test(km-tui): SearchDialog termless real-TTY verification

  - 7c134a18e fix(km-tui): SearchDialog cutover ordering — dispatch plugin.hide
  with legacy setUI

  - 17a9a7b1f docs(hub/km): SearchDialog cutover verdict — dirty-but-resolved,
  Phase 1 GO
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.tea-searchdialog-cutover
    depends_on_id: km-tui.tea
    type: parent-child
    created_at: 2026-04-21T00:43:38Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui.tea
---

# [x] TEA cutover — SearchDialog (the real Phase 1 validator) @km/tui #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/tui/tea]]

Per dual-pro review 3 (2026-04-21): HelpOverlay mini-cutover validated the reducer+store+bridge pattern on the easiest possible dialog. SearchDialog is the next test — the one that has text input + focus scope + Enter grace period + dispatch-from-input. If SearchDialog ports cleanly with the current pattern, Phase 1 withDialogs() can commit. If it fights the framework, redesign the substrate before 7-phase migration.

## The hard interactions SearchDialog exercises

1. Text input consuming printable keys (previous spikes did this in vacuum; now with Ink reconciler)
2. Focus scope push/pop composing with dialog-guard.ts stack
3. Enter grace period (dialog confirm vs command dispatch)
4. useInput handlers that must dispatch+close atomically (Friction 1 from spike)
5. Escape returns focus to previous scope
6. Search results rendered reactively from plugin state
7. Cross-slice updates: dialog state + board cursor on confirm

## Protocol

1. Read HelpOverlay cutover (hub/km/tea-mini-cutover-help-overlay.md) as baseline pattern
2. Find SearchDialog source (grep apps/@km/tui/src/views/SearchDialog*)
3. Design withSearchDialog() plugin mirroring HelpOverlay's shape BUT extending for:
  - Text input state (query, caret)
  - Async search result lifecycle
  - Focus scope participation
4. Port incrementally, behind KM_TEA_SEARCH=1 feature flag
5. Parity tests: every old behavior passes against both paths
6. Termless real-TTY verification

## Falsifiable outcome

SearchDialog requires IMPERATIVE ESCAPE HATCHES (global refs, wrapper-ordering hacks, dispatch-from-useInput workarounds) → STOP. Architecture not ready. Redesign foundation before proceeding.

SearchDialog lands with same 4-file pattern as HelpOverlay → confidence for Phase 1.

SearchDialog lands with a SIMPLER pattern than HelpOverlay (fewer files, cleaner types) → the simplification becomes the @km/silvery/authoring-elegance proof point.

## Acceptance

1. All existing SearchDialog behavior preserved (parity tests)
2. New plugin path green against real TTY (mcp__tty)
3. Honest verdict in hub/km/tea-searchdialog-cutover.md documenting: clean / dirty / fought-framework
4. If dirty/fought: diagnose which specific interactions broke; file sub-beads

## Scope guardrails

- DO NOT over-engineer. The goal is honest discovery of where the current pattern breaks.
- DO NOT skip TTY verification — unit tests won't surface focus/ink integration bugs.
- DO NOT delete old SearchDialog during port; feature-flag the new.
- Time-box: 2 days. If stuck after 1 day, document blocker and tap out.


---
id: "@km/tui/tea-phase-0-mini-cutover"
aliases:
  - km-tui.tea-phase-0-mini-cutover
  - km-tui-tea-phase-0-mini-cutover
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:58:06Z
closed_at: 2026-04-21T07:10:08Z
close_reason: >-
  Phase 0 mini-cutover shipped. Target: HelpOverlay (simplest km dialog — 4 ops,
  no text input, no domain coupling).


  Evidence:

  - 43 new tests: 24 reducer unit + 16 parity (× 2 paths) + 3 termless (real
  ANSI)

  - Zero regressions: 2379 km-tui fast tests pass

  - Zero new TS errors

  - KM_TEA_HELP=1 spot check: 53 tests pass with flag on

  - Evidence doc: hub/km/tea-mini-cutover-help-overlay.md


  Shipped artifacts:

  - plugins/with-help-overlay.ts — pure apply() reducer + closure-scoped store

  - plugins/use-help-overlay.ts — React useSyncExternalStore bridge

  - plugins/HelpOverlayBridge.tsx — feature-flagged render adapter

  - board-actions.ts dual-writes to plugin when flag on

  - WorkspaceChrome.tsx renders via bridge


  Dual-write migration strategy works cleanly: legacy path always updated,
  plugin path additively dispatched under flag, render switches via bridge. Zero
  behavior drift during migration window.


  Recommendation: Phase 1 (withDialogs) GO. Pattern, testing hierarchy, and
  feature-flag strategy carry over. Phase 1 adds: FocusScope push/pop, dialog
  grace period, dialog-target ref wiring, pipe() composition.


  Commits: 5e388922a, 246663d69, 65837425f.
---

# [x] Mini-cutover: withHelpOverlay plugin — TEA apply-chain on one real km dialog @km/tui #task #P1 @claude:8b5b9e1c

blocks:: [[@km/tui/tea]]

Phase 0 mini-cutover per K2.6 § 6 (pro review 2). Targets HelpOverlay — the simplest km dialog (no text input, no domain coupling, 4 ops). Validates the TEA plugin pattern against km's real zustand store + commands + keybindings before Phase 1 (withDialogs) commits. 

**Protocol:** feature-branched plugin + feature-flag gated + parity tests + real TTY verification. Time-boxed to 1 day. Report-back driven.

**Target ops:** SHOW_HELP, HIDE_HELP, HELP_SCROLL_UP, HELP_SCROLL_DOWN
**Keybinding:** ? (shift-/)
**Scope:** zero — no sel.*, no repo, no dialog-guard.
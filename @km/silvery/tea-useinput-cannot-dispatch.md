---
id: "@km/silvery/tea-useinput-cannot-dispatch"
aliases:
  - km-silvery.tea-useinput-cannot-dispatch
  - km-silvery-tea-useinput-cannot-dispatch
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:21:27Z
closed_at: 2026-04-21T06:47:00Z
close_reason: Preflight complete. Audit + docs + CI guard landed in 036aeda46.
  Zero real useInput call sites in km-tui/commands. Zero silvery-TEA
  app.dispatch call sites (dispatchBoard is zustand layer, not TEA — no
  reentrancy guard applies). Added docs/lessons/input-architecture.md § 'React
  hooks never call app.dispatch()', anti-pattern bullet in
  apps/km-tui/CLAUDE.md, grep-based CI guard in
  packages/km-infra/scripts/check-test-patterns.sh (baseline 0, verified against
  synthetic fixture). Phase 1 unblocked on this concern. Full evidence in commit
  message + detailed audit in session output.
---

# [x] useInput handlers cannot emit effects or dispatch — must use keybinding plugin pattern @km/silvery #task #P1

blocks:: [[@km/silvery/tea]]

Discovered by the 2026-04-21 TEA board-nav spike. The shipped with-input-chain.ts has handler signature (input, key) => void | 'exit'. Calling app.dispatch(...) inside a handler throws 'Reentrant dispatch'. Idiomatic pattern is a keybinding plugin that returns [{ type: 'dispatch', op }] and lets the drain queue handle re-entry.\n\nHard constraint for km migration: every direct dispatch() from a useInput handler must migrate to a keybinding plugin OR to effects. Audit @km/tui for such sites before Phase 1.\n\nContext: hub/silvery/experiments/tea-nav-spike/README.md + hub/silvery/tea-review-responses.md
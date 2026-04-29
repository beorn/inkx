---
id: "@km/silvery/feedback-trace-v31-integration"
aliases:
  - km-silvery.feedback-trace-v31-integration
  - km-silvery-feedback-trace-v31-integration
created_by: claude:cc081a9a
created_at: 2026-04-27T14:50:44Z
closed_at: 2026-04-27T18:15:30Z
close_reason: "Resolved: v3.1 (logPass rename + per-cause sub-namespaces)
  integrated into silvery main during Round 4 (silvery commit 5e0dc86c, km
  commit 906fd817a). Acceptance: git grep recordPassCause origin/main → 0 hits;
  git grep logPass → 21 sites."
---

# [x] Integrate v3.1 (logPass rename + per-cause sub-namespaces) into silvery main @km/silvery #task #P2

blocks:: [[@km/all/plateau-90]]

v3.1 of pass-cause instrumentation (silvery e0fc140c) was developed in /Users/beorn/Code/pim/@km/_orphan/feedback-trace worktree but not integrated into silvery main during the plateau-90 Round 3 cycle. Pushed to origin/feat/feedback-trace 2026-04-27.

What's missing on origin/main vs v3.1:
- recordPassCause not renamed to logPass (9 call sites: renderer.ts, layout-phase.ts, measure-phase.ts, runtime/{renderer,create-app}.tsx, index.ts re-export)
- Per-cause sub-namespaces (silvery:passes:layout-invalidate etc.) not wired
- tools/aggregate-pass-histogram.ts + hub/silvery/design/pass-cause-histogram.md not updated to v3.1 reproducer

What IS on origin/main (via bounded-convergence's branch ancestry):
- v3 loggily core (createLogger silvery:passes + passLog.debug + PassCauseAggregator)
- Type audit (14 → 6 categories, including v3.1's 3 trims absorbed by C3b's audit)

Why this needs care:
- v3.1 is based on v3 (32335883). C3b is also based on v3. They are siblings, not linear.
- Conflicts likely on pass-cause.ts (both modified type definition), index.ts (both modified exports), renderer.ts (both touched).
- Resolution is mechanical (rename collision: pick logPass) but not zero-effort.

Acceptance:
- silvery main HEAD has logPass (not recordPassCause) at all call sites
- grep recordPassCause origin/main → 0 hits
- silvery:passes:* sub-namespaces wired
- STRICT pass count >= 11624 (round 3 baseline)
- km submodule bumped + pushed
- Bead @km/silvery/feedback-trace-loggily acceptance criterion 'grep recordPassCause → 0' actually verified on origin/main

Effort: ~30-45 min (one merge cycle with conflict resolution + STRICT verification)
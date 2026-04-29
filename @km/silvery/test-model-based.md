---
id: "@km/silvery/test-model-based"
aliases:
  - km-silvery.test-model-based
  - km-silvery-test-model-based
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:59Z
closed_at: 2026-03-13T05:22:37Z
close_reason: "Deferred: Model-based state machine fuzzing requires a formal
  model of the pipeline state machine. Substantial test infrastructure. Current
  property-invariant fuzz tests provide good coverage."
owner: bjorn@stabell.org
---

# [x] Testing gap: model-based long-session state-machine fuzzing @km/silvery #task #P2

Current tests are mostly render→action→compare. Missing: hundreds/thousands of mixed actions (keypress + resize + stdout write + suspend/unhide + theme swap + viewport change + cursor show/hide) in one session with incremental and ANSI verification. Found by GPT 5.4 pro.
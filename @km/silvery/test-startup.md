---
id: "@km/silvery/test-startup"
aliases:
  - km-silvery.test-startup
  - km-silvery-test-startup
created_by: claude:c9beade3
created_at: 2026-03-13T04:37:06Z
closed_at: 2026-03-13T05:22:38Z
close_reason: "Deferred: Startup/first-N-frames differential testing. First
  frame is already tested implicitly (every test starts with a first render).
  STRICT checks verify first render correctness."
---

# [x] Testing gap: startup/first-N-frames differential testing @km/silvery #task #P2

Many shipped bugs live in first render, first resize, first focus. Need dedicated startup scenarios: cold start empty terminal, cold start with scrollback, startup + immediate resize, startup + suspense fallback. Compare buffer AND terminal emulator state. Found by GPT 5.4 pro.
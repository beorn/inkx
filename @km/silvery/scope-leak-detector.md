---
id: "@km/silvery/scope-leak-detector"
aliases:
  - km-silvery.scope-leak-detector
  - km-silvery-scope-leak-detector
created_by: claude:2aefb4b6
created_at: 2026-04-24T22:35:16Z
closed_at: 2026-04-24T22:41:46Z
close_reason: "Shipped: check-no-raw-lifecycle.sh in km 1f317889a
  (baseline-guard lint, wired into test:ci) + SILVERY_SCOPE_TRACE leak detector
  in silvery 2b0880ef (40 tests pass). Together they close the front and back
  gates per /big plateau analysis."
---

# [x] Dev-mode scope leak detector — runtime accounting at process exit @km/silvery #task #P1

blocks:: [[@km/silvery]]

Backstop for the ESLint rule. Attach a debug-only tracker to disposable() and Scope: every Disposable created gets a tag (creation site, scope name). At process exit, log any unfinalized Disposables. Gated by SILVERY_SCOPE_TRACE=1 (zero overhead in production). Solves: catches resources that ESLint can't see (dynamic call sites, untyped JS, third-party paths), and catches scope-of-disposal bugs (was registered, wasn't actually disposed). Per /big plateau analysis: enforcement (ESLint) closes the front gate; this closes the back. Together they make backsliding impossible.
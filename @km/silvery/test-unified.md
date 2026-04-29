---
id: "@km/silvery/test-unified"
aliases:
  - km-silvery.test-unified
  - km-silvery-test-unified
created_by: Bjørn Stabell
created_at: 2026-04-09T06:36:54Z
closed_at: 2026-04-09T07:33:48Z
close_reason: Wired RunHandle.root + buffer into termless backend createTestApp.
  21/21 tests pass with locators on termless. Commit 95b473a62.
---

# [x] Unified test backend — expose AgNode tree through RunHandle @km/silvery #feature #P2 @Bjørn Stabell

Two test backends exist, each with half the features: headless has AgNode tree (locators work) but no terminal (skips output phase); termless has terminal (full pipeline) but no tree access (no locators). No single backend has both.

Fix: expose handle.root on RunHandle (one-line change in run.tsx). The reconciler root is already there internally. Then createAutoLocator(handle.root) gives locators over the live tree while the terminal exercises the full pipeline. Terminal backend is pluggable (xterm, vterm, ghostty).

Result: one createTestApp() backend with locators + screen assertions + full pipeline. No two-backend split.

Steps: (1) run.tsx: expose root on RunHandle, (2) @silvery/test: createTestHandle(handle, term) convenience, (3) km: update createTestApp termless backend to use handle.root for locators, (4) verify all 21 tests pass with unified backend.

/complete: handle.root exists on RunHandle
/complete: locators work on termless backend
/complete: all 21 exploration tests pass with unified backend
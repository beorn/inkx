---
mentions:
  - km
id: "@km/silvery/lifecycle-leak-detection-fossil"
aliases:
  - km-silvery.lifecycle-leak-detection-fossil
  - km-silvery-lifecycle-leak-detection-fossil
created_by: claude:cc081a9a
created_at: 2026-04-27T14:51:22Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.lifecycle-leak-detection-fossil
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-27T07:51:46Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Delete L0 memory-leak workarounds (Bun.gc + warmup + 600KB threshold) — fossils after C1 Phase 2 @km/silvery #task #P2

blocks:: [[@km/silvery]]

C1 (scope-resource-ownership) Phase 1+2 shipped. Phase 1 finding: NO real silvery resources had leaks; the workarounds in vendor/silvery/tests/memory/memory.test.tsx (Bun.gc(true) + warmup iterations + 600KB/iter threshold) are fossils — they were L0 attempts at memory-leak detection that hide rather than prevent leaks.

Per the L0-L5 quality rubric (hub/quality-rubric.md), C1 currently sits at L4 for the structural ownership story but stays at L0 for the workaround-fossil dimension. To reach L5, the workarounds need deletion AND a property/fuzz test must cover the leak class so a regression that re-introduces them would fail CI.

Specific deletions needed:

- vendor/silvery/tests/memory/memory.test.tsx — Bun.gc(true) call (workaround for globalThis.gc undefined under Bun)
- Same file — warmup iterations (workaround for GC nondeterminism)
- Same file — 300→600 KB/iter threshold (absorbs noise)

Replacement plan:

- Use SILVERY_SCOPE_TRACE accounting (already shipped in C1 Phase 2) instead of GC observation. Scope tells us deterministically what wasn't released — no GC needed.
- Property test: spawn N runtimes, dispose all, assert SILVERY_SCOPE_TRACE shows zero outstanding handles. Deterministic, no thresholds.
- Fuzz test: random create/dispose order across multiple runtime + tick + input-owner instances; assert per-scope handle count returns to 0 after disposal.

Acceptance:

- grep 'Bun.gc\|warmup\|MAX_LEAK_KB' vendor/silvery/tests/memory/ → 0 hits
- New property test using SILVERY_SCOPE_TRACE — verifies no outstanding handles after teardown
- New fuzz test — random create/dispose orderings, all converge to 0 handles
- C1 reaches L5 for the lifecycle dimension

Effort: ~1-2h (mechanical replacement of GC observation with scope accounting)


---
id: "@km/silvery/lifecycle-leak-detection"
aliases:
  - km-silvery.lifecycle-leak-detection
  - km-silvery-lifecycle-leak-detection
created_by: claude:cc081a9a
created_at: 2026-04-27T05:45:07Z
closed_at: 2026-04-27T18:15:51Z
close_reason: "Resolved: C1 reached L5. Counter shipped (getActiveHandleCount,
  silvery 725ea161); fossil deletion swept across all 3 memory test files via
  km-silvery.c1-fossil-sweep-broader (silvery commit f59384c4). Acceptance
  verified: git grep -E 'Bun.gc|globalThis.gc|warmup|MAX_LEAK_KB' origin/main --
  tests/memory/ → 0 hits."
---

# [x] Replace Bun.gc workarounds with Scope-based handle accounting @km/silvery #feature #P1

blocks:: [[@km/silvery/structural-hardening]]

Memory tests stack 3 workarounds: Bun.gc(true) (because globalThis.gc is undefined), warmup iterations (GC nondeterminism), threshold 300→600 KB/iter (slack for noise). Plateau requires deterministic leak detection that doesn't depend on GC.

Approach: leverage existing Scope (AsyncDisposableStack + AbortSignal cascade) to count outstanding handles at scope close. Test asserts handle count returns to baseline, not memory bytes.

Files in scope:
- vendor/silvery/tests/memory/memory.test.tsx
- vendor/silvery/tests/perf/termless-memleak-harness.test.tsx
- hub/silvery/design/lifecycle-scope.md (extend with handle-counting protocol)

/complete:
- grep 'Bun.gc' vendor/silvery/tests/ → 0 hits
- grep 'globalThis.gc' vendor/silvery/tests/ → 0 hits
- threshold/iter constants removed in favor of strict equality on handle count
- SILVERY_SCOPE_TRACE diagnostic prints handle delta at scope close


## Quality rubric (hub/quality-rubric.md)
Current level: L0 — three stacked workarounds (Bun.gc(true), warmup iterations, 600 KB/iter threshold) muting symptoms.
Target level: L3 — handle-accounting via Scope makes leak detection reliable without GC dependency. Per failure-taxonomy (G1), lifecycle ownership is not a dominant production-code seam (0/14), so L3 (API structure) is right-sized; pushing to L4 would be over-engineering for a class of bug not surfacing in failures.

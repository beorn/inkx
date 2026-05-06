---
mentions:
  - km
id: "@km/silvery/c1-fossil-sweep-broader"
aliases:
  - km-silvery.c1-fossil-sweep-broader
  - km-silvery-c1-fossil-sweep-broader
created_by: claude:cc081a9a
created_at: 2026-04-27T17:16:40Z
closed_at: 2026-04-27T17:46:31Z
close_reason: "Shipped 2026-04-27 — silvery main f59384c4, km main bdfae3f5b.
  Acceptance verified: rg 'Bun\\.gc|globalThis\\.gc|warmup|MAX_LEAK_KB'
  tests/memory/ → 0 hits. 13884 tests pass with SILVERY_STRICT=1. C1 recast L4.5
  → L5."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.c1-fossil-sweep-broader
    depends_on_id: km-all.plateau-90
    type: parent-child
    created_at: 2026-04-27T11:00:54Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.plateau-90
---

# [x] C1 fossil sweep: extend Bun.gc deletion to heap-snapshot.slow.test.tsx + production-paths.test.tsx @km/silvery #task #P2

blocks:: [[@km/all/plateau-90]]

C1 agent (commit silvery 725ea161 / km f79842ade) deleted Bun.gc/warmup/globalThis.gc workarounds from vendor/silvery/tests/memory/memory.test.tsx and replaced with deterministic getActiveHandleCount-based property tests. Bead @km/silvery/lifecycle-leak-detection-fossil acceptance was scoped to memory.test.tsx only.

But the L0 anti-pattern lives in 2 more files (verified at silvery origin/main 2a6f087d after Round 5):

1. tests/memory/heap-snapshot.slow.test.tsx — 6 fossil hits (globalThis.gc fallback path, Bun.gc references in comments)
2. tests/memory/production-paths.test.tsx — 7 fossil hits (globalThis.gc, warmup() function, getHeapUsedMB GC settling)

Total: 13 hits at origin/main. C1 is L4.5 (counter shipped, 1 of 3 fossil files cleaned), not L5 (all fossils deleted + property/fuzz coverage).

This is the canonical /complete catch the substrate-phasing-convention bead (@km/all/substrate-phasing-convention) is filed to prevent: agent did exactly what bead asked; bead scope was wrong.

## Approach

Same pattern as C1 agent:

1. Read both files; understand what each test actually verifies
2. Replace GC observation (Bun.gc, globalThis.gc, warmup, getHeapUsedMB) with getActiveHandleCount-based assertions
3. Some tests may verify React-mount/unmount paths or production scenarios — these need careful refactoring, not just deletion. Determine if the test is doing something legitimate (e.g., measuring real heap behavior across fixture cycles) or just a fossilized GC ritual
4. For tests that genuinely need heap measurement (rare): consider if they should move out of tests/memory/ or be marked .slow + skipped by default
5. Worktree-isolate per HARD RULE
6. Commit AND push to origin (per new CRITICAL block in /max skill)
7. New km submodule bump

## Acceptance

- grep -E 'Bun\.gc|globalThis\.gc|warmup|MAX_LEAK_KB' origin/main -- 'vendor/silvery/tests/memory/' returns 0 hits (down from 13)
- All 3 files in tests/memory/ use getActiveHandleCount, not GC observation
- STRICT >= 12298 (Round 5 baseline)
- 0 net new tsc errors
- C1 reaches L5 (workaround code deleted across all sites + property/fuzz tests cover regression)

## Effort

~1-2 hours. Smaller than initial C1 because pattern is established (handle counter + fuzz harness exist; just apply same approach to 2 more files).


---
mentions:
  - km
  - Bjørn
id: "@km/silvery/dorender-overhead"
aliases:
  - km-silvery.dorender-overhead
  - km-silvery-dorender-overhead
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:36Z
closed_at: 2026-04-09T15:54:42Z
close_reason: Hoisted feature flags to module-level constants. Commit 445a256a.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Strip doRender per-frame feature-detection overhead @km/silvery #task #P0 @Bjørn Stabell

Straight win. doRender has ~10 feature-detection branches that run every frame even when env vars are unset.

## Impact

- Removes per-frame overhead that affects ALL scenarios (not just benches)
- Benefits production performance, not just synthetic numbers

## Root cause

vendor/silvery/packages/create/src/create-app.tsx:1304 doRender function has:

- _ansiTrace branch (process.env?.SILVERY_TRACE === "1")
- _noIncremental branch
- __silvery_content_all reset
- _cellDebugVal check
- rootHasDirty probe
- __silvery_bench_phases probe
- wasIncremental check
- STRICT mode paths
- DEBUG paths
- ~10 total conditional branches

All these run even when all env vars are unset — they evaluate to false but the branch check still happens.

## Fix

Hoist all bench/STRICT/instrumentation flags into a single module-level const at load time:

```typescript
const _INSTRUMENTATION_ENABLED =
  !!(process.env?.SILVERY_STRICT ||
    process.env?.SILVERY_TRACE ||
    process.env?.SILVERY_INSTRUMENT ||
    process.env?.DEBUG?.includes("silvery"))
```

Then guard all the overhead behind `if (_INSTRUMENTATION_ENABLED)` — the JS engine will constant-fold this when the flag is false.

## Effort

~2-4 hours. Read the doRender function, identify all the conditional branches, hoist into a single flag.

## Verification

- Bench with current code: baseline numbers
- Apply fix
- Bench again: all scenarios should be slightly faster
- Expected: 5-10% improvement across the board (small but free)


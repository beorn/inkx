---
aliases:
  - km-silvercode.queue-option-b-test-pollution
  - km-silvercode-queue-option-b-test-pollution
created_at: 2026-05-07T06:48:32.685Z
---

# queue-option-b scenario 7 fails when run with queue-ux (test-pollution) #bug #P3

**Symptom**: `apps/silvercode/tests/visual/queue-option-b.test.tsx` "scenario 7" PASSES in isolation but FAILS when both `queue-ux.test.tsx` and `queue-option-b.test.tsx` run in the same vitest invocation.

**Reported by**: silvery agent in completion notes for `@km/silvery/incremental-bg-residue-shrink-move`.

**Pre-existing**: not caused by the silvery bg-residue fix.

**Suspected cause**: leaked state between test files — likely:
- Module-scoped state in render-harness or createRenderer (signals/observers/Term registry)
- Shared HOME / XDG_CACHE_HOME pollution between the two harness instances
- vitest worker reuse — second file inherits state from first

**Investigation steps**:
1. Reproduce: `bun vitest run apps/silvercode/tests/visual/queue-ux.test.tsx apps/silvercode/tests/visual/queue-option-b.test.tsx` (should fail)
2. Run alone: `bun vitest run apps/silvercode/tests/visual/queue-option-b.test.tsx` (passes)
3. Identify what scenario 7 expects vs what it sees
4. Check render-harness.tsx for module-scoped state that might leak
5. Check if installFakes/dispose pair is symmetric

**Files**:
- `apps/silvercode/tests/visual/queue-option-b.test.tsx` (scenario 7)
- `apps/silvercode/tests/visual/queue-ux.test.tsx`
- `apps/silvercode/src/test/render-harness.tsx`
- `apps/silvercode/src/test/fake-boundaries.ts`

**Note**: this bug is silent — both files passing alone gives false confidence. Same shape as the silent-fail-canary class (memory entry: feedback-silent-fail-canaries.md).

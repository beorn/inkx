---
aliases:
  - km-silvercode.test-worker-timeout-oom
  - km-silvercode-test-worker-timeout-oom
created_at: 2026-05-07T06:48:23.187Z
---

# silvercode test workers crash with OOM/timeout (welcome-features etc) #bug #P2

**Symptom**: 4 silvercode test files time out with worker exit during `bun run test:fast`:
- `apps/silvercode/tests/welcome-features.test.tsx` (~444s, 19 tests, worker exits unexpectedly)
- `apps/silvercode/tests/welcome-pane-hidden.test.tsx`
- `apps/silvercode/tests/content-layout.test.tsx`
- `apps/silvercode/tests/notification-welcome-artifact.test.tsx`

Vitest pool error: "Timeout terminating forks worker for test files [...]". Worker exits unexpectedly = OOM or infinite loop in test process.

**Pre-existing**: confirmed by silvery agent's ablation — same timeout occurs with case-2 fix removed (vendor/silvery reverted to 27cb6dc6). Not caused by `@km/silvery/incremental-bg-residue-shrink-move`.

**Suspected causes**:
1. **Render-loop infinite recursion** under specific test fixtures (autoRender:true triggers cascade that doesn't converge in 2 passes)
2. **Memory leak** in render-harness — if dispose() doesn't clean up, 19 tests in one file each leak ~50MB → 950MB → OOM
3. **Test fixture interaction** — maybe one specific test in welcome-features triggers a unbounded subscription/event loop

**Investigation steps**:
1. Run each test file ALONE with `--testTimeout 60000` and `--max-workers 1` to see if any individual test hangs
2. If a single test hangs, isolate it: `-t "specific test name"` to find the smallest reproducer
3. Add `console.log` to render-harness `settle()` to see if it's looping
4. Check process memory growth: `top -pid <vitest-worker-pid>` while test runs
5. Try with `SILVERY_STRICT=0` to rule out STRICT-mode infinite loops

**Related**:
- `@km/silvery/test-harness-via-run-not-createrenderer` — proposed reframe to collapse createRenderer into run() against headless Term. If we go there, this test class might dissolve.
- `@km/silvercode/fakes-by-factory-not-literal` — fakeStore drift was the FIRST issue; might be more lurking.

**Files**:
- `apps/silvercode/tests/welcome-features.test.tsx`
- `apps/silvercode/tests/welcome-pane-hidden.test.tsx`
- `apps/silvercode/tests/content-layout.test.tsx`
- `apps/silvercode/tests/notification-welcome-artifact.test.tsx`
- `apps/silvercode/src/test/render-harness.tsx` (suspect — owns the loop)

**Workaround** (current): tests are skipped at the file level via timeout, not via .skip. They appear as "1 error" in vitest output but don't block CI gates that use `test:fast` if those gates ignore timeouts. Need to verify CI behavior.

---
mentions:
  - km
  - claude
id: "@km/inbox/vitestx-chaos"
aliases:
  - km-vitestx-chaos
  - "@km/_orphan/vitestx-chaos"
created_at: 2026-02-03T11:51:38Z
closed_at: 2026-02-03T12:43:35Z
assignee: claude:4731ed4e
---

# [x] Rebase chaos testing on vitestx gen/take primitives @km/_orphan #task #P3 @claude:4731ed4e

The sync chaos testing system (watcher-chaos, chaos-testing.md) has its own runner, seed management, and scenario infrastructure. vitestx now provides equivalent primitives (gen/take/test.fuzz) with auto-shrinking and regression case management.

## Recommended Architecture (from O3 deep research)

**Approach 1 (Generator-Driven Chaos)** — replace ChaosWatcher's push model with gen/take's pull model:

1. Refactor chaos scenario logic into reusable functions: expandEditToAtomic(event)→Event[], introduceDelay(event), etc.
2. Build a chaosEventGenerator(fs, scenarios) async generator that:
  - Maintains file state (Set of current files)
  - Picks random operations (create/modify/delete/rename)
  - Applies chaos transforms inline (EDITOR_ATOMIC→yield 2 events, QUEUE_OVERFLOW→skip 20%, SLOW_DISK→await delay, REORDER→buffer+shuffle)
  - Performs actual FS operations on FakeFileSystem for ground truth
3. Use test.fuzz + take(chaosEventGenerator, eventCount) for auto-shrinking + regression

Example sketch:
  test.fuzz('sync survives chaos', async () => {
    const fs = new FakeFileSystem()
    fs.createRandomFiles(fileCount)
    await initialSync(fs)

```
const events = gen(async (ctx) => generateChaosEvent(ctx, scenarios, fs))
for await (const event of take(events, eventCount)) {
  sync.handleFilesystemEvent(event)
}

await waitForQuiescence()
checkInvariants(fs, database)  // all 8 invariants
```

})

**Key decisions:**

- Event expansion: generator yields multiple low-level events for one logical op (EDITOR_ATOMIC: yield unlink, yield add)
- Timing: use virtual clock or configurable delays (20-50ms instead of 2-5s for speed)
- Two-level generation: scenario mix chosen at test start, captured in seed for reproduction
- Push/pull: eliminated by direct sync.handleFilesystemEvent() calls in pull loop

**Shrinking strategy (choose one):**

- **Post-transform shrinking** (simpler): take() records events after all chaos transforms. Shrinking removes final events directly. May break atomic pairs (e.g., remove just the unlink half of an EDITOR_ATOMIC pair) — but if the test still fails with a broken pair, that reveals a real bug. Replay yields from saved sequence, bypassing gen() and all chaos wrappers.
- **Pre-transform shrinking** (preserves transform semantics): generate base events with per-event chaos metadata (sort keys for reorder, drop flags for overflow, split flags for atomic), then apply a pure deterministic transform. Shrinking operates on the pre-transform inputs and re-applies the transform, so atomic pairs stay intact. More complex to implement but integrates chaos into the generation layer rather than the generator behavior. Aligns with Hypothesis's principle that shrinking mapped data should shrink the input and re-apply the mapping.

**Fixture shrinking:** Generate the initial file hierarchy as part of the fuzz input (not fixed), so the shrinker can reduce it alongside the event sequence. If a bug only needs 1 file, the shrinker eliminates the other 49. Can be as simple as `take(genInitialFile, fileCount)` before the event loop.

**vs Approach 2 (Hybrid — drive ChaosWatcher with gen):**

- Keeps ChaosWatcher but feeds it from gen/take
- Pro: reuses existing scenario code
- Con: push/pull mismatch remains, shrinking can't reduce chaos parameters, two paradigms interacting

**Prerequisite:** Verify gen/take can handle async event generation and that FakeFileSystem operations are fast enough for the pull loop.

Benefits: Unified seed/shrink/regression infrastructure, less custom code, same vitest runner. Model-based property testing pattern (fast-check style commands).


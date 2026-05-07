---
aliases:
  - km-silvercode.fakes-by-factory-not-literal
  - km-silvercode-fakes-by-factory-not-literal
created_at: 2026-05-07T05:32:26.600Z
---

# Test fakes by factory, not literal — eliminate missing-slot TypeErrors #P3

**Reframe** (from /big session 2026-05-06): the fakeStore missing `events.get/subscribe` and producing `TypeError: undefined is not an object (evaluating 'store.events.get')` is the recurring shape — hand-rolled fake objects shaped as structural literals diverge silently from real production constructors.

**The real problem**: tests construct fakes as inline literals (`{ state: { get: ... } }`), missing whatever slots the consumer uses but the test author didn't anticipate. Type system doesn't catch it because the fake is upcast to the consumer's narrow expected type at call site.

**Target design (L3-L4)**: every fake has a factory that mirrors the real production constructor.

```ts
// Today (fragile):
const fakeStore = { state: { get: () => ({}), subscribe: () => () => {} } }
//                                                            ^^^ missing `events`

// Target:
const fakeStore = createFakeSilvercodeStore() // mirrors createSilvercodeStore shape
const fakeStore = createFakeSilvercodeStore({ events: customEventsImpl }) // override slots
```

The factory:
1. Constructs the same shape as the real factory.
2. Accepts a partial override object for slots the test wants to control.
3. Defaults all unspecified slots to no-op implementations that won't throw on access.

**Coverage gap from existing infra**: factory pattern doesn't exist for silvercode test fakes today. fake-session.ts has createFakeSession but it's bespoke; fake-boundaries.ts installFakes does similar; many tests still hand-roll literal stubs.

**Apply to**:
- silvercode store (events + state)
- silvercode controller
- accountly fake (existing fake-boundaries.ts is closer to right shape)
- agent-harness session fakes

**Effort**: medium. Per-fake factory landings; per-test adoption is incremental (tests that already use installFakes are 80% there). 30-50 file touches.

**Related**: @km/silvery/test-harness-via-run-not-createrenderer (P2) — collapsing createRenderer into run() reduces but doesn't eliminate the fakes problem; this bead is the orthogonal complement.

**First step**: factory the silvercode store first — that's the one that bit us this round. Pattern after how createTermless / createTerm handle "real shape with controllable I/O."

## Dual-mode drift detection (fake AND real, gated)

This pattern already exists in silvery, just not for fakes:
- `SILVERY_STRICT_TERMINAL=all` — runs vt100 + xterm + ghostty in parallel, asserts identical output. Drift gate at the terminal-emulator boundary.
- `SILVERY_STRICT=incremental` — runs incremental + fresh on every render, asserts equal. Drift gate at the pipeline boundary.

Apply the same pattern at the fake/real boundary. Two modes per test:

- **Shallow** (today, fast): fake store + fake controller + fake projection. Runs in CI on every commit. ~50ms/test.
- **Deep** (drift gate, periodic): real store + real controller + real projection, **fake at the ACP wire** (the lowest reasonable cut — `apps/silvercode/packages/agent-harness/src/testing/fake-acp-server.ts` already exists for this). Runs nightly or on `STRICT_FAKES=1`. ~500ms/test.

Test infrastructure parametrizes over `boundary: "shallow" | "deep"`. Identical app.text + state-shape after N actions = no drift. Mismatch fails CI and names the offending fake slot.

**Why "real" still needs *some* fake**: you can't spawn the real Claude ACP subprocess in 700 tests (network, auth, cost). The fake/real boundary just moves down. The dual-mode contract is: "everything above the chosen boundary runs as in production; the boundary itself swaps."

**Effort delta from base bead**: small — the fake-acp-server already exists; what's missing is the test-runner harness that runs each test twice with the boundary at different positions and diffs the outcomes. Matches the existing `SILVERY_STRICT_TERMINAL=all` plumbing.

**Tracking dependency**: this bead's deep mode requires real-store factory work; ship factory first (Phase 1), then deep mode (Phase 2).

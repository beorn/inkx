# Quality Rubric — L0 to L5

A 6-level scale for classifying how well a fix prevents a class of bugs from recurring. Replaces "plateau distance %" pseudo-precision (e.g., "this is 65% to plateau") with a verifiable per-bead rubric.

## Why this exists

When the same area keeps breaking, "we're 60% to a real fix" drifts to vibe. Two people will assign different percentages to the same fix. The rubric is verifiable: either the workaround code still exists or it doesn't; either the invariant is asserted or it isn't; either the type system can express the invalid state or it can't.

Use the rubric in `/big` Phase 7 ("Final Synthesis") to classify the current state of a problem and the target state, e.g., "current L1 → target L4 (architecture makes the bad state unrepresentable)".

## The levels

### L0 — Workaround / threshold / env tweak

A symptom-suppressing knob. The bug class is unaddressed; the failure mode is muted by tuning a number, raising a timeout, or pinning an env var.

**km/silvery example**: `vendor/silvery/tests/memory/memory.test.tsx` stacked three workarounds for memory-leak detection: `Bun.gc(true)` (because `globalThis.gc` is undefined under Bun), warmup iterations (to dampen GC nondeterminism), and a 300→600 KB/iter threshold (to absorb noise). All three knobs hide leaks instead of preventing them. Tracked in `km-silvery.lifecycle-leak-detection`.

### L1 — Runtime guard catches it

A defensive check at the call site detects the bad state and short-circuits. The bug can still occur, but a guard intercepts it before user-visible damage. Often the first real fix after L0.

**km/silvery example**: `silvery 168b4989` — `clearExcessArea must not fire when hasPrevBuffer=false`. An absolute-positioned child shrinking in place was stomping freshly-painted sibling pixels because `clearExcessArea` ran unconditionally on shrink. Fix: check `hasPrevBuffer` before clearing. The wrong-order call still happens; the guard prevents the stomp. Promoting this to L4 is tracked in `km-silvery.paint-clear-invariant`.

### L2 — Invariant asserted + debug diagnostics

The rule is named, asserted at runtime (in strict/debug mode), and violations produce an attributable diagnostic. Catches regressions during dev but doesn't prevent them at compile time.

**km/silvery example**: `SILVERY_STRICT=1` invariants in the silvery pipeline — cursor visibility, border integrity, paint-then-clear ordering. Each violation prints the offending node + allocation site. The invariant document the contract, but a developer can still write code that violates it (the test catches it, not the type system). Many of km's recent regressions were caught by L2 invariants before user-visible bugs.

### L3 — API/lifecycle structure makes invalid state hard

The factory/lifecycle shape pushes the right ordering. You can technically misuse the API, but you have to work at it — the obvious path is the correct one.

**km/silvery example**: `useDispose(fn)` (silvery `ed086099`) — a hook that wires SIGINT + SIGTERM + React-unmount cleanup in one line. The app author still has to know dispose-as-a-concept and call the hook, but they can't forget to wire any of the three exit paths individually. This is the stopgap before scope-based ownership (L4).

### L4 — Architecture makes invalid state impossible by construction

The invalid state cannot be expressed. The type system, ownership graph, or single-direction data flow makes the wrong-order call site a compile error or a non-existent code path.

**km/silvery example**: `@silvery/scope` (`km-silvery.lifecycle-scope`, shipped in silvery `7d9ee8081`). Resources self-register cleanup on an ambient scope via `useScope()` / `useScopeEffect` / `handle.scope`. The app author cannot forget to clean up because there is no per-resource cleanup code — disposal is owned by the scope, the scope is owned by the runtime, and runtime teardown disposes the scope. The "leaked subprocess" failure mode was eliminated, not muted. The rubric target for `km-silvery.scope-resource-ownership` is L4 + L5 (handles become opaque branded types that can't be constructed outside the scope module).

### L5 — Old workaround code deleted + property/fuzz tests cover regression

Reaching L5 means: (1) the L0/L1/L2 detritus from earlier levels is removed (no orphan guards, no stale thresholds, no defensive comments), and (2) a property test or fuzz harness covers the bug class so a regression that re-introduces the workaround would fail CI.

**km/silvery example**: target state for `km-silvery.paint-clear-invariant` — when render-plan-commit lands, the `hasPrevBuffer` runtime guard at silvery 168b4989 must be deleted (because the wrong-order call site can't exist), AND the existing fuzz test that found seed=1337 must continue to pass against the new architecture. Today the bead is L1 (guard exists). L5 requires both deletion and fuzz coverage proving the guard is unreachable.

## How to use the rubric

When triaging a bead in `/big` Phase 7 or `/sop`, classify:

```
Current level: Lx
Target level: Ly
```

Stating both forces you to be honest about (a) where you are and (b) what work it takes to plateau. A bead whose current is L1 and target is L4 will involve architectural work — that's a different class of effort than an L1→L2 (just add an assertion).

Be conservative classifying current level. If a guard exists but the fuzz test is missing, it's L1, not L2. If the invariant runs only in strict mode, it's L2, not L3. The rubric loses its value the moment the levels start drifting toward "what feels good".

Be honest classifying target. Not every bug deserves L4. Test-only ergonomics (e.g., `handleTabCycling: false` default) target L3 (test-harness default) — going to L4 would be over-engineering. The right target is "the level above which the marginal cost outweighs the marginal class of bug eliminated."

## Anti-patterns

- **Sliding levels to make work look closer to done.** L1 today is L1 tomorrow. The level only moves when the code moves.
- **Skipping L5.** L4 without L5 leaves the workaround drifting in code as a fossil. The "guard removed + test added" step is what finishes a plateau.
- **Inflating target to L4 by default.** Some beads should target L3. State the reason.
- **Mixing levels across a bead.** A bead that says "current L1, target L4" implies one class of work. If the bead actually contains three sub-classes at three levels, split it.


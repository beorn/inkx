---
id: "@km/all/plateau-90"
aliases:
  - km-all.plateau-90
  - km-all-plateau-90
created_by: claude:cc081a9a
created_at: 2026-04-27T05:44:43Z
---

# [ ] [epic] Structural hardening program — pro/Kimi-corrected (2026-04-27) @km/all #feature #P2

[epic, restructured 2026-04-27 per pro/Kimi review] Originally framed as "push fix-sweep-vendor-fuzz areas from 60-65% to 90%+ plateau distance." That framing was incomplete: percentages are pseudo-precision, the children mixed heterogeneous work-types, and the "/big" instinct was being applied as breadth-of-7 rather than depth-on-1. This bead now tracks the corrected program.

Source review: /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt — GPT-5.4 Pro + Kimi K2.6 dual review, $2.70 / 24,374 tokens / 561s. Both models converged on the same critiques.

## GATE WORK (must complete before restructure)

### G1. Failure taxonomy of fix-sweep-vendor-fuzz
- Classify the 49 vendor failures + 5 fuzz failures by root cause
- Categories: lifecycle/ownership, render-phase ordering, layout convergence, test infrastructure, upstream-bug, other
- Output: counts per category in hub/silvery/design/failure-taxonomy.md + bd notes on this bead
- Why: validates whether ownership is THE seam (Kimi's hypothesis) or just one of several. If 35 of 49 are leak-adjacent, scope-resource-ownership IS the only bet. If render-phase dominates, swap priorities.
- Acceptance: every closed sub-bead under @km/all/fix-sweep-vendor-fuzz mapped to exactly one category; counts published.

### G2. Replace "plateau distance %" with 5-level rubric
- Replace 60-65% / 90% pseudo-percentages with a verifiable per-bead rubric:
  - L0: workaround / threshold / env tweak
  - L1: runtime guard catches it
  - L2: invariant asserted + debug diagnostics
  - L3: API/lifecycle structure makes invalid state hard
  - L4: architecture makes invalid state impossible by construction
  - L5: old workaround code deleted + property/fuzz tests cover regression
- Document in hub/quality-rubric.md or extend .claude/skills/big/SKILL.md
- Update every plateau-90 child bead to declare current level + target level
- Why: percentages drift to vibe; rubric is verifiable per-bead. Pro: "If someone asked 'why is this 65 not 55?' could you answer consistently?"
- Acceptance: rubric documented; every child bead lists current → target level.

## RESTRUCTURE WORK

### R1. Split this epic into three proper epics
Pro/Kimi: this epic mixes architectural hardening + cleanup + infra guardrails + test ergonomics. Easy wins close while hard work stalls.

Refile current children to:

**@km/silvery/structural-hardening (NEW epic)**:
- @km/silvery/scope-resource-ownership (recast of @km/silvery/lifecycle-leak-detection — see C1)
- @km/silvery/render-plan-commit (recast of @km/silvery/paint-clear-invariant — see C2; promoted to P1)
- @km/silvery/renderer-feedback-trace (NEW, P1 — see C3a)
- @km/silvery/bounded-convergence (recast of @km/silvery/renderer-convergence-by-design — see C3b)
- (@km/silvery/scrollto-single-pass folds into bounded-convergence — same feedback-edge class)

**@km/all/codepath-collapse (NEW epic)**:
- @km/silvery/hybrid-output-default

**@km/infra/guardrails (NEW epic)**:
- @km/infra/submodule-integrity-check (extend: CI AND pre-commit, not pre-commit alone)
- @km/silvery/test-handletabcycling-default

Acceptance: this epic has zero direct children after refile; the three new epics carry their populations; bd dep edges record lineage.

### R2. Tighten upstream-waiting registry (@km/all/upstream-waiting)
Pro/Kimi: registries die when not tied to code; "merged" ≠ "released" ≠ "adopted"; without escalation, "waiting" silently becomes "we gave up but won't admit it".

Update .claude/skills/pm/workflows/upstream.md §8 + @km/all/upstream-waiting epic description with:
- Per-bead `bd defer --until="<date>"` requirement (parent for grouping, defer for active reminding)
- Required field "Escalate by: <YYYY-MM-DD>" (default 6mo from creation)
- Required escalation path: "vendorize | fork | accept owned divergence | continue waiting"
- Status field constrained to {merged-upstream, released-upstream, adopted-locally} — adopted is when our deps actually consume the fix, not when upstream merges
- Code-marker convention: every workaround in code must have a greppable comment block:
    // UPSTREAM-WAITING(<repo>#<issue>): Delete when <pkg> >= <version>
    // Bead: km-<scope>.<slug>
    // Escalate by: <YYYY-MM-DD>
- New sibling registry @km/all/owned-divergence — workarounds where upstream is dead/declined and we own the divergence forever
- Lint script packages/@km/infra/scripts/check-upstream-markers.sh — every UPSTREAM-WAITING comment has a matching open bead + every open bead has at least one matching code marker; runs in CI

Acceptance: all updates landed in upstream.md §8 + epic description; lint script runs in CI; existing children of @km/all/upstream-waiting refiled to new template.

### R3. Split @km/bearly/mcp-plugin-bun-keepalive
Pro: the bead bundles two unrelated changes:
- URL.toString() in Request constructor — pure upstream-waiting shim
- lease-tracking refactor in connection lifecycle — likely permanent local hygiene improvement

Bundling means agent reverts good local design when upstream lands.

Split into:
- @km/bearly/bun-keepalive-url-shim (P3, child of @km/all/upstream-waiting) — unwind = revert URL.toString
- @km/bearly/mcp-lease-tracking (P4, child of @km/bearly scope) — evaluate keep/revert independent of Bun fix

Acceptance: original bead split + closed; both children created with correct parents and unwind logic.

## RECAST WORK (replaces existing children of this epic)

### C1. @km/silvery/lifecycle-leak-detection → @km/silvery/scope-resource-ownership (P1)
Original: handle count returns to baseline at scope close. Pro/Kimi: that's tighter detection, not Summit-tier prevention.

Real Summit:
- Every silvery resource factory takes a scope token; cannot be called without one
- Handle types are opaque branded outside the scope module — cannot be constructed except via factory
- Scope close asserts owner registry empty for resources owned BY THIS scope (not global handle count — ambient handles cause flakes)
- Strict/debug mode prints leaked resource classes + allocation sites
- Keep one slow memory canary somewhere (handle accounting doesn't catch closure leaks, cache growth, accidental retention)

Acceptance: grep 'Bun.gc' vendor/silvery/tests/ → 0; opaque branded Handle types unable to be constructed outside scope module (verified via test that imports the type and tries to forge one — must be tsc error); leak diagnostic prints resource class + allocation site; one slow memory canary remains.

### C2. @km/silvery/paint-clear-invariant → @km/silvery/render-plan-commit (P1, promoted from P2)
Original: phase-typed Buffer<Painting>/Buffer<Cleared>. Pro/Kimi: phantom types don't constrain shared mutation; ceremonial safety. Real fix is architectural.

Pick ONE during /big sprint:
- **Render plan + commit**: render produces immutable scene diff / op list; commit applies it in one deterministic order. clearExcessArea is either derived from the final plan or disappears.
- **Double-buffer swap**: paint into back buffer; swap; old front buffer implicitly retired. No "clear excess area" because entire buffer is retired.
- **Damage-list composition**: render produces damage rects; application is one atomic frame-end pass.

Acceptance: clearExcessArea hasPrevBuffer guard at silvery 168b4989 is removed (because the wrong-order call site can't exist); SILVERY_STRICT still passes; the previously-flagged violation can no longer be expressed.

### C3. @km/silvery/renderer-convergence-by-design → split into TWO beads
Original: "eliminate MAX_SINGLE_PASS_ITERATIONS, single-pass by design". Pro/Kimi (emphatic — Kimi: "catastrophically under-scoped"): single-pass is wrong target. Text layout with wrapping/intrinsic sizing is inherently iterative. CSS layout is iterative. Knuth-Plass line breaking is iterative.

**C3a. @km/silvery/renderer-feedback-trace (P1, do FIRST)**
- Every render/layout pass beyond pass 1 emits a reason category
- Reasons attributable to nodes/edges (which node invalidated layout? which edge fed back?)
- Pass causes counted from test runs / fuzz runs
- Why: makes convergence work evidence-driven, not speculative rewrite
- Acceptance: instrumentation shipped; SILVERY_INSTRUMENT=1 prints pass-cause histogram; fix-sweep tests show distribution of feedback reasons.

**C3b. @km/silvery/bounded-convergence (P2, after C3a delivers data)**
- Replace MAX_SINGLE_PASS_ITERATIONS=15 with explicit feedback-edge model
- For each edge class (text-measurement, viewport-dependent constraints, scrollTo settling): documented bound + proof or assertion
- Final state: either CONVERGENCE_THEOREM_QED N=2 (or whatever data supports), OR honest documentation that N>2 is fundamental and the constant is replaced by attributed bounds
- @km/silvery/scrollto-single-pass folds in here: post-resize scrollTo is one of the feedback edges
- Acceptance: MAX_SINGLE_PASS_ITERATIONS removed from renderer.ts; replaced with attributed bounds per edge class; new test asserts pass-count is bounded by edge inventory not by retry constant.

## NET-NEW WORK

### N1. @km/infra/continuous-fuzz (P1, child of @km/infra/guardrails)
Pro/Kimi: 5 fuzz failures were found in this sweep — fuzz is what's working. Stop fuzzing → regress. Plateau program without continuous fuzz is whack-a-mole.

- Wire fuzz harness into CI on a periodic schedule (nightly or per-PR depending on cost)
- Persistent corpus across runs (don't reset seeds each time)
- New crashes auto-create beads via existing /pm flow with seed + repro

Acceptance: GH Actions workflow runs fuzz on schedule; crashes file beads automatically; corpus persists.

### N2. @km/all/owned-divergence (P3, perpetual registry — inverse of upstream-waiting)
See R2: registry for workarounds where upstream is dead/declined and we own the divergence permanently. Reviewed in /sop infra alongside upstream-waiting. Created as part of R2 deliverable.

## EXECUTION ORDER

1. **Gates** G1 (taxonomy) + G2 (rubric) — parallel, neither blocks the other
2. **Restructure** R1 (epic split) + R2 (upstream-waiting tightening) + R3 (mcp-plugin split) — parallel after gates
3. **Recast** C1 (scope-resource-ownership) — start AFTER taxonomy confirms it's the deepest seam. If taxonomy shows render-phase dominates, swap C1 ↔ C2 priority.
4. **Recast** C3a (feedback-trace) — parallel with C1, provides data for C3b
5. **Recast** C2 (render-plan-commit) — after C1 lands or parallel if separate seam
6. C3b (bounded-convergence) — after C3a + C1
7. N1 (continuous-fuzz) — start early, lands incrementally, doesn't block anything
8. N2 (owned-divergence) — fold into R2 work

## /complete acceptance for this epic

- All gates G1, G2 done
- All restructures R1, R2, R3 done — this bead has zero direct children after R1
- All recasts C1, C2, C3a, C3b done OR explicitly deferred with reason in this bead's notes
- All net-new N1, N2 done OR deferred
- Retrospective in this bead's notes documents which pro/Kimi hypotheses held (e.g. "taxonomy showed 30/49 lifecycle, ownership was indeed the seam") and which didn't

## Cross-refs
- Source review: /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt
- Upstream registry: @km/all/upstream-waiting (modified by R2)
- Workflow skill: .claude/skills/pm/workflows/upstream.md (modified by R2)
- /big skill: .claude/skills/big/SKILL.md (modified by G2)
- SOP infra: .claude/skills/sop/SKILL.md (upstream-waiting check already wired, R2 extends it)
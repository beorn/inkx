---
id: "@km/all/structural-hardening-program"
aliases:
  - km-all.structural-hardening-program
  - km-all-structural-hardening-program
created_by: claude:cc081a9a
created_at: 2026-04-27T06:06:48Z
closed_at: 2026-04-27T06:07:10Z
close_reason: Folded into km-all.plateau-90 per user direction — that's the
  existing tracking bead; this duplicate was created before realizing.
---

# [x] [program] Restructure + execute plateau work per pro/Kimi review (2026-04-27) @km/all #feature #P1

[program] Restructure + execute the plateau-90 work per pro/Kimi review of 2026-04-27. Supersedes the original @km/all/plateau-90 epic shape; that epic stays as the label but children get refiled per the cuts below.

Source: GPT-5.4 Pro + Kimi K2.6 dual review at /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt ($2.70, 24,374 tokens, 561s). Both models converged on: (a) plateau-90 is overloaded across heterogeneous work-types, (b) "plateau distance %" is pseudo-precision, (c) several "structural" fixes are actually detection or TS theater, (d) /big anti-pattern of breadth-as-depth — pick ONE seam, go deep.

## GATE WORK (must complete before restructure)

### G1. Failure taxonomy of fix-sweep-vendor-fuzz
- Classify the 49 vendor failures + 5 fuzz failures by root cause
- Categories: lifecycle/ownership, render-phase ordering, layout convergence, test infrastructure, upstream-bug, other
- Output: counts per category in a hub/silvery/design/failure-taxonomy.md doc + bd notes on this bead
- Why: validates whether ownership is THE seam (Kimi's hypothesis) or just one of several
- Acceptance: every closed sub-bead under @km/all/fix-sweep-vendor-fuzz mapped to exactly one category; counts published

### G2. Replace "plateau distance %" with 5-level rubric
- Update the /big skill (or new doc hub/quality-rubric.md) with: L0 workaround/threshold/env tweak; L1 runtime guard catches it; L2 invariant asserted + debug diagnostics; L3 API/lifecycle structure makes invalid state hard; L4 architecture makes invalid state impossible by construction; L5 old workaround code deleted + property/fuzz tests cover regression
- Update @km/all/plateau-90 description: replace "60-65% → 90%+" with "L0/L1 → L4/L5"
- Why: percentages drift to vibe; rubric is verifiable per-bead
- Acceptance: every plateau-90 child bead lists its current level + target level

## RESTRUCTURE WORK

### R1. Split plateau-90 into three proper epics
Move children from @km/all/plateau-90 to:

- @km/silvery/structural-hardening (NEW) — gets:
  - @km/silvery/scope-resource-ownership (recast of lifecycle-leak-detection — see C1)
  - @km/silvery/render-plan-commit (recast of paint-clear-invariant — see C2)
  - @km/silvery/renderer-feedback-trace (NEW, P1 — see C3)
  - @km/silvery/bounded-convergence (recast of renderer-convergence-by-design — see C3, P2 after feedback-trace)
  - (scrollto-single-pass folds into bounded-convergence — same class)

- @km/all/codepath-collapse (NEW) — gets:
  - @km/silvery/hybrid-output-default

- @km/infra/guardrails (NEW) — gets:
  - @km/infra/submodule-integrity-check (extend: CI AND pre-commit, not pre-commit alone)
  - @km/silvery/test-handletabcycling-default

Why: pro/Kimi: mixing architectural hardening with cleanup/infra/test ergonomics dilutes both. Easy wins close while hard work stalls.
Acceptance: @km/all/plateau-90 has zero direct children after refile; the three new epics carry their populations; bd dependency edges record the lineage.

### R2. Tighten upstream-waiting registry
Update .claude/skills/pm/workflows/upstream.md §8 + @km/all/upstream-waiting epic:

- ADD per-bead `bd defer --until="<date>"` requirement (parent for grouping, defer for active reminding)
- ADD required field "Escalate by: <date>" (default 6mo from creation)
- ADD required escalation path: "vendorize | fork | accept owned divergence | continue waiting"
- ADD distinction: status field must be one of {merged-upstream, released-upstream, adopted-locally} — adopted is when our deps actually consume the fix
- ADD code-marker convention: every workaround in code must have a greppable comment block:

  ```
  // UPSTREAM-WAITING(<repo>#<issue>): Delete when <pkg> >= <version>
  // Bead: km-<scope>.<slug>
  // Escalate by: <YYYY-MM-DD>
  ```

- ADD `km-all.owned-divergence` sibling registry — inverse: workarounds where upstream is dead/declined and we own the divergence forever
- ADD lint script packages/@km/infra/scripts/check-upstream-markers.sh — every UPSTREAM-WAITING comment has a matching open bead + every open bead has at least one matching code marker

Why: pro/Kimi: registries die when not tied to code; "merged" ≠ "released" ≠ "adopted"; without escalation, "waiting" silently becomes "we gave up but won't admit it".
Acceptance: all four updates landed in upstream.md §8 + epic description; lint script exists and runs in CI; existing children of @km/all/upstream-waiting refiled to new template.

### R3. Split @km/bearly/mcp-plugin-bun-keepalive
The current bead bundles two unrelated changes:
- URL.toString() in Request constructor — pure upstream-waiting shim
- lease-tracking refactor in connection lifecycle — may be permanent local hygiene improvement

Split into:
- @km/bearly/bun-keepalive-url-shim (P3, child of @km/all/upstream-waiting) — unwind = revert URL.toString
- @km/bearly/mcp-lease-tracking (P4, child of @km/bearly or whichever scope owns mcp-plugin) — evaluate keep/revert independent of Bun fix

Why: pro: bundling upstream-shim with permanent improvement creates wrong unwind instructions — agent reverts good local design when upstream lands.
Acceptance: original bead split + closed; both children created with correct parents and unwind logic.

## RECAST WORK (replaces existing beads under restructured epics)

### C1. Recast @km/silvery/lifecycle-leak-detection → @km/silvery/scope-resource-ownership (P1)
Original framing was detection (handle count returns to baseline at scope close). Pro/Kimi: that's tighter detection, not Summit-tier prevention.

Real Summit:
- Every silvery resource factory takes a scope token; cannot be called without one
- Handle types are opaque branded outside the scope module — cannot be constructed except via factory
- Scope close asserts owner registry empty for resources owned BY THIS scope (not global handle count — ambient handles cause flakes)
- Strict/debug mode prints leaked resource classes + allocation sites
- Keep one slow memory canary somewhere (handle accounting doesn't catch closure leaks, cache growth, accidental retention)

Acceptance: grep 'Bun.gc' vendor/silvery/tests/ → 0; opaque branded Handle types unable to be constructed outside scope module (verified via test that imports the type and tries to forge one — must be tsc error); leak diagnostic output shows resource class + allocation site; one slow memory canary remains.

### C2. Recast @km/silvery/paint-clear-invariant → @km/silvery/render-plan-commit (P1, promoted from P2)
Original framing was phase-typed Buffer<Painting>/Buffer<Cleared>. Pro/Kimi: phantom types don't constrain shared mutation; ceremonial safety. Real fix is architectural.

Pick ONE of three approaches (decide during /big sprint):
- **Render plan + commit**: render phase produces immutable scene diff / op list; commit applies it in one deterministic order. clearExcessArea is either derived from the final plan or disappears.
- **Double-buffer swap**: paint into back buffer; swap; old front buffer implicitly retired. No "clear excess area" because entire buffer is retired.
- **Damage-list composition**: render produces damage rects; application is one atomic frame-end pass.

Acceptance: clearExcessArea hasPrevBuffer guard at silvery 168b4989 is removed (because the wrong-order call site can't exist); SILVERY_STRICT still passes; the previously-flagged violation can no longer be expressed.

### C3. Recast @km/silvery/renderer-convergence-by-design into TWO beads
Original was "eliminate MAX_SINGLE_PASS_ITERATIONS, single-pass by design". Pro/Kimi (emphatic): single-pass is wrong target — text layout with wrapping/intrinsic sizing is inherently iterative.

Split into:

**C3a. @km/silvery/renderer-feedback-trace (P1, do FIRST)**
- Every render/layout pass beyond pass 1 emits a reason category
- Reasons attributable to nodes/edges (which node invalidated layout? which edge fed back?)
- Pass causes counted from test runs / fuzz runs
- Acceptance: instrumentation shipped; SILVERY_INSTRUMENT=1 prints pass-cause histogram; fix-sweep tests show distribution of feedback reasons
- Why: makes convergence work evidence-driven, not speculative

**C3b. @km/silvery/bounded-convergence (P2, after C3a delivers data)**
- Replace MAX_SINGLE_PASS_ITERATIONS=15 with explicit feedback-edge model
- For each edge class (text-measurement, viewport-dependent constraints, scrollTo settling): documented bound + proof or assertion
- Final state: either CONVERGENCE_THEOREM_QED N=2 (or whatever the data supports), OR honest documentation that N>2 is fundamental and the constant becomes "edge inventory limit"
- scrollto-single-pass folds in here: post-resize scrollTo is one of the feedback edges
- Acceptance: MAX_SINGLE_PASS_ITERATIONS removed from renderer.ts; replaced with attributed bounds per edge class; new test asserts pass-count is bounded by edge inventory not by retry constant

## NET-NEW WORK

### N1. @km/infra/continuous-fuzz (P1, child of @km/infra/guardrails)
Pro/Kimi: 5 fuzz failures were found in this sweep — fuzz is what's working. Stop fuzzing → regress. A plateau program without continuous fuzz is whack-a-mole.

- Wire fuzz harness into CI on a periodic schedule (nightly or per-PR depending on cost)
- Persistent corpus across runs (don't reset seeds each time)
- New crashes auto-create beads via existing /pm flow with seed + repro
- Acceptance: GH Actions workflow runs fuzz on schedule; crashes file beads automatically; corpus persists.

### N2. @km/all/owned-divergence (P3, perpetual registry — inverse of upstream-waiting)
See R2: registry for workarounds where upstream is dead/declined and we own the divergence permanently. Reviewed in /sop infra alongside upstream-waiting.

## EXECUTION ORDER

1. Gates G1 (taxonomy) + G2 (rubric) — neither blocks the other, run parallel
2. Restructure R1 (epic split) + R2 (upstream-waiting tightening) + R3 (mcp-plugin split) — parallel after gates
3. Recast C1 (scope-resource-ownership) — start AFTER taxonomy confirms it's the deepest seam (Kimi's hypothesis but pro agrees if the data supports). If taxonomy shows render-phase ordering dominates, swap C1 ↔ C2 priority.
4. Recast C3a (feedback-trace) — parallel with C1, provides data for C3b
5. Recast C2 (render-plan-commit) — after C1 lands or in parallel if it's a separate seam
6. C3b (bounded-convergence) — after C3a + C1 (lifecycle ownership often clarifies render ordering)
7. N1 (continuous-fuzz) — start early, lands incrementally, doesn't block anything
8. N2 (owned-divergence) — fold into R2 work

## /complete acceptance for this program bead

- All gates G1, G2 done
- All restructures R1, R2, R3 done
- All recasts C1, C2, C3a, C3b done OR explicitly deferred with reason in this bead's notes
- All net-new N1, N2 done OR deferred
- @km/all/plateau-90 description updated to reflect new shape (or epic closed if all children migrated)
- This bead's retrospective documents which of pro/Kimi's hypotheses held and which didn't

## Cross-refs
- Source review: /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt
- Original plan: @km/all/plateau-90 (description has the original 60-65% framing — to be updated by G2)
- Upstream registry: @km/all/upstream-waiting (modified by R2)
- Skill: .claude/skills/pm/workflows/upstream.md (modified by R2)
- /big skill: .claude/skills/big/SKILL.md (modified by G2)
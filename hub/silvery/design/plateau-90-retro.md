# Plateau-90 Phase 1 Retrospective

**Program**: km-all.plateau-90 (structural hardening)
**Session**: 2026-04-27 (continuation across compaction)
**Outcome**: Phase 1 substrate + Phase 2/3 cleanup substantially shipped over 5 integration rounds. C3b at L5; C1 at L4.5 (broader fossil sweep in flight); C2 at L4 with multi-session L5 deferred (task #14); C3a at L2 (target); N1 at L2-L3.

> 2026-04-29 update: The /round-close skill recommended in this retro (Why 1, Why 2, lessons section) was retired and folded into /complete. Its Iron Rule (verify acceptance greps at origin/main, not local worktrees) and per-round acceptance-grep replay now live in /complete's preamble. References below are preserved for historical accuracy — invoke /complete instead.

This document captures the post-ship state, what /pro and /why analyses surfaced, and where the residue lives. Authoritative reference for "what was plateau-90 and how did it go." Pairs with `km bd show km-all.plateau-90` (the plan) and `hub/quality-rubric.md` (the L0-L5 framework).

## What shipped

### Net code change

| Repo            | Range                 | Commits | Files | Lines         |
| --------------- | --------------------- | ------- | ----- | ------------- |
| silvery         | 6eec011c → 2a6f087d   | 41      | 33+   | +5,841 / −171 |
| km (non-vendor) | f0a64b006 → 5f8510b62 | 9+      | 9     | +1,088 / −73  |
| Total           |                       | 50+     | 42+   | ~+6,685       |

Mostly additive — new infrastructure (RenderSink + sectioned plan + scope handles + pass-cause aggregator + sabotage test + fuzz test). Deletions are cleanup (magic constants, dead enum buckets, redundant plumbing).

### Per-recast L0-L5 status (post-ship)

| Recast                      | Bead                                      | Origin level | Target             | Status                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------- | ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 scope-resource-ownership | km-silvery.lifecycle-leak-detection       | L4.5         | L5                 | Counter shipped (getActiveHandleCount); fossil deleted from 1 of 3 files in tests/memory/. Broader sweep filed (km-silvery.c1-fossil-sweep-broader) and dispatched.                                                                                                                                                                             |
| C2 render-plan-commit       | km-silvery.paint-clear-invariant          | L4           | L5                 | Sectioned RenderPlan structurally proven via 1,400-scene fuzz (0 violations); default-ON in production. clearExcessArea + hasPrevBuffer guard + env flag remain as fossils — gated on full Step 6 read-after-write elimination, multi-session (task km-silvery.paint-clear-l5-final aka task #14).                                              |
| C3a renderer-feedback-trace | km-silvery.renderer-feedback-trace        | L2           | L2 (target met)    | Functional target reached. v3.1 (rename + per-cause sub-namespaces) merged in Round 4.                                                                                                                                                                                                                                                          |
| C3b bounded-convergence     | km-silvery.renderer-convergence-by-design | L5           | L5                 | Complete. MAX_SINGLE_PASS_ITERATIONS=15 deleted; MAX_CONVERGENCE_PASSES=2 + MAX_CLASSIC_LOOP_ITERATIONS=5 + per-cause PASS_CAUSE_BOUNDS + assertBoundedConvergence STRICT=2 throw / STRICT=1 warn. ForeverFeedback sabotage test proves bound is load-bearing. PassCause type audited 14→6 (deleted 8 categories with no production emit path). |
| N1 continuous-fuzz          | km-infra.continuous-fuzz                  | L2-L3        | L2-L3 (target met) | GH Actions on schedule + persistent corpus + auto-bead creation. PR-gating would lift to L3.                                                                                                                                                                                                                                                    |

### Integration rounds

| Round | Date              | silvery main | km main                | What landed                                                                      |
| ----- | ----------------- | ------------ | ---------------------- | -------------------------------------------------------------------------------- |
| 1     | 2026-04-27 ~07:00 | 313f569b     | 960765c1a              | C1 Phase 1 + C2 Phase 1 + C3a v1                                                 |
| 2     | 2026-04-27 ~08:15 | fa705b66     | 5da096d12              | C1 SCOPE_TRACE Phase 2 + C2 sectioned-plan Step 1 + C3a unknown bucket synthesis |
| 3     | 2026-04-27 ~09:14 | 3010d3f4     | e36b1ce13              | C2 Phase 2/3 (Steps 4b-7 + fuzz + default ON) + C3b bounded-convergence          |
| 4     | 2026-04-27 ~15:15 | 5e0dc86c     | 8eeaf2fb9              | v3.1 (rename recordPassCause→logPass + per-cause sub-namespaces)                 |
| 5     | 2026-04-27 ~17:17 | 2a6f087d     | (pending FF onto main) | C1 deterministic counter + 1-of-3 fossil deletion                                |

## Bugs caught BEFORE shipping (via dual-pro review)

Six high-impact bugs caught pre-merge by GPT-5.4 Pro / Kimi K2.6 review of designs and substrates:

1. **COMMIT_PRIORITY backwards** (silvery `bcdd0b11`) — original Phase 1 priority `fillBg → fill → setCell` would have **reintroduced the sibling-stomp at commit time** (the bug C2 was specifically meant to fix structurally). Pro/Kimi flagged the inversion. Corrected: `setSelectableMode(0) → scrollRegion(1) → fill(2) → fillBg(3) → setCell(4) → restyleRegion(5) → mergeAttrsInRect(6) → setRowMeta(7)`. **Highest-impact catch.**
2. **mergeAttrsInRect missing from recorder** (silvery `bcdd0b11`) — Box bold/underline/strikethrough silently diverged on attr-overlay scenes.
3. **Classifier heuristic wrong** (silvery `f5eb2651`) — `fill with space char = clear` heuristic produced wrong output for real scenes. Caused 9 vendor STRICT failures matching pro/Kimi's prediction. Reverted before merging; led to the correct RenderSink design where call sites declare intent (no inference).
4. **Soft nominality on handle pattern** (silvery `612127c8`) — original Phase 1 brand symbol leakable via `Object.getOwnPropertySymbols`; forged values via `as TickHandle` would pass type checks. Hardened to runtime WeakSet authenticity gate.
5. **MAX=2 too tight for classic loop** (silvery `c72206e8`) — broke list-view-refinements + termless-memleak. Classic loop in renderer.ts genuinely needs 3-4 iterations on heterogeneous-height lists. Caught by STRICT failures. Split into `MAX_CONVERGENCE_PASSES=2` + `MAX_CLASSIC_LOOP_ITERATIONS=5`.
6. **v1 99.83% layout-invalidate measurement artifact** (silvery `5f4d9ab8`) — feedback-trace v1 reported every subscriber-rect-write including non-firing subscribers. 40× noise reduction by gating to subscriber-observed nodes. The dominant-edge data feeding C3b was almost a measurement artifact.

Bonus catches: silvercode bleed test was nominally testing for bleed but only verifying panel-presence (ToolCall accordion hides content); postinstall:build:info missing (km-infra.ci-build-info-gen → 27b6fe8cd); bearly worktree-symlink failure (broke 31 dependencies in parallel-agent worktrees → bearly 16dc16ae5).

## Pro plateau-distance review (3 models, judged)

`/tmp/llm-cc081a9a-how-far-are-we-bloh.txt` (cost: $1.13) ran GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro through `gpt-5-mini` judge. Verdict: **GPT-5.4 Pro winner (20/20), Kimi K2.6 close second (19/20), Gemini 3 Pro challenger (16/20).**

Consensus across three models:

> "We bought significant altitude — C3b is on the plateau, C1 and C2 are L4 with structural steel in place. But not on plateau yet. Phase 1 ended with two L4 arches and a cleaning crew still on site."

Smallest move set to plateau (consensus):

1. **Push v3.1 to origin** (closes inventory rot) — DONE in this session
2. **C1 fossil deletion via deterministic handle counter** — DONE for memory.test.tsx in this session; broader sweep dispatched
3. **C2 Phase 3 final cleanup (Task #14)** — multi-session, scheduled as next major arc
4. **PR-gate the fuzz** (N1 L2 → L3) — deferred to /sop infra
5. **Fix typecheck baseline + pre-existing pro-fire-and-forget** — deferred separate filing

Big-seam reframes flagged for future sessions (offensive moves, not in current scope):

- **Shadow buffer in @silvery/render** — terminal becomes pure function of RenderPlan → bytes (eliminates `clearExcessArea` need entirely)
- **Universal scope ownership for km** — make scope the universal lifecycle primitive (not just silvery-internal)
- **PassCause as RenderSink mandatory token** — feedback trace becomes first-class commit invariant rather than sidecar logger

## /why session-process findings

`/why` analysis traced "did we have so much follow-up work?" through 5 levels of cause:

| Level | Cause                                                                             | Fix landed this session                                                                            |
| ----- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Why 1 | Agent self-reports were trusted; bead acceptance not verified against origin/main | NEW /round-close skill — lightweight per-round bead-acceptance grep against origin/main            |
| Why 2 | /complete is session-end only, not per-round                                      | /round-close skill is the lighter primitive                                                        |
| Why 3 | Bead acceptance is prose, not executable {cmd, expected} pairs                    | Filed km-all.bd-verify-primitive (P3, multi-session, possibly upstream)                            |
| Why 4 | Substrate-then-cleanup phasing intentionally creates L4-but-not-L5 by design      | Filed km-all.substrate-phasing-convention (P2) — file L5 cleanup bead at same time as L4 substrate |
| Why 5 | Worktree clones accumulate; no GC                                                 | Filed km-bearly.worktree-gc (P3) — sweep stale .claude/worktrees/agent-*                           |

Other process change shipped this session:

- `/max` SKILL.md CRITICAL block: changed "commit before finishing" → "commit AND push, with `git ls-remote origin <branch>` proof" (rationale: 2 agents this session committed but didn't push — feedback-trace v3.1 `e0fc140c` and the C1 fossil-deletion agent `725ea161`).

## Residue map (what remains)

### L4-but-not-L5 (workaround fossils still in code)

1. **C2** (multi-session, properly deferred): `clearExcessArea` + `hasPrevBuffer` guard + `SILVERY_RENDER_PLAN` env flag. Filed as `km-silvery.paint-clear-l5-final` (task #14). Gated on full Step 6 read-after-write elimination.
2. **C1** (in flight): Bun.gc/warmup/globalThis.gc fossils still in `heap-snapshot.slow.test.tsx` (6 hits) + `production-paths.test.tsx` (7 hits). Filed as `km-silvery.c1-fossil-sweep-broader` (P2). Agent dispatched in this session.

### Inventory rot (unpushed local-only commits) — RESOLVED

Both stranded commits from this session were pushed by lead:

- silvery `e0fc140c` (v3.1) — pushed to origin/feat/feedback-trace, merged in Round 4
- silvery `725ea161` (C1 deterministic counter) — pushed to origin/feat/c1-deterministic-handle-counter, merged in Round 5
- km `f79842ade` (C1 km bump) — pushed in same flow

The strandings prompted the `/max` skill CRITICAL block update (commit AND push, ls-remote proof).

### Pre-existing residue (separate filings)

- Typecheck baseline drift on km main — pre-existing; never regressed by this work, never fixed either.
- `pro-fire-and-forget.test.ts` model-name drift in vendor/bearly — separate filing.
- `mdspec/vitest-plugin` postinstall — sibling of km-infra.ci-build-info-gen; surfaced but not yet addressed.
- ~30 `.claude/worktrees/agent-*` clones — filed as `km-bearly.worktree-gc`.

## Follow-up beads (canonical list as of 2026-04-27)

All filed under appropriate scope epics:

| Bead                                      | Priority | Purpose                                                                              |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| km-silvery.paint-clear-l5-final           | P2       | C2 → L5: full Step 6 + delete clearExcessArea + hasPrevBuffer + env flag             |
| km-silvery.c1-fossil-sweep-broader        | P2       | Extend C1 fossil deletion to heap-snapshot.slow.test.tsx + production-paths.test.tsx |
| km-silvery.feedback-trace-v31-integration | P2       | (resolved by Round 4 merge — close after this lands)                                 |
| km-all.substrate-phasing-convention       | P2       | File L5 cleanup bead at same time as L4 substrate                                    |
| km-all.bd-verify-primitive                | P3       | bd verify subcommand — make acceptance executable                                    |
| km-bearly.worktree-gc                     | P3       | Sweep stale agent worktrees                                                          |

## Lessons captured (durable)

- **Phase scoping as substrate-then-cleanup creates planned residue.** The substrate ships at L4; the L5 cleanup bead must be filed *before* the substrate ships, not discovered after. (See `km-all.substrate-phasing-convention`.)
- **Trust origin/main, not local worktrees.** Agent claims of "shipped" without `git ls-remote origin` verification can be wrong (v3.1 + C1 stranded examples). The `/round-close` skill encodes this gate.
- **Acceptance criteria as prose drift.** Two well-formed beads in this session had acceptance criteria too narrow (C1 fossil scoped to memory.test.tsx only when fossils existed in 3 files). Executable `{cmd, expected}` pairs (`km-all.bd-verify-primitive`) prevent this drift.
- **Dual-pro review during design > dual-pro review after ship.** 6 high-impact bugs caught pre-merge by reviewing the design + substrate before merging into main. The COMMIT_PRIORITY-backwards catch alone justified the ~$5 review cost.
- **The fuzz test as load-bearing assertion.** Phase 3's 1,400-scene fuzz proves the L4 invariant in production, not just in the type system. The fuzz is what gives confidence to defer L5 cleanup as multi-session — the property holds even with the fossil still in code.

## Cross-references

- Plan: `km bd show km-all.plateau-90`
- Rubric: `hub/quality-rubric.md`
- Per-recast designs: `hub/silvery/design/{render-plan-commit,convergence-bounds,pass-cause-histogram,lifecycle-scope,failure-taxonomy}.md`
- Pro review (raw): saved at `/tmp/llm-cc081a9a-how-far-are-we-bloh.txt` during this session; copy in this doc's "Pro plateau-distance review" section
- Process skills: `.claude/skills/{round-close,complete,why,big,refactor}/SKILL.md`
- Lessons: `docs/lessons/{quality-plateau-refactoring,refactoring}.md`


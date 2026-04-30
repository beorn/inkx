---
name: big
description: "META-PROTOCOL for reframing the problem: generate 10-20 hypotheses, run at least two rounds, and find the design where the bug cannot happen. Use when a fix feels like a patch, the same area keeps breaking, or the user asks to think bigger. Subsumes /fresh."
argument-hint: "[problem or area]"
benefits-from: [recall, beads, ask, pro, deep, csw]
---

# /big - Think Big

This is a Codex skill, not a standalone LLM tool. Its job is to stop a patch spiral and find the design where the current problem becomes impossible or much harder to create.

Use this when:
- The same class of bug has appeared repeatedly.
- The next fix would add another special case.
- The user says "think bigger", "why does this keep breaking", or similar.
- You have been debugging for long enough that the root cause keeps shifting.

If the user names a problem, use that. If not, infer it from the recent conversation and current worktree; do not ask just to restate the obvious.

## Phase 1: Frame the Problem Five Ways

Write 1-2 sentences for each:

1. User words: what they literally saw or asked for.
2. System state: what transition, invariant, or lifecycle failed.
3. Architecture: which ownership boundary, layer, or abstraction is missing or leaking.
4. History: run `bun recall "<keywords>"` when useful and summarize prior attempts.
5. Counterfactual: in a better design, why could this problem not happen?

The counterfactual matters most; it points at the real fix.

## Phase 2: Generate Hypotheses

Before exploring, list 10-20 framings. These are not solutions yet; each should name a different possible root cause or a way to eliminate the class of problem.

Force breadth:
- Missing abstraction: what concept should exist?
- Wrong ownership: who should own this state instead?
- Missing invariant: what rule is enforced by convention but should be enforced by code?
- Unnecessary complexity: what subsystem could disappear?
- Wrong layer: where should this logic really live?
- Prior art: how do comparable tools avoid this problem?
- Inverse: what if the opposite default were true?
- Composition: can two simpler mechanisms replace one complex one?
- Deletion: what code path exists only to compensate for a bad design?
- Unification: are there multiple mechanisms that should be one?

Write the full list before exploring. Breadth first, depth second.

## Phase 3: Explore Round 1

For each hypothesis:

1. Grep/read relevant code. Use `rg` first.
2. Estimate blast radius: files, packages, user-visible behavior, test scope.
3. Score it:
   - `NARROW`: fixes only the reported bug.
   - `BROAD`: fixes a class of related bugs.
   - `REFRAME`: makes the problem impossible by construction.

Do not spend forever on each hypothesis; 2-5 minutes is enough unless one clearly unlocks the design.

## External Perspective

Use at least one external perspective unless the user has explicitly forbidden model/API spend. Pick the cheapest tool that fits:

- Quick prior art or a second opinion: use the `ask` skill and run `bun llm ...`.
- Hard architecture or code review: use the `pro` skill and run `bun llm pro -y --no-recover --context-file <ctx> "..."`.
- Web research with citations: use the `deep` skill and run `bun llm --deep -y --no-recover --context-file <ctx> "..."`.
- Four-plus internal options with a decision matrix: use the `csw` skill.

Build a context file when code matters. Include full files, relevant tests, exact errors, and failed approaches last so the outside model is not anchored.

For silvery-related questions, include `docs/silvery-positioning-brief.md` in the context as required by the `ask`/`pro`/`deep` skills.

## Phase 4: Synthesize Round 1

Write 3-5 sentences:

- Which hypotheses were `BROAD` or `REFRAME`?
- What pattern do they share?
- What did code inspection rule out?
- What new question should Round 2 answer?

## Phase 5: Iterate

Run at least one second round. Generate 5-20 new hypotheses based on Round 1, then explore and synthesize again.

Stop after Round 2 only if the recommendation is clear. Continue when the synthesis is still producing new facts or multiple reframes are plausible.

## Phase 6: Quality Level

Use this rubric instead of percentages:

- `L0`: workaround, threshold, config tweak.
- `L1`: runtime guard catches it.
- `L2`: invariant asserted plus useful diagnostics.
- `L3`: API or lifecycle structure makes invalid state hard.
- `L4`: architecture makes invalid state impossible by construction.
- `L5`: old workaround deleted plus property/fuzz/regression tests cover it.

If needed, read `hub/quality-rubric.md` from the repo root for the full rubric. State current level and target level, for example `L1 -> L4`.

## Phase 7: Recommendation

Use this shape:

```markdown
### Reframing: [problem]

**The real problem is**: [one sentence]
**Current level -> target level**: Lx -> Ly
**The design that makes it unnecessary**: [1-3 sentences]
**What it solves beyond this bug**: [related failures]
**Effort**: [files/packages/risk/phases]
**First step**: [smallest move toward the design]
```

## Phase 8: Actions

Split follow-up into `DO` and `ASK`.

`DO` items are obvious and low-risk:
- Ship a narrow fix needed to unblock the user.
- Add missing tests or invariants.
- Delete clearly dead compensating code.
- Create beads for larger reframes.

`ASK` items need user approval:
- Public API changes.
- Multi-package architecture changes.
- Product behavior changes.
- Work that conflicts with active beads or visible WIP.

For bead creation, use the `beads` skill and the current Codex bead command style, for example:

```bash
bd create --id km-<scope>.<slug> --title "<title>" --priority P3 --description "<design summary>"
```

Do not use legacy Claude command forms such as `--parent km-silvery --id better-scroll-defaults`; prefer a full bead id like `km-silvery.better-scroll-defaults`.

## Output Discipline

Lead with findings and the recommended direction. Keep the full hypothesis list visible enough that the user can audit the reasoning, but do not bury the action plan under transcript-like detail.

When implementation is clearly part of the request, execute the `DO` items after the analysis. Ask only for the `ASK` items.

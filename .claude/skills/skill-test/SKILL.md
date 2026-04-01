---
description: "Pressure-test a skill with adversarial subagent scenarios. TDD for skills — write the test, watch it fail, fix the skill, watch it pass."
argument-hint: [skill name to test, e.g. "tdd", "diagram", "review"]
---

# Skill Test — TDD for Skills

**Every skill has failure modes. Find them before users do.**

Inspired by obra/superpowers' pressure testing approach: spawn subagents that exercise a skill under adversarial conditions, observe where the skill's instructions break down, then fix the skill.

## The Task

$ARGUMENTS

**If no arguments**: Test the most recently created or modified skill. Check `ls -lt .claude/skills/*/SKILL.md | head -5`.

## Phase 1: Understand the Skill

Read the target skill's SKILL.md completely. Identify:

- **Trigger conditions** — when does it activate?
- **Decision points** — where does it branch?
- **Concrete outputs** — what should it produce?
- **Implicit assumptions** — what does it assume about context?

## Phase 2: Design Pressure Scenarios

Write 5-8 scenarios that stress-test the skill. Each scenario should target a specific failure mode:

**Scenario types:**
- **Ambiguous trigger** — input that's borderline for activation (should it fire or not?)
- **Missing context** — skill needs info that isn't available
- **Conflicting instructions** — two rules in the skill contradict
- **Edge case input** — empty, huge, malformed, or unusual input
- **Composition stress** — skill interacts with another skill or tool unexpectedly
- **Anti-pattern bait** — scenario where the obvious path violates the skill's own anti-patterns
- **Scope creep** — scenario where following the skill leads to unbounded work

Format each scenario:
```
SCENARIO: [name]
SETUP: [what the subagent will encounter]
EXPECTED: [what a correct skill execution produces]
FAILURE MODE: [what goes wrong if the skill has gaps]
```

## Phase 3: Run Scenarios

For each scenario, spawn a subagent with:
1. The skill loaded (via /skill-name or by reading the SKILL.md)
2. The scenario setup as the task
3. Instructions to follow the skill exactly, reporting any confusion or dead ends

```
Use Agent tool with:
- prompt: "You are testing the /<skill> skill. Follow it exactly. Report any point where the instructions are unclear, contradictory, or insufficient. Here is your scenario: [SETUP]"
- subagent_type: general-purpose
```

Run scenarios in parallel where independent.

## Phase 4: Analyze Results

For each scenario, score:
- **PASS** — skill guided the agent to the correct output
- **CONFUSED** — agent deviated because instructions were ambiguous
- **FAIL** — agent produced wrong output following the skill correctly
- **GAP** — skill had no guidance for this situation

Collect all CONFUSED/FAIL/GAP results into a findings list.

## Phase 5: Fix the Skill

For each finding:
1. Identify the specific section of SKILL.md that needs change
2. Write the fix (add missing guidance, clarify ambiguity, resolve contradiction)
3. Apply the edit

After all fixes, re-run the failed scenarios to verify they now PASS.

## Phase 6: Report

```
SKILL: /[name]
SCENARIOS: [N] total
RESULTS: [pass] PASS, [confused] CONFUSED, [fail] FAIL, [gap] GAP
FIXES: [N] applied
REMAINING: [any unfixed issues and why]
```

## Anti-Patterns

- **Testing happy paths only** — the point is adversarial scenarios, not confirmation
- **Fixing by adding caveats** — "be careful" is not a fix; add concrete decision rules
- **Testing without subagents** — you can't pressure-test a skill by reading it; you must execute it
- **Over-testing** — 5-8 scenarios is enough; don't write 20

---
description: "Iterative skill refinement — run a skill, observe gaps, fix, re-run. Automated improvement loop. Use after /skill-test finds issues, or to polish any skill."
argument-hint: [skill name to improve]
---

# Skill Improve — Automated Refinement Loop

**Skills decay. Requirements shift. Patterns evolve. This skill keeps other skills sharp.**

Runs an automated fix-review cycle: execute the skill on real or synthetic tasks, observe where it underperforms, fix it, verify the fix, repeat until stable.

## The Task

$ARGUMENTS

**If no arguments**: Pick the skill with the oldest modification date: `ls -lt .claude/skills/*/SKILL.md | tail -5`

## Phase 1: Baseline Assessment

Read the skill and score it against these quality criteria:

**Structure** (does it have the right pieces?)
- Clear trigger description
- Concrete steps (not vague guidance)
- Decision trees for branching logic
- Anti-patterns table
- External tool references where applicable

**Specificity** (is it actionable?)
- Commands are copy-pasteable
- File paths are concrete (not "the relevant file")
- Decision rules have thresholds (not "if it seems like")
- Examples show real km patterns (not generic)

**Freshness** (does it match current practice?)
- Referenced files still exist (`grep` for paths, verify they resolve)
- Commands still work (try running any CLI commands mentioned)
- Patterns match recent commits (check if the skill's conventions match `git log --oneline -20`)
- No references to removed/renamed concepts

Score each dimension 1-5. If any dimension is ≤2, that's the priority.

## Phase 2: Gap Analysis

Compare the skill against:

1. **Recent session failures** — `bun recall "<skill-name>"` — did sessions struggle with this skill?
2. **Memory feedback** — check `~/.claude/projects/-Users-beorn-Code-pim-km/memory/` for related feedback entries
3. **Peer skills** — read 2-3 similar skills (ours or external) for techniques we're missing
4. **CLAUDE.md references** — is the skill properly listed in the skills table?

List gaps as concrete TODOs.

## Phase 3: Fix Loop

For each gap, in priority order:

1. **Draft the fix** — write the new/changed section
2. **Verify accuracy** — if the fix references files/commands, confirm they exist/work
3. **Apply the edit** — update SKILL.md
4. **Spot-check** — re-read the surrounding section to ensure consistency

After all fixes, re-run the Phase 1 scoring. All dimensions should be ≥3.

## Phase 4: Regression Check

Run `/skill-test <skill-name>` if the changes were substantial (≥3 edits). This catches cases where a fix to one section breaks another.

## Phase 5: Report

```
SKILL: /[name]
BEFORE: Structure [N]/5, Specificity [N]/5, Freshness [N]/5
AFTER:  Structure [N]/5, Specificity [N]/5, Freshness [N]/5
CHANGES: [N] edits applied
  - [one-line summary of each change]
STALE REFS FIXED: [list of dead paths/commands updated]
NEEDS ATTENTION: [anything that couldn't be fixed automatically]
```

## When to Use

- After `/skill-test` finds issues
- Periodic maintenance (monthly skill hygiene)
- After a major refactor changes conventions
- When a skill hasn't been touched in 30+ days
- When sessions report confusion following a skill

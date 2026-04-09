---
description: Turn one-off work into repeatable skills, and audit existing skills for health. Use when you catch yourself doing something that will need to happen again, when the user asks for something a second time, or with 'review' to audit all skills.
argument-hint: [description of work to systematize] | review
---

# Systematize — No One-Off Work

**Keywords**: systematize, skill, automate, cron, recurring, codify, process

You are not allowed to do one-off work. If the user asks you to do something and it's the kind of thing that will need to happen again, you must turn it into a skill.

## The Rule

**If the user has to ask for something twice, you failed.** The first time is discovery. The second time means you should have already turned it into a skill.

## When to Trigger

- User says "can you do X" and X is repeatable
- You catch yourself doing ad-hoc work that follows a pattern
- A process involves 3+ steps that could be codified
- Something is done manually that could run on a schedule

## The Cycle

### 1. Concept
Describe the process in 2-3 sentences. What triggers it, what it produces, how often.

### 2. Prototype
Run it manually on 3-10 real items. No skill file yet. Capture what works and what doesn't.

### 3. Evaluate
Show the output to the user. Ask: "Is this what you want? What should change?" Revise based on feedback.

### 4. Codify
Write a `SKILL.md` file. Follow the format below.

### 5. Cron (if recurring)
If it should run automatically, schedule it. Use `/schedule` for remote triggers or local cron for lightweight checks.

### 6. Monitor
Check the first few automated runs. Iterate on the skill if output quality drops.

## Before Creating a New Skill

Skills must be MECE — each type of work has exactly one owner skill. No overlap, no gaps.

1. Check existing skills: `ls .claude/skills/`
2. Read any skill that might overlap
3. If an existing skill covers 70%+ of the work, **extend it** instead of creating a new one
4. If creating new, define the boundary clearly: "this skill handles X, /other-skill handles Y"

## Skill File Format

```markdown
---
description: One line — what it does, when to use it.
argument-hint: [args] — what the user passes
---

# Skill Name — Tagline

**Keywords**: trigger words for auto-detection

## When to Use
- Bullet list of trigger conditions

## Process
1. Step-by-step instructions
2. Include exact commands, file paths, expected outputs
3. Decision points with criteria

## Output
What the skill produces (files, beads, reports, commits)

## Schedule (if recurring)
How often, what triggers it, what to check
```

## Anti-Patterns

| Don't | Why |
|---|---|
| Create a skill for a truly one-time task | Not everything recurs — moving a file once isn't a skill |
| Create overlapping skills | MECE — one owner per process |
| Skip the prototype step | Codifying before testing produces bad skills |
| Forget the cron step | A skill nobody runs is just documentation |
| Make skills too narrow | "Update silvery-vs-ink.md" is too narrow; "Ink compat analysis" is right |
| Make skills too broad | "Do everything" isn't a skill |

## The System Compounds

Every conversation where the user says "can you do X" should end with X being a skill — not a memory of "they asked me to do X that one time."

Build it once, it runs forever.

---

## Mode: review

**Trigger**: `/systematize review` or quarterly health check.

Audit all existing skills against quality criteria. Produces a scorecard + action items.

### Process

1. **Enumerate all skills**
   ```bash
   ls .claude/skills/
   ```

2. **For each skill, read SKILL.md and score against these criteria:**

   | # | Criterion | Check | Score |
   |---|---|---|---|
   | 1 | **Has SKILL.md** | File exists with frontmatter (description, argument-hint) | PASS/FAIL |
   | 2 | **Has keywords** | Keywords section for auto-detection | PASS/WARN |
   | 3 | **Clear trigger** | "When to Use" section with concrete conditions | PASS/FAIL |
   | 4 | **Actionable process** | Step-by-step with commands, not vague guidance | PASS/WARN |
   | 5 | **Defined output** | States what it produces (files, beads, commits, reports) | PASS/WARN |
   | 6 | **No overlap (MECE)** | Doesn't duplicate another skill's scope | PASS/FAIL |
   | 7 | **No gaps** | Area it claims to cover is actually covered in the process | PASS/WARN |
   | 8 | **Referenced in CLAUDE.md** | Listed in the skills table in the project CLAUDE.md | PASS/WARN |
   | 9 | **Tested recently** | Evidence of use in recent sessions (`bun recall -k <skill> -s 2w`) | PASS/STALE |
   | 10 | **Not orphaned** | Skill references files/beads/tools that still exist | PASS/FAIL |

3. **Check for MECE violations** — look for skill pairs with overlapping scope:
   - Read both skills' "When to Use" sections
   - If a user request could reasonably trigger EITHER skill, that's an overlap
   - Classify: **merge** (combine into one), **split** (clarify boundary), or **ok** (different enough)

4. **Check for gaps** — processes that happen regularly but have no skill:
   - Review recent sessions: `bun recall -s 2w --raw | grep -i "manual\|ad-hoc\|one-off"` 
   - Check if any recurring user requests aren't covered by a skill
   - Check CLAUDE.md skills table — are there stale entries pointing to deleted skills?

5. **Check for staleness** — skills that haven't been used or updated:
   ```bash
   for skill in .claude/skills/*/SKILL.md; do
     echo "$(git log -1 --format='%ar' -- "$skill") — $skill"
   done | sort
   ```
   Skills not modified in >3 months AND not invoked in >2 weeks are candidates for archival.

### Report format

```markdown
## Skill System Review — {DATE}

### Summary
- Total skills: N
- Passing: N
- Warnings: N
- Failures: N
- Overlaps found: N
- Gaps found: N
- Stale skills: N

### Scorecard
| Skill | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Issues |
|---|---|---|---|---|---|---|---|---|---|---|---|
| /big | ✓ | ✓ | ✓ | ✓ | W | ✓ | ✓ | ✓ | ✓ | ✓ | No defined output |
| /foo | ✓ | ✗ | ... | | | | | | | | ... |

### MECE Violations
1. **/big vs /fresh** — overlap on "stuck on a problem". Boundary: /big = proactive reframe, /fresh = reactive unstuck. OK (documented in /big).
2. **/audit vs /review-all** — both claim "comprehensive health check". MERGE recommended.

### Gaps
1. "Architectural deep-dive → design doc" has no skill. Today's signals analysis was ad-hoc. → Create /arch-eval or extend /big.

### Stale
1. **/foo** — last modified 4 months ago, no invocations in recall. → Archive or refresh.

### Actions
- [ ] Merge /audit into /review-all (or vice versa)
- [ ] Add keywords to /bar
- [ ] Archive /baz
- [ ] Create skill for gap: ...
```

### Schedule

Run quarterly, or after creating 5+ new skills in a short period. Add to `/review-all` checklist if it exists.

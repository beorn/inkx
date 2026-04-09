---
description: Turn one-off work into repeatable skills. Use when you catch yourself doing something that will need to happen again, or when the user asks for something a second time.
argument-hint: [description of work to systematize]
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

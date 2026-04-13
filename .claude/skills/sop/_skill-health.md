# Skill Health Check

Referenced by SKILL.md §6 (infra domain). Audit the skill directory for MECE violations, staleness, and dead artifacts.

## Process

### 1. Enumerate all skills
```bash
ls .claude/skills/
```

### 2. Score each skill against criteria

| # | Criterion | Check | Score |
|---|---|---|---|
| 1 | **Has SKILL.md** | File exists with frontmatter (description, argument-hint) | PASS/FAIL |
| 2 | **Clear trigger** | "When to Use" or description with concrete conditions | PASS/FAIL |
| 3 | **Actionable process** | Step-by-step with commands, not vague guidance | PASS/WARN |
| 4 | **No overlap (MECE)** | Doesn't duplicate another skill's scope | PASS/FAIL |
| 5 | **Referenced in CLAUDE.md** | Listed in the skills table | PASS/WARN |
| 6 | **No dead stubs** | Not a one-liner redirect to another skill | PASS/FAIL |
| 7 | **Not stale** | Modified or invoked within last 3 months | PASS/STALE |

### 3. Check for MECE violations

If a user request could reasonably trigger two skills, that's an overlap. Classify: **merge** (combine), **split** (clarify boundary), or **ok** (different enough).

### 4. Check for dead artifacts

```bash
# Find one-liner redirect stubs
for skill in .claude/skills/*/SKILL.md; do
  lines=$(wc -l < "$skill")
  if [ "$lines" -lt 15 ]; then
    echo "STUB? ($lines lines) — $skill"
  fi
done
```

**Rule: delete absorbed skill directories immediately.** CLAUDE.md ~~strikethrough~~ entries are the redirect — stubs are dead weight.

### 5. Check for staleness

```bash
for skill in .claude/skills/*/SKILL.md; do
  echo "$(git log -1 --format='%ar' -- "$skill") — $skill"
done | sort
```

Skills not modified in >3 months AND not invoked in >2 weeks are candidates for archival.

### 6. Check for gaps

Review recent sessions for ad-hoc work that should be a skill:
```bash
bun recall -s 2w --raw | grep -i "manual\|ad-hoc\|one-off"
```

## Creating new skills

If a process involves 3+ steps and will recur, it should be a skill. Before creating:

1. Check if an existing skill covers 70%+ of the work — extend it instead
2. Define the boundary clearly: "this skill handles X, /other-skill handles Y"
3. Follow the SKILL.md format: frontmatter, keywords, process, output

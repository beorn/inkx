---
description: Audit Claude steering docs for token efficiency, hierarchy, and progressive disclosure
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion
---

# Steering Documentation Audit

**Keywords**: claude review, audit skills, token efficiency, steering docs

Audit Claude Code configuration for token efficiency and proper structure.

## Layer Model

**Why this matters**: CLAUDE.md loads every message (~4 tokens/line = ~240 tokens for 60 lines). Skills load on-demand (<5k tokens when activated). Keeping CLAUDE.md small saves thousands of tokens per session.

| Layer              | Loads           | Frequency | Target    | Contains                  |
| ------------------ | --------------- | --------- | --------- | ------------------------- |
| CLAUDE.md          | Every message   | Always    | <60 lines | Commands, skills table    |
| skills/\*/SKILL.md | On `/domain`    | Often     | 50-70     | Quick ref, sub-file links |
| skills/_/_.md      | On demand       | Varies    | 80-150    | Full workflows            |
| docs/\*.md         | When referenced | Rare      | Any       | Rationale, history        |

**Frequency-based exceptions**: Infrequently-run workflows (monthly audits, setup tasks) can exceed line targets. The cost is paid rarely. Focus optimization on:

1. CLAUDE.md (strict - loads every message)
2. SKILL.md entry points (strict - loads on domain access)
3. Frequently-used sub-files (e.g., commit workflow)

## Execute (Parallel First)

### Step 1: Gather Metrics (4 Bash in parallel)

```bash
# 1. CLAUDE.md size
wc -l CLAUDE.md

# 2. All skill files with line counts
find .claude/skills -name "*.md" -exec wc -l {} \; | sort -rn

# 3. Orphan files (not linked from SKILL.md)
for f in .claude/skills/*/*.md; do
  [[ $(basename "$f") == "SKILL.md" ]] && continue
  dir=$(dirname "$f")
  grep -q "$(basename "$f")" "$dir/SKILL.md" 2>/dev/null || echo "ORPHAN: $f"
done

# 4. Keywords overlap check
grep -h "^\*\*Keywords\*\*:" .claude/skills/*/SKILL.md | \
  sed 's/.*: //' | tr ',' '\n' | sort | uniq -c | sort -rn | head -10
```

### Step 2: Session Error Analysis (parallel)

Run [session-errors.md](session-errors.md) workflow simultaneously:

- Errors → docs that need "Common Mistakes" sections
- Dead docs → lines to remove

### Step 3: Evaluate Against Checklist

| Check                 | Pass                  | Fail                      |
| --------------------- | --------------------- | ------------------------- |
| CLAUDE.md <60 lines   | ✓                     | Move to skill (strict)    |
| SKILL.md 50-70 lines  | Has sub-file table    | Monolithic (strict)       |
| Sub-files <150 lines  | Focused workflow      | Split (unless infrequent) |
| No orphan sub-files   | All linked from SKILL | Dead file                 |
| No keyword overlap    | Unique per domain     | Confusing auto-load       |
| Skills point to docs/ | Rationale in docs/    | Inline explanations       |

### Step 4: Propose Changes

For each issue, draft Edit operations:

| Issue Type      | Action                                |
| --------------- | ------------------------------------- |
| Over line limit | Split into sub-files                  |
| Dead docs       | Remove (from session-errors analysis) |
| Missing section | Add "Common Mistakes" table           |
| Orphan file     | Link from SKILL.md or delete          |

## Output Format

```markdown
## Audit Summary

| Metric           | Current | Target | Status |
| ---------------- | ------- | ------ | ------ |
| CLAUDE.md        | X lines | <60    | ✓/✗    |
| Largest skill    | X lines | <150   | ✓/✗    |
| Orphan files     | X       | 0      | ✓/✗    |
| Keyword overlaps | X       | 0      | ✓/✗    |

## Issues Found

| Priority | File | Issue      | Action          |
| -------- | ---- | ---------- | --------------- |
| P1       | X.md | 200 lines  | Split           |
| P2       | Y.md | Not linked | Add to SKILL.md |

## Session Errors (from session-errors.md)

[Include error summary and dead doc findings]

## Proposed Edits

[Edit tool calls to make]
```

## Reference

For detailed rules on skill structure, see [review-reference.md](review-reference.md).

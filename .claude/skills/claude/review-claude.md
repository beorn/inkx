---
description: Audit Claude steering docs for token efficiency, hierarchy, and progressive disclosure
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion
---

# Steering Documentation Audit

**Keywords**: claude review, audit skills, token efficiency, steering docs

Audit Claude Code configuration for token efficiency and proper structure.

**Reference**: [Anthropic Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**Note**: Our targets are optimization recommendations beyond Anthropic's official minimums (<500 lines for SKILL.md).

## Layer Model

**Official token costs** (from Anthropic):

- Metadata scan: ~100 tokens per skill (name + description only)
- Skill activation: <5,000 tokens when loaded
- CLAUDE.md: ~4 tokens/line, loads every message

**Why this matters**: CLAUDE.md loads every message (~240 tokens for 60 lines). Skills load on-demand (<5k tokens when activated). Keeping CLAUDE.md small saves thousands of tokens per session.

| Layer              | Loads           | Frequency | Official Limit | Our Target | Contains                  |
| ------------------ | --------------- | --------- | -------------- | ---------- | ------------------------- |
| CLAUDE.md          | Every message   | Always    | N/A            | <60 lines  | Commands, skills table    |
| skills/\*/SKILL.md | On `/domain`    | Often     | <500 lines     | 50-70      | Quick ref, sub-file links |
| skills/_/_.md      | On demand       | Varies    | <500 lines     | 80-150     | Full workflows            |
| docs/\*.md         | When referenced | Rare      | N/A            | Any        | Rationale, history        |

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

| Check                             | Pass                        | Fail                      |
| --------------------------------- | --------------------------- | ------------------------- |
| **Official limits**               |                             |                           |
| SKILL.md <500 lines               | ✓                           | Split (required)          |
| **Our optimizations**             |                             |                           |
| CLAUDE.md <60 lines               | ✓                           | Move to skill (strict)    |
| Entry points 50-70 lines          | Has sub-file table          | Monolithic (strict)       |
| Sub-files <150 lines              | Focused workflow            | Split (unless infrequent) |
| Files >100 lines have ToC         | ✓                           | Add table of contents     |
| **Structure**                     |                             |                           |
| No orphan sub-files               | All linked from SKILL       | Dead file                 |
| No deeply nested references       | Max 1 level from SKILL.md   | Flatten structure         |
| **Discovery**                     |                             |                           |
| Skill names use gerund form       | "testing-code", "analyzing" | Rename to gerund          |
| Descriptions are third person     | "Tests code", not "I test"  | Rewrite in third person   |
| Descriptions include "when"       | "Use when testing..."       | Add usage triggers        |
| No keyword overlap                | Unique per domain           | Confusing auto-load       |
| **Content**                       |                             |                           |
| No assumptions about Claude       | Concise, assumes knowledge  | Remove explanations       |
| Skills point to docs/             | Rationale in docs/          | Inline explanations       |
| Workflows use checkbox pattern    | `- [ ] Step 1`              | Add tracking checkboxes   |
| Frequently-used skills have evals | Test scenarios exist        | Create evaluations        |

### Step 4: Propose Changes

For each issue, draft Edit operations:

| Issue Type           | Action                                |
| -------------------- | ------------------------------------- |
| Over line limit      | Split into sub-files                  |
| Dead docs            | Remove (from session-errors analysis) |
| Missing section      | Add "Common Mistakes" table           |
| Orphan file          | Link from SKILL.md or delete          |
| Missing evaluations  | Create test scenarios (see below)     |
| No workflow tracking | Add checkbox pattern (see below)      |

**Evaluation-driven development**: For frequently-used skills, create test scenarios that validate the skill solves real problems. Example:

```json
{
  "skills": ["testing-code"],
  "query": "Run the fast tests and show me the results",
  "expected_behavior": [
    "Executes bun run test:fast command",
    "Shows test output with pass/fail status",
    "Identifies any failing tests"
  ]
}
```

**Workflow checklist pattern**: For multi-step workflows, add tracking checkboxes:

````markdown
## Commit workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Run git status and git diff
- [ ] Step 2: Draft commit message
- [ ] Step 3: Stage files and commit
- [ ] Step 4: Verify with git status
```
````

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

## Retrospective: Steering Docs Evolution

After completing the steering docs audit, analyze patterns to continuously improve Claude Code configuration.

### 1. Pattern Recognition

Review audit findings to identify systemic issues:

**Key questions:**

- Which layer (CLAUDE.md, SKILL.md, sub-files, docs/) had most issues?
- Were issues about size, structure, discovery, or content quality?
- Did session errors reveal docs that confuse Claude?
- Were problems isolated or symptoms of structural issues?

### 2. Root Cause Analysis

For each major pattern, identify the underlying cause:

| Pattern Example            | Root Cause Hypothesis       | Evidence/Context                         |
| -------------------------- | --------------------------- | ---------------------------------------- |
| CLAUDE.md over 60 lines    | Feature creep over time     | Multiple additions, no removals          |
| Large SKILL.md files       | Monolithic design           | No sub-file split, all content in entry  |
| Orphan sub-files           | Refactoring without cleanup | Moved content but didn't delete old      |
| Keyword overlap            | Unclear domain boundaries   | Similar skills need better separation    |
| Missing "when" in desc     | Copied old patterns         | Skills created before guidelines update  |
| Session errors on specific | Unclear instructions        | Same misinterpretation happened 3+ times |
| Dead docs referenced       | No usage tracking           | Docs exist but Claude never loads them   |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Structural improvements:**

- Split monolithic SKILL.md files into focused sub-files
- Remove orphan files and update links
- Clarify domain boundaries (merge or split overlapping skills)
- Add missing table of contents to files >100 lines

**Discovery improvements:**

- Fix skill descriptions to include "when to use" clauses
- Remove keyword overlap across domains
- Update metadata to use gerund form for skill names
- Add missing argument-hint fields for clarity

**Content quality:**

- Add "Common Mistakes" sections based on session errors
- Remove dead docs that Claude never loads
- Update workflows based on frequency (strict for common, relaxed for rare)
- Add evaluation scenarios for frequently-used skills

**Token efficiency:**

- Move CLAUDE.md overflow content to skills
- Remove redundant instructions that tools can enforce
- Replace inline examples with file:line references
- Consolidate similar workflows across skills

### 4. Metrics Tracking

Compare before/after metrics:

| Metric                    | Before | After | Target |
| ------------------------- | ------ | ----- | ------ |
| CLAUDE.md lines           | X      | Y     | <60    |
| Files over limit          | X      | Y     | 0      |
| Orphan files              | X      | Y     | 0      |
| Keyword overlaps          | X      | Y     | 0      |
| Skills without "when"     | X      | Y     | 0      |
| Session error rate        | X%     | Y%    | <5%    |
| Avg tokens per activation | X      | Y     | <4000  |

### 5. Session Error Analysis Integration

If running with [session-errors.md](session-errors.md) in parallel:

**Cross-reference findings:**

- Errors → Missing "Common Mistakes" sections (add to skills)
- Repeated confusion → Ambiguous instructions (rewrite for clarity)
- Dead docs → Never loaded (safe to delete or archive)
- High-cost sessions → CLAUDE.md bloat (move content to skills)

**Priority ranking:**

1. **P0**: Session errors causing incorrect behavior (fix immediately)
2. **P1**: Token bloat in CLAUDE.md (loads every message)
3. **P2**: SKILL.md files over official limit (<500 lines)
4. **P3**: Structural issues (orphans, missing ToC, keyword overlap)
5. **P4**: Optimization opportunities (infrequent workflows can exceed targets)

### 6. Create Process Improvement Beads (Optional)

For significant improvements identified:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Fix session errors
bd create --id "km-proc-claude-errors-$DATE_SUFFIX" --type=task --priority=1 \
  --title="Fix top 3 Claude session error patterns" \
  --body="Add clarity to X, Y, Z based on session error analysis"

# Example: Token optimization
bd create --id "km-proc-claude-tokens-$DATE_SUFFIX" --type=task --priority=2 \
  --title="Reduce CLAUDE.md to <60 lines" \
  --body="Move X section to skill, delete Y redundant content, reference Z by file:line"

# Example: Structural cleanup
bd create --id "km-proc-claude-cleanup-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Remove orphan docs and fix links" \
  --body="Delete X files, update Y links in SKILL.md, add Z to .gitignore if needed"
```

### 7. Update Review Workflows

If the audit revealed gaps in the review process itself:

**Update [review-claude.md](review-claude.md):**

- Add new checks to Step 1 metrics (e.g., "Check for inline code examples >10 lines")
- Improve checklist with newly discovered anti-patterns
- Add automated detection for common issues (e.g., grep for missing "when" clauses)

**Update [review-reference.md](review-reference.md):**

- Add new best practices discovered
- Document examples of good/bad patterns found in the wild
- Update token economics based on real measurements

**Update [session-errors.md](session-errors.md) if it exists:**

- Add new error patterns discovered
- Improve categorization based on root causes
- Add automated pattern detection for common errors

Make edits directly or create process improvement beads to track changes.

**This creates a continuous improvement loop for Claude Code configuration effectiveness.**

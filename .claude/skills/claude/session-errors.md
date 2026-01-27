---
description: Analyze Claude session histories for command invocation errors and documentation gaps
allowed-tools: Task, Bash, Read, Edit, AskUserQuestion
---

# Session Error Analysis

**Keywords**: session errors, command mistakes, invocation errors, learning from history

Analyze past Claude sessions to find systematic command invocation errors and propose documentation fixes.

## Overview

Uses shell pipelines to extract errors from JSONL session files, then proposes skill/CLAUDE.md updates.

## Instructions

### Step 1: Extract Errors (Parallel Shell)

Run these **4 Bash commands in parallel** (single message):

```bash
# 1. Unknown flags/options
rg -o '"(unknown flag|invalid option|unrecognized option)[^"]*"' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  sort | uniq -c | sort -rn | head -20

# 2. Command not found
rg -o '"(command not found|not found in PATH)[^"]*"' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  sort | uniq -c | sort -rn | head -20

# 3. Bash syntax errors
rg -o '"(syntax error|unexpected token|parse error)[^"]*"' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  sort | uniq -c | sort -rn | head -20

# 4. Tool-specific errors (bd, km, peekaboo)
rg -o '"(bd|km|peekaboo)[^"]*error[^"]*"' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  sort | uniq -c | sort -rn | head -20
```

### Step 2: Get Context for Top Errors

For errors with count ≥3, extract surrounding context:

```bash
# Example: find context around "unknown flag --note"
rg -B2 -A2 'unknown flag.*--note' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl | head -50
```

### Step 3: Categorize & Map to Docs

| Category       | Pattern              | Fix Location         |
| -------------- | -------------------- | -------------------- |
| bd flag errors | `bd <cmd> --<wrong>` | skills/pm/bd.md      |
| km flag errors | `km <cmd> --<wrong>` | skills/tui/SKILL.md  |
| Bash syntax    | Newlines, quoting    | CLAUDE.md            |
| Missing PATH   | `cmd` → `bun cmd`    | CLAUDE.md            |
| macOS vs GNU   | GNU flags on macOS   | CLAUDE.md            |
| MCP params     | Wrong param names    | skills/claude/mcp.md |

### Step 4: Propose Fixes

For each category with ≥3 errors:

1. Read the target skill/doc file
2. Draft a "Common Mistakes" table
3. Present diff to user for approval

## Output Format

```markdown
## Session Analysis Summary

Scanned: ~/.claude/projects/-Users-beorn-Code-pim-km/
Sessions: N files

### Top Errors by Category

| Category    | Count | Example               | Fix       |
| ----------- | ----- | --------------------- | --------- |
| bd flags    | 62    | `--note` → `--reason` | pm/bd.md  |
| Bash syntax | 42    | Newlines in commands  | CLAUDE.md |

### Proposed Edits

[Show Edit tool calls to make]
```

## Dead Documentation Detection

Find documented commands/patterns that are never used (candidates for pruning).

### Step 5: Extract Documented Commands (Parallel Shell)

Run in parallel:

```bash
# 1. Commands from CLAUDE.md code blocks
rg -o '`[a-z]+ [^`]+`' CLAUDE.md | sed 's/`//g' | cut -d' ' -f1-2 | sort -u

# 2. Commands from pm/bd.md
rg -o '`bd [a-z]+[^`]*`' .claude/skills/pm/*.md | sed 's/.*`//;s/`//' | \
  cut -d' ' -f1-2 | sort -u

# 3. Commands from other key skills
rg -o '`bun [^`]+`' .claude/skills/*/*.md | sed 's/.*`//;s/`//' | \
  cut -d' ' -f1-3 | sort -u
```

### Step 6: Check Usage in Sessions

For each documented command, count actual usage:

```bash
# Example: check if "bd ready" is ever used
rg -c '"bd ready' ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  awk -F: '{sum+=$2} END {print sum ? sum : 0}'
```

Batch check (outputs command + count):

```bash
# Check multiple commands at once
for cmd in "bd ready" "bd list --json" "bun run test:fast"; do
  count=$(rg -c "\"$cmd" ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
    awk -F: '{sum+=$2} END {print sum ? sum : 0}')
  echo "$count\t$cmd"
done | sort -rn
```

### Step 7: Flag for Pruning

| Usage Count | Action                  |
| ----------- | ----------------------- |
| 0           | Remove from docs (dead) |
| 1-2         | Review - maybe outdated |
| 3+          | Keep - actively used    |

## Output Format (with Pruning)

Add to summary:

```markdown
### Dead Documentation (0 uses)

| Command/Pattern   | Location     | Action |
| ----------------- | ------------ | ------ |
| `bd ready --type` | pm/bd.md:87  | Remove |
| `bun km tasks`    | CLAUDE.md:12 | Remove |

### Low Usage (1-2 uses)

| Command/Pattern | Uses | Location    | Action |
| --------------- | ---- | ----------- | ------ |
| `bd list --all` | 2    | pm/bd.md:38 | Review |
```

## Quick One-Liner

Count all error types in one command:

```bash
rg -c '(unknown flag|invalid option|command not found|syntax error)' \
  ~/.claude/projects/-Users-beorn-Code-pim-km/*.jsonl 2>/dev/null | \
  awk -F: '{sum+=$2} END {print "Total errors:", sum}'
```

---
description: Audit Claude steering docs for token efficiency, hierarchy, and progressive disclosure
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion
---

# Steering Documentation Audit

Audit Claude Code configuration for token efficiency and proper hierarchical structure.

## Token Economics

**Official numbers** (from [Claude Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)):

| Stage                     | Token Cost                          |
| ------------------------- | ----------------------------------- |
| Discovery (metadata scan) | ~100 tokens per skill               |
| Activation (full load)    | <5,000 tokens                       |
| Description budget        | 15,000 characters total             |
| CLAUDE.md                 | ~4 tokens/line, loads every message |

Skills inject two messages:

- Message 1 (metadata): ~50-200 chars, visible in UI
- Message 2 (skill prompt): full content, hidden via `isMeta: true`

**Our targets** (stricter than general guidance):

- CLAUDE.md: <60 lines (pointers only)
- SKILL.md entry points: 50-70 lines
- Sub-files: 80-150 lines

## Required Architecture

### Layer Model

| Layer              | Loads           | Target       | Contains                     |
| ------------------ | --------------- | ------------ | ---------------------------- |
| CLAUDE.md          | Always          | <60 lines    | Skills table, stack, rules   |
| skills/\*/SKILL.md | On `/domain`    | 50-70 lines  | Quick ref, sub-file pointers |
| skills/_/_.md      | On demand       | 80-150 lines | Full workflows               |
| docs/\*.md         | When referenced | Any          | Rationale, history           |

### Domain Structure

Skills MUST be organized into domains with progressive disclosure:

```
.claude/skills/
├── <domain>/
│   ├── SKILL.md       # Entry point (~60 lines)
│   ├── workflow1.md   # Detail (~100 lines)
│   ├── workflow2.md   # Detail (~100 lines)
│   ├── scripts/       # Executable Python/Bash
│   ├── references/    # Docs for context loading
│   └── assets/        # Templates, binaries (not loaded)
├── standalone.md      # Small, single-purpose (~80 lines)
```

| Directory     | Content Type | Loading Pattern           |
| ------------- | ------------ | ------------------------- |
| `scripts/`    | Python/Bash  | Bash tool execution       |
| `references/` | Text docs    | Read tool loads on demand |
| `assets/`     | Templates    | Referenced by path only   |

**Domain examples**: `testing/`, `review/`, `tui/`, `pm/`, `git/`, `claude/`

**Standalone OK when**: Single workflow, <100 lines, no natural grouping

### Progressive Disclosure Pattern

SKILL.md entry points MUST contain:

1. **Frontmatter**: description, argument-hint, allowed-tools
2. **Keywords**: Terms that trigger auto-loading
3. **Quick reference**: Tables/commands for common ops
4. **Sub-file table**: When to load each detail file

Sub-files contain: Full workflows, code examples, error recovery

### Frontmatter Fields

| Field                      | Required | Purpose                                   |
| -------------------------- | -------- | ----------------------------------------- |
| `description`              | Yes      | Skill matching via language understanding |
| `argument-hint`            | No       | Shows usage hint in help output           |
| `allowed-tools`            | No       | Scope permissions (prefer narrow)         |
| `name`                     | No       | Explicit skill identifier                 |
| `version`                  | No       | Versioning for tracking changes           |
| `disable-model-invocation` | No       | Prevent auto-invoke (reference-only)      |
| `model`                    | No       | Override model selection                  |

### Content Template (Sub-files)

Workflow sub-files should follow this structure:

```markdown
# [Brief Purpose - 1-2 sentences]

## Overview

[What/when/why]

## Prerequisites

[Required context]

## Instructions

### Step 1-N: [Action names]

[Imperative instructions]

## Output Format

[Result structure]

## Error Handling

[Failure procedures]

## Examples

[Concrete usage]
```

### Tool Permission Scoping

Scope `allowed-tools` narrowly:

| Good              | Bad           | Why                             |
| ----------------- | ------------- | ------------------------------- |
| `Bash(git:*)`     | `Bash`        | Limits to git commands only     |
| `Bash(bun test*)` | `Bash(bun:*)` | Only test commands, not all bun |
| `Read, Grep`      | `*`           | Explicit read-only              |

Use wildcards judiciously. Only include tools the skill actually needs.

### Path Handling

For skills that reference bundled files, use `{baseDir}` placeholder:

```markdown
Read the template at `{baseDir}/assets/template.md`
```

This ensures portability across different installations.

## Audit Checklist

### 1. CLAUDE.md (<60 lines)

Ask in order—first "yes" wins:

| Question                    | Action                 |
| --------------------------- | ---------------------- |
| Can a tool enforce this?    | Delete (use ESLint/TS) |
| Is it a code snippet?       | Delete (use file:line) |
| Task-specific workflow?     | Move to skill          |
| Reference material?         | Move to docs/          |
| Causes mistakes if removed? | Keep                   |

**Required sections only:**

- Commands (quick reference)
- Stack summary (1 line)
- Skills table (with links)
- Session rules (if any)

### 2. Domain Organization

Check `.claude/skills/` structure:

| Check                           | Pass                                | Fail                                |
| ------------------------------- | ----------------------------------- | ----------------------------------- |
| Grouped into domains?           | `testing/SKILL.md`                  | `testing.md` at root with 200 lines |
| SKILL.md has sub-file pointers? | "Load [visual.md] for TUI testing"  | Monolithic skill                    |
| Related skills together?        | `review/code.md`, `review/types.md` | `review-code.md`, `review-types.md` |
| Standalone justified?           | Small (<100), no grouping           | Large file at root                  |

**Red flags:**

- Multiple skills with `review-*` prefix but no `review/` domain
- Skills >150 lines not split
- Similar keywords across unrelated skills

### 3. SKILL.md Entry Points (50-70 lines)

Each SKILL.md needs:

| Element               | Example                                            |
| --------------------- | -------------------------------------------------- |
| Frontmatter           | `description:`, `argument-hint:`, `allowed-tools:` |
| Keywords line         | `**Keywords**: test, TDD, visual`                  |
| Quick reference table | Commands/actions summary                           |
| Sub-file table        | "When to load" with links                          |
| NO full workflows     | Those go in sub-files                              |

**Size check:**

- <50 lines: Missing content
- 50-70 lines: Good
- > 70 lines: Move detail to sub-file

### 4. Sub-Files (80-150 lines)

| Check                   | Pass         | Fail               |
| ----------------------- | ------------ | ------------------ |
| Size appropriate?       | 80-150 lines | >200 lines         |
| Linked from SKILL.md?   | Yes          | Orphan file        |
| Contains full workflow? | Yes          | Just bullet points |
| Has error recovery?     | Yes          | Happy path only    |

### 5. Cross-References

| Check                  | Pass                      | Fail             |
| ---------------------- | ------------------------- | ---------------- |
| Skills point to docs?  | `[docs/testing.md]`       | Rationale inline |
| Related skills linked? | "See also: /review types" | Siloed           |
| No duplicate content?  | Single source             | Copy-paste drift |

### 6. Keyword Hygiene

Review **Keywords** lines in SKILL.md files:

- Too broad ("error", "help") = loads when irrelevant
- Too narrow = never auto-loads
- Overlap between domains = confusing

## Deliverable Format

```markdown
## Summary

| Metric           | Current               | Target | Status |
| ---------------- | --------------------- | ------ | ------ |
| CLAUDE.md lines  | X                     | <60    | ✓/✗    |
| Domain coverage  | X/Y skills in domains | 100%   | ✓/✗    |
| Largest skill    | X lines               | <150   | ✓/✗    |
| Orphan sub-files | X                     | 0      | ✓/✗    |

## Structure Analysis

### Domains

| Domain   | SKILL.md | Sub-files | Status |
| -------- | -------- | --------- | ------ |
| testing/ | 60 lines | 3 files   | ✓      |
| review/  | 55 lines | 4 files   | ✓      |

### Standalone Skills

| Skill      | Lines | Should be domain?   |
| ---------- | ----- | ------------------- |
| logging.md | 80    | No - single purpose |

### Issues

1. **Critical**: [issue]
2. **High**: [issue]

### Recommendations

| Priority | File        | Action             | Impact              |
| -------- | ----------- | ------------------ | ------------------- |
| P1       | skills/x.md | Split into domain/ | -300 tokens/session |
```

## Execute

1. Read CLAUDE.md, count lines
2. List skills structure: `ls -la .claude/skills/*/`
3. Check each SKILL.md has sub-file pointers
4. Flag violations against checklist
5. Present findings with recommendations

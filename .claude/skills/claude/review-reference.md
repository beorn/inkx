---
description: Reference material for steering doc audits - architecture, token economics, templates
disable-model-invocation: true
---

# Steering Docs Reference

Detailed rules for `/claude review`. Load only when needed for specific guidance.

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

## Domain Structure

```
.claude/skills/
├── <domain>/
│   ├── SKILL.md       # Entry point (~60 lines)
│   ├── workflow1.md   # Detail (~100 lines)
│   ├── scripts/       # Executable Python/Bash
│   ├── references/    # Docs for context loading
│   └── assets/        # Templates, binaries (not loaded)
├── standalone.md      # Small, single-purpose (<100 lines)
```

| Directory     | Content Type | Loading Pattern           |
| ------------- | ------------ | ------------------------- |
| `scripts/`    | Python/Bash  | Bash tool execution       |
| `references/` | Text docs    | Read tool loads on demand |
| `assets/`     | Templates    | Referenced by path only   |

**Standalone OK when**: Single workflow, <100 lines, no natural grouping

## SKILL.md Requirements

Entry points MUST contain:

1. **Frontmatter**: description, argument-hint, allowed-tools
2. **Keywords**: Terms that trigger auto-loading
3. **Quick reference**: Tables/commands for common ops
4. **Sub-file table**: When to load each detail file

Sub-files contain: Full workflows, code examples, error recovery

## Frontmatter Fields

| Field                      | Required | Purpose                                   |
| -------------------------- | -------- | ----------------------------------------- |
| `description`              | Yes      | Skill matching via language understanding |
| `argument-hint`            | No       | Shows usage hint in help output           |
| `allowed-tools`            | No       | Scope permissions (prefer narrow)         |
| `disable-model-invocation` | No       | Prevent auto-invoke (reference-only)      |

## Tool Permission Scoping

| Good              | Bad           | Why                             |
| ----------------- | ------------- | ------------------------------- |
| `Bash(git:*)`     | `Bash`        | Limits to git commands only     |
| `Bash(bun test*)` | `Bash(bun:*)` | Only test commands, not all bun |
| `Read, Grep`      | `*`           | Explicit read-only              |

## Content Template (Sub-files)

```markdown
# [Brief Purpose]

## Overview

[What/when/why]

## Instructions

### Step 1-N: [Action names]

[Imperative instructions]

## Output Format

[Result structure]

## Error Handling

[Failure procedures]
```

## CLAUDE.md Decision Tree

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

---
description: Reference material for steering doc audits - architecture, token economics, templates
disable-model-invocation: true
---

# Steering Docs Reference

Detailed rules for `/claude review`. Load only when needed for specific guidance.

**Official best practices**: <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>

**Note**: Our targets are stricter optimizations beyond Anthropic's official minimums.

## Token Economics

**Official numbers** (from Anthropic best practices):

| Stage                     | Token Cost                          | Notes                      |
| ------------------------- | ----------------------------------- | -------------------------- |
| Discovery (metadata scan) | ~100 tokens per skill               | Name + description only    |
| Activation (full load)    | <5,000 tokens                       | When skill is triggered    |
| SKILL.md body limit       | <500 lines                          | Official maximum           |
| Description field         | 1024 chars max                      | Must include "when" to use |
| CLAUDE.md                 | ~4 tokens/line, loads every message | Strict optimization target |

**Progressive disclosure**: Skills inject content on-demand via filesystem reads. Only activated skills consume context tokens.

## Domain Structure

```text
.claude/skills/
├── <domain>/
│   ├── SKILL.md       # Entry point (<500 official, ~60 our target)
│   ├── workflow1.md   # Detail (<500 official, ~100 our target)
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

### Naming Conventions

Use **gerund form** (verb + -ing) for skill names:

- ✓ Good: `testing-code`, `processing-pdfs`, `analyzing-data`
- ✗ Avoid: `test-helper`, `pdf-utils`, `data-tools`

**Rules**: Lowercase letters, numbers, hyphens only. No "anthropic" or "claude" in names.

### Description Format

**Must be third person** and include "when to use":

- ✓ Good: "Tests code and reports failures. Use when running tests or checking code quality."
- ✗ Avoid: "I can help you test code" (first person)
- ✗ Avoid: "You can use this to test code" (second person)
- ✗ Avoid: "Tests code" (missing "when" context)

Max 1024 characters. Include key terms for discovery.

### Table of Contents

For files >100 lines, add ToC at top:

```markdown
# File Title

## Contents

- Section 1
- Section 2
- Section 3

## Section 1

...
```

Enables Claude to see full scope even when previewing with partial reads.

## Frontmatter Fields

| Field                      | Required | Purpose                                   | Notes                          |
| -------------------------- | -------- | ----------------------------------------- | ------------------------------ |
| `name`                     | Yes      | Skill identifier (max 64 chars)           | Gerund form, lowercase+hyphens |
| `description`              | Yes      | Skill matching via language understanding | Third person, include "when"   |
| `argument-hint`            | No       | Shows usage hint in help output           | e.g., `[file-path]`            |
| `allowed-tools`            | No       | Scope permissions (prefer narrow)         | See Tool Permission Scoping    |
| `disable-model-invocation` | No       | Prevent auto-invoke (reference-only)      | For reference docs             |

## Tool Permission Scoping

| Good              | Bad           | Why                             |
| ----------------- | ------------- | ------------------------------- |
| `Bash(git:*)`     | `Bash`        | Limits to git commands only     |
| `Bash(bun test*)` | `Bash(bun:*)` | Only test commands, not all bun |
| `Read, Grep`      | `*`           | Explicit read-only              |

## Reference Structure

**Avoid deeply nested references** - Keep all references one level deep from SKILL.md:

- ✓ Good: SKILL.md → advanced.md (direct reference)
- ✓ Good: SKILL.md → reference.md (direct reference)
- ✗ Bad: SKILL.md → advanced.md → details.md (too deep)

**Why**: Claude may partially read nested files (e.g., `head -100`), resulting in incomplete information. Direct references from SKILL.md ensure complete file loads.

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

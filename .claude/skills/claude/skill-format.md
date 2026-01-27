---
description: Create and format slash commands (skills)
---

# Slash Command Format

**Keywords**: create command, slash command, /command format

## File Location

Skills go in `.claude/skills/`:

- Domain skills: `.claude/skills/<domain>/SKILL.md` with sub-files
- Standalone: `.claude/skills/<name>.md`

## Basic Format

```markdown
---
description: Brief description (required)
argument-hint: [arg1] [arg2]           # Shows in help
allowed-tools: Task, Read, Bash        # Restrict tools (optional)
model: claude-3-5-haiku-20241022       # Force model (optional)
---

# Skill Title

Instructions for Claude.

Use $ARGUMENTS for all args, or $1, $2 for positional.

**Keywords**: terms that trigger auto-loading
```

## Frontmatter Fields

| Field                      | Required | Purpose                  |
| -------------------------- | -------- | ------------------------ |
| `description`              | Yes      | Shows in /help menu      |
| `argument-hint`            | No       | Usage hint in help       |
| `allowed-tools`            | No       | Restrict available tools |
| `model`                    | No       | Force specific model     |
| `context: fork`            | No       | Run in sub-agent         |
| `disable-model-invocation` | No       | Prevent auto-invoke      |

## Dynamic Content

**Embed bash output** with `!`:

```markdown
Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5`
```

**Include file contents** with `@`:

```markdown
Review the code in @src/index.ts against @specs/design.md
```

## Example: Security Review Command

```markdown
---
description: Security-focused code review
argument-hint: [file-path]
allowed-tools: Read, Grep
---

# Security Review

Review @$1 for:

- SQL injection, XSS, command injection
- Auth/authz issues
- Credential leaks

Current git status: !`git status --short`

Provide line numbers and fixes.
```

## CLAUDE.md Format

Project instructions loaded every conversation:

```markdown
# Project Name

Brief description.

## Commands

\`\`\`bash
bun test # Run tests
bun fix # Lint + format
\`\`\`

## Skills (load when needed)

| Skill                   | Use When      |
| ----------------------- | ------------- |
| [tests/](skills/tests/) | Writing tests |
```

**Tips:**

- Keep <60 lines (loads every message)
- Commands and pointers, not full docs
- Document key constraints

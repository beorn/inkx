---
description: Create and format slash commands (skills)
---

# Slash Command Format

**Keywords**: create command, slash command, /command format

## File Location

Skills go in `.claude/skills/`:

- **Required format**: `.claude/skills/<name>/SKILL.md` with optional sub-files
- ~~Standalone: `.claude/skills/<name>.md`~~ — **Does not work!** Claude Code only discovers `SKILL.md` files inside directories.

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

Commands run **before the LLM sees the skill**, so all output is already in context. Combine with `allowed-tools` to prevent the LLM from re-running these commands:

```markdown
---
allowed-tools: Bash(git add:*), Bash(git commit:*), Read
---

# My Skill

- Branch: !`git branch --show-current`
- Status: !`git status --porcelain`

All state is above. Do NOT run git status — you don't have that tool.
```

This pattern eliminates investigation turns entirely. The LLM can't run `git status` even if it wants to, because `allowed-tools` only permits `git add` and `git commit`. See `/commit` for a full example.

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

## Best Practices Checklist

When creating/editing skills, check these patterns:

| Pattern | When to Add | Example |
|---------|-------------|---------|
| **Description with "Use when..."** | Always | "Queries LLMs. Use when user mentions GPT or wants second opinion." |
| **Quick Reference table** | Multiple commands | `\| Goal \| Command \|` at top |
| **"When to Use" table** | Ambiguous triggers | `\| User Says \| Action \|` |
| **Common Aliases table** | Multiple terms for same thing | ChatGPT → gpt-5.2, deep research → o3 |
| **Cross-skill integration** | Works with other skills | "Integration with [other-skill]" section |
| **Missing Capabilities table** | Needs API keys/config | `\| Capability \| Setup \|` |

**Full details**: [review-reference.md](review-reference.md#recommended-patterns)

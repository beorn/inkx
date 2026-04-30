---
description: Codex configuration - commands, plugins, MCP. Use when creating skills, configuring MCP servers, or managing Codex settings.
argument-hint: [create|plugin|mcp|debug]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Codex Configuration

**Keywords**: Codex skill, slash command, /command, MCP, AGENTS.md, permissions, plugin

Manage Codex: skills, plugins, MCP servers. Claude Code hook docs may be
referenced for shared repo machinery, but Claude hook events are not Codex
configuration.

## Quick Reference

| Config        | Location                |
| ------------- | ----------------------- |
| Skills        | `.agents/skills/*.md`   |
| Codex config  | `.codex/config.toml`    |
| MCP servers   | `.mcp.json`             |
| Plugins       | `~/.codex/plugins/`     |

## Common Actions

| Need                    | Load                               |
| ----------------------- | ---------------------------------- |
| Create slash command    | [skill-format.md](skill-format.md) |
| Create/install plugin   | [plugins.md](plugins.md)           |
| Configure MCP server    | [mcp.md](mcp.md)                   |
| Search session history  | [/recall](../recall/SKILL.md)      |

## Skill File Format (Quick)

```markdown
---
description: Brief description (required)
argument-hint: [arg1] [arg2]
allowed-tools: Task, Read, Bash
---

# Skill Title

Instructions for Codex.

Use $ARGUMENTS for all args, or $1, $2 for positional.

**Keywords**: terms that trigger auto-loading
```

## Troubleshooting

| Issue            | Fix                                                    |
| ---------------- | ------------------------------------------------------ |
| Not in /help     | Use `skills/<name>/SKILL.md` format (not standalone)   |
| Not auto-loading | Add **Keywords** line                                  |
| MCP failing      | `codex mcp list`, restart Codex                      |
| Standalone file  | Move `skills/x.md` → `skills/x/SKILL.md` (required)    |

## Sub-Skills

| File                                       | Purpose                          |
| ------------------------------------------ | -------------------------------- |
| [skill-format.md](skill-format.md)         | Skill format, dynamic content    |
| [plugins.md](plugins.md)                   | Plugin creation, manifest        |
| [mcp.md](mcp.md)                           | Server configuration             |
| [/recall](../recall/SKILL.md)              | Session history search (FTS5)    |
| [session.md](session.md)                   | Session recovery commands        |
| [session-errors.md](session-errors.md)     | Analyze sessions for cmd errors  |
| [review-claude.md](review-claude.md)       | Audit steering docs (infrequent) |
| [review-reference.md](review-reference.md) | Audit rules (infrequent)         |

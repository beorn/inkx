---
description: Claude Code configuration - commands, plugins, MCP
argument-hint: [create|plugin|mcp|debug]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Claude Configuration

**Keywords**: claude skill, slash command, /command, MCP, CLAUDE.md, hooks, permissions, plugin

Manage Claude Code: slash commands, plugins, MCP servers.

## Quick Reference

| Config          | Location                      |
| --------------- | ----------------------------- |
| Skills          | `.claude/skills/*.md`         |
| Settings        | `.claude/settings.json`       |
| Local overrides | `.claude/settings.local.json` |
| MCP servers     | `.mcp.json`                   |
| Plugins         | `~/.claude/plugins/`          |

## Common Actions

| Need                    | Load                       |
| ----------------------- | -------------------------- |
| Create slash command    | [commands.md](commands.md) |
| Create/install plugin   | [plugins.md](plugins.md)   |
| Configure MCP server    | [mcp.md](mcp.md)           |
| Recover session history | [session.md](session.md)   |

## Skill File Format (Quick)

```markdown
---
description: Brief description (required)
argument-hint: [arg1] [arg2]
allowed-tools: Task, Read, Bash
---

# Skill Title

Instructions for Claude.

Use $ARGUMENTS for all args, or $1, $2 for positional.

**Keywords**: terms that trigger auto-loading
```

## Troubleshooting

| Issue            | Fix                               |
| ---------------- | --------------------------------- |
| Not in /help     | Add `description:` frontmatter    |
| Not auto-loading | Add **Keywords** line             |
| MCP failing      | `claude mcp list`, restart Claude |

## Sub-Skills

| File                       | Purpose                         |
| -------------------------- | ------------------------------- |
| [commands.md](commands.md) | Command format, dynamic content |
| [plugins.md](plugins.md)   | Plugin creation, manifest       |
| [mcp.md](mcp.md)           | Server configuration            |
| [session.md](session.md)   | Session history recovery        |

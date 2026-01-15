---
description: Create and manage Claude Code slash commands, CLAUDE.md, MCP servers, hooks, and permissions
argument-hint: [action] (create|debug|list)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Claude Code Configuration

Help with Claude Code configuration: slash commands, CLAUDE.md, MCP servers, hooks, permissions.

**Keywords**: claude skill, slash command, /command, MCP, CLAUDE.md, hooks, permissions, command not working

## Quick Reference

| Config               | Location                      | Purpose                         |
| -------------------- | ----------------------------- | ------------------------------- |
| Slash commands       | `.claude/commands/*.md`       | Custom `/command` prompts       |
| Personal commands    | `~/.claude/commands/*.md`     | User-wide commands (not in git) |
| Project instructions | `CLAUDE.md`                   | Always-loaded context           |
| Settings             | `.claude/settings.json`       | MCP servers, hooks              |
| Local overrides      | `.claude/settings.local.json` | Gitignored personal settings    |

## Slash Command Format

```markdown
---
description: Brief description for /help menu (required)
argument-hint: [arg1] [arg2]           # Shows in help
allowed-tools: Task, Read, Bash        # Restrict tools (optional)
model: claude-3-5-haiku-20241022       # Force model (optional)
context: fork                          # Run in sub-agent (optional)
disable-model-invocation: true         # Prevent auto-invoke (optional)
---

# Command Title

Instructions for Claude.

Use $ARGUMENTS for all args, or $1, $2 for positional.

**Keywords**: terms that trigger this command
```

### Dynamic Content

**Embed bash output** with `!`:

```markdown
Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5`
```

**Include file contents** with `@`:

```markdown
Review the code in @src/index.ts against @specs/design.md
```

### Example: Code Review Command

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
- Input validation gaps

Current git status: !`git status --short`

Provide line numbers and fixes.
```

## CLAUDE.md Format

Project instructions loaded on every conversation:

```markdown
# Project Name

Brief description.

## Architecture

Key constraints Claude must follow.

## Commands

\`\`\`bash
bun test # Run tests
bun fix # Lint + format
\`\`\`

## File Structure

Key directories and purposes.
```

**Tips**:

- Keep specific and actionable
- Include commands for quick reference
- Document architectural rules
- List key file locations

## MCP Servers

In `.claude/settings.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@package/mcp-server"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

## Hooks

Run shell commands on Claude events:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "./scripts/validate.sh"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "command": "bun lint --fix $FILE",
        "once": true
      }
    ]
  }
}
```

Events: `PreToolUse`, `PostToolUse`, `Notification`

Hooks can also go in command frontmatter:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
          once: true
```

## Permissions

```json
{
  "permissions": {
    "allow": ["Read", "Bash(git *)"],
    "deny": ["Bash(rm -rf *)"],
    "ask": ["Write"]
  }
}
```

## Troubleshooting

### Command not in /help

- File must be in `.claude/commands/`
- Must have `description:` in frontmatter
- Must have `.md` extension

### Command not auto-invoking

- Add **Keywords** line with trigger terms
- Check `disable-model-invocation` isn't set
- Keywords should match natural phrasing

### Permission denied

Add to `.claude/settings.local.json`:

```json
{ "permissions": { "allow": ["Skill(command-name)"] } }
```

## Actions

**create**: Create a new slash command
**debug**: Troubleshoot why a command isn't working
**list**: Show all available commands

What would you like to do? $ARGUMENTS

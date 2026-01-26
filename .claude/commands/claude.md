---
description: Create and manage Claude Code slash commands, CLAUDE.md, MCP servers, plugins, hooks, and permissions
argument-hint: [action] (create|debug|list|plugin)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Claude Code Configuration

Help with Claude Code configuration: slash commands, CLAUDE.md, MCP servers, plugins, hooks, permissions.

**Keywords**: claude skill, slash command, /command, MCP, CLAUDE.md, hooks, permissions, command not working, plugin, marketplace, install plugin, create plugin, mcp server, add mcp, configure claude

## Quick Reference

| Config               | Location                        | Purpose                          |
| -------------------- | ------------------------------- | -------------------------------- |
| Slash commands       | `.claude/commands/*.md`         | Custom `/command` prompts        |
| Personal commands    | `~/.claude/commands/*.md`       | User-wide commands (not in git)  |
| Project instructions | `CLAUDE.md`                     | Always-loaded context            |
| Settings             | `.claude/settings.json`         | Hooks, permissions               |
| Local overrides      | `.claude/settings.local.json`   | Gitignored personal settings     |
| MCP servers          | `.mcp.json`                     | Project MCP servers              |
| Plugins              | `~/.claude/plugins/`            | Installed plugins                |
| Plugin manifest      | `.claude-plugin/plugin.json`    | Plugin definition                |

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

### Quick Setup (Recommended)

Use the CLI to add MCP servers:

```bash
# Add to project (shared via .mcp.json)
claude mcp add --transport stdio --scope project server-name -- bunx server-package

# Add to user config (personal, all projects)
claude mcp add --transport stdio server-name -- bunx server-package

# List configured servers
claude mcp list

# Remove a server
claude mcp remove server-name
```

### Manual Configuration

MCP servers are configured in `.mcp.json` (project root):

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "bunx",
      "args": ["server-package"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

| Scope   | Location        | Purpose                          |
| ------- | --------------- | -------------------------------- |
| Project | `.mcp.json`     | Shared with team via git         |
| User    | `~/.claude.json`| Available across all projects    |

### This Project's MCP Servers

Check current servers: `claude mcp list`

Configured in `.mcp.json`:
- **refactor-typescript** - Type-safe renames, move files, update imports
- **peekaboo** - macOS UI automation and screenshots

### Enabling MCP Server Permissions

Add to `.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__server-name__tool-name"
    ]
  }
}
```

## Plugins

### Using Plugins

```bash
# List installed plugins
claude plugin list

# Install from marketplace
claude plugin install plugin-name
claude plugin install plugin-name@marketplace-name

# Install from local directory (for development)
claude --plugin-dir ./path/to/plugin

# Enable/disable plugins
claude plugin enable plugin-name
claude plugin disable plugin-name

# Update a plugin
claude plugin update plugin-name

# Uninstall
claude plugin uninstall plugin-name
```

### Managing Marketplaces

```bash
# List marketplaces
claude plugin marketplace list

# Add a marketplace
claude plugin marketplace add https://example.com/marketplace.json

# Remove a marketplace
claude plugin marketplace remove marketplace-name
```

### Creating Plugins

Plugin directory structure:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (required)
├── commands/                 # Slash commands (auto-loaded)
│   └── my-command.md
├── skills/                   # Skills (auto-loaded)
│   └── my-skill/
│       └── SKILL.md
├── agents/                   # Custom agents
├── .mcp.json                 # Plugin's MCP servers
└── README.md
```

### plugin.json Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://github.com/you"
  },
  "repository": "https://github.com/you/my-plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "commands": ["./custom/commands/special.md"],
  "skills": "./custom/skills/",
  "agents": "./custom/agents/",
  "mcpServers": "./.mcp.json",
  "hooks": "./config/hooks.json"
}
```

**Required fields:** `name` only. All others optional.

**Path variables:** Use `${CLAUDE_PLUGIN_ROOT}` in MCP and hook configs:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"]
    }
  }
}
```

### Validating Plugins

```bash
claude plugin validate ./path/to/plugin
```

### Publishing Plugins

1. Create a GitHub repo with your plugin
2. Add to a marketplace manifest or share the repo URL
3. Users install via `claude plugin install github:user/repo`

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

### MCP server not connecting

1. Check `claude mcp list` shows the server
2. Verify the command exists: `which bunx` or path to binary
3. Check server logs: `claude mcp logs server-name`
4. Restart Claude Code after adding servers

### Plugin not loading

1. Validate manifest: `claude plugin validate ./path`
2. Check plugin is enabled: `claude plugin list`
3. Ensure paths in plugin.json start with `./`
4. Restart Claude Code after installing

## Actions

**create**: Create a new slash command
**debug**: Troubleshoot why a command isn't working
**list**: Show all available commands
**plugin**: Help with plugin creation or installation

What would you like to do? $ARGUMENTS

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

### Standalone vs Plugin - When to Use Each

| Approach | Command names | Best for |
|----------|---------------|----------|
| **Standalone** (`.claude/commands/`) | `/hello` | Project-specific, quick iteration |
| **Plugins** (with `.claude-plugin/`) | `/plugin-name:hello` | Sharing across projects, distribution |

**Plugin commands are NAMESPACED**: A plugin named `batch` with `commands/batch.md` becomes `/batch:batch`, not `/batch`.

### Using Plugins

```bash
# List installed plugins
claude plugin list

# Install from marketplace
claude plugin install plugin-name
claude plugin install plugin-name@marketplace-name

# Test plugin during development (no install needed)
claude --plugin-dir ./path/to/plugin

# Enable/disable plugins
claude plugin enable plugin-name
claude plugin disable plugin-name

# Update a plugin
claude plugin update plugin-name

# Uninstall
claude plugin uninstall plugin-name
```

**Using plugin commands:**
```bash
# Plugin commands use namespace:command format
/my-plugin:hello
/batch:batch rename "old" "new"

# Run /help to see all available commands including plugin commands
```

### Managing Marketplaces

```bash
# List marketplaces
claude plugin marketplace list

# Add a marketplace (from GitHub repo or URL)
claude plugin marketplace add github:user/repo
claude plugin marketplace add https://example.com/marketplace.json

# Remove a marketplace
claude plugin marketplace remove marketplace-name
```

### Creating Plugins

**IMPORTANT:** Don't put `commands/`, `skills/`, etc inside `.claude-plugin/`. Only `plugin.json` goes there.

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest (required) - ONLY this goes here
├── commands/                 # Slash commands → /my-plugin:command-name
│   └── my-command.md
├── skills/                   # Agent Skills (model-invoked, not slash commands)
│   └── my-skill/
│       └── SKILL.md
├── agents/                   # Custom agents
├── .mcp.json                 # Plugin's MCP servers
└── README.md
```

### Commands vs Skills (Important Difference!)

| Type | Location | Invocation | Use case |
|------|----------|------------|----------|
| **Commands** | `commands/*.md` | User types `/plugin:cmd` | Interactive workflows |
| **Skills** | `skills/*/SKILL.md` | Model auto-invokes based on context | Background capabilities |

**Commands** are user-triggered slash commands.
**Skills** are model-triggered - Claude uses them automatically when relevant.

### plugin.json Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": { "name": "Your Name" }
}
```

**Required fields:** `name` only. All others optional.

**Optional fields:** `repository`, `license`, `keywords`, `homepage`

**Path variables:** Use `${CLAUDE_PLUGIN_ROOT}` in MCP and hook configs.

### Development Workflow

```bash
# 1. Create plugin structure
mkdir -p my-plugin/.claude-plugin my-plugin/commands

# 2. Create manifest
echo '{"name": "my-plugin", "version": "0.1.0"}' > my-plugin/.claude-plugin/plugin.json

# 3. Add a command
cat > my-plugin/commands/hello.md << 'EOF'
---
description: Say hello
---
Greet the user: $ARGUMENTS
EOF

# 4. Test locally (restart Claude Code to pick up changes)
claude --plugin-dir ./my-plugin

# 5. Use the command
/my-plugin:hello World
```

### Validating & Publishing

```bash
# Validate plugin structure
claude plugin validate ./path/to/plugin

# Publish via GitHub
# 1. Create repo with plugin files
# 2. Users install: claude plugin install github:user/repo
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

### Plugin command not found

Plugin commands are namespaced! Use `/plugin-name:command-name`:
- Plugin `batch` with `commands/batch.md` → `/batch:batch`
- Plugin `tools` with `commands/review.md` → `/tools:review`

Check available commands with `/help` - plugin commands appear under their namespace.

## Actions

**create**: Create a new slash command
**debug**: Troubleshoot why a command isn't working
**list**: Show all available commands
**plugin**: Help with plugin creation or installation

What would you like to do? $ARGUMENTS

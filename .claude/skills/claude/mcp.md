---
description: Configure MCP servers for Claude Code
---

# MCP Servers

**Keywords**: MCP, mcp server, add mcp, configure mcp

## Quick Setup (CLI)

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

## Manual Configuration

MCP servers configured in `.mcp.json` (project root):

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

| Scope   | Location         | Purpose                  |
| ------- | ---------------- | ------------------------ |
| Project | `.mcp.json`      | Shared with team via git |
| User    | `~/.claude.json` | All projects             |

## Enabling Permissions

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__server-name__tool-name"]
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

Events: `PreToolUse`, `PostToolUse`, `Notification`, `SessionStart`, `SessionEnd`

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

| Issue                 | Fix                                            |
| --------------------- | ---------------------------------------------- |
| Server not connecting | Check `claude mcp list`, verify command exists |
| Permission denied     | Add to `permissions.allow` in settings         |
| Server failing        | `claude mcp logs server-name`, restart Claude  |

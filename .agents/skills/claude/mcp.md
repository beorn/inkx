---
description: Configure MCP servers for Codex and document Claude Code-only extras
---

# MCP Servers

**Keywords**: MCP, mcp server, add mcp, configure mcp

## Quick Setup (Codex)

Prefer checked-in project config via `.mcp.json` so all agent runtimes see the
same server definitions after restart/reload.

```json
{
  "mcpServers": {
    "server-name": {
      "command": "bunx",
      "args": ["server-package"]
    }
  }
}
```

Use `codex mcp list` to inspect what the current Codex runtime loaded.

## Claude Code CLI

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
| User    | runtime-specific user config | All projects             |

## Claude Code Permissions

Claude Code can gate MCP tools through `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__server-name__tool-name"]
  }
}
```

## Claude Code Hooks

Run shell commands on Claude Code events. These are not Codex hooks:

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

Claude Code events: `PreToolUse`, `PostToolUse`, `Notification`,
`SessionStart`, `SessionEnd`.

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
| Server not connecting | Check `codex mcp list` or runtime MCP status, verify command exists |
| Permission denied     | Check runtime-specific permissions             |
| Server failing        | Restart/reload the agent runtime               |

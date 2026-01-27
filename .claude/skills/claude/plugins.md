---
description: Create and manage Claude Code plugins
---

# Plugins

**Keywords**: plugin, create plugin, install plugin, marketplace

## When to Use Plugins

| Approach                       | Command names | Best for                |
| ------------------------------ | ------------- | ----------------------- |
| Standalone (`.claude/skills/`) | `/skill-name` | Project-specific        |
| Plugin (`.claude-plugin/`)     | `/plugin:cmd` | Sharing across projects |

**Plugin commands are NAMESPACED**: Plugin `batch` with `commands/batch.md` → `/batch:batch`

## Using Plugins

```bash
# List installed plugins
claude plugin list

# Install from marketplace
claude plugin install plugin-name

# Test during development (no install)
claude --plugin-dir ./path/to/plugin

# Enable/disable
claude plugin enable plugin-name
claude plugin disable plugin-name

# Update/uninstall
claude plugin update plugin-name
claude plugin uninstall plugin-name
```

## Managing Marketplaces

```bash
claude plugin marketplace list
claude plugin marketplace add github:user/repo
claude plugin marketplace remove name
```

## Creating Plugins

**Structure:**

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json     # Manifest (ONLY this goes here)
├── commands/           # → /my-plugin:command-name
│   └── my-command.md
├── skills/             # Auto-invoked by model
│   └── my-skill/
│       └── SKILL.md
└── .mcp.json           # Plugin's MCP servers
```

**IMPORTANT:** Don't put `commands/` inside `.claude-plugin/`. Only `plugin.json` goes there.

## plugin.json Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does"
}
```

Required: `name` only. Optional: `repository`, `license`, `keywords`

Path variables: Use `${CLAUDE_PLUGIN_ROOT}` in configs.

## Development Workflow

```bash
# 1. Create structure
mkdir -p my-plugin/.claude-plugin my-plugin/commands

# 2. Create manifest
echo '{"name": "my-plugin"}' > my-plugin/.claude-plugin/plugin.json

# 3. Add a command
cat > my-plugin/commands/hello.md << 'EOF'
---
description: Say hello
---
Greet the user: $ARGUMENTS
EOF

# 4. Test locally
claude --plugin-dir ./my-plugin

# 5. Use: /my-plugin:hello World
```

## Validation & Publishing

```bash
claude plugin validate ./path/to/plugin
# Publish via GitHub, users install: claude plugin install github:user/repo
```

## Troubleshooting

| Issue              | Fix                                              |
| ------------------ | ------------------------------------------------ |
| Plugin not loading | `claude plugin validate`, check enabled, restart |
| Command not found  | Use `/plugin-name:command-name` (namespaced)     |
| Paths failing      | Start paths with `./` in plugin.json             |

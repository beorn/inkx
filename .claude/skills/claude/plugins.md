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

**DO NOT add a `"skills"` field** to plugin.json. Claude Code auto-discovers skills from the `skills/` directory — listing them in the manifest causes a validation error (`skills: Invalid input`) and the plugin fails to install silently. The telegram plugin (official, working) uses the same pattern: no `skills` in manifest, just a `skills/` directory.

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
| `skills: Invalid input` | Remove `"skills"` from plugin.json — skills auto-discover from `skills/` dir |

### Global Plugin Installation (bearly)

The bearly plugins are configured as a local marketplace:

```json
// ~/.claude/settings.json
"extraKnownMarketplaces": {
  "bearly": {
    "source": { "source": "directory", "path": "/Users/beorn/Code/pim/km/vendor/bearly" }
  }
}
```

**Key distinction**: `extraKnownMarketplaces` makes plugins *discoverable*, but doesn't install them. You must explicitly install:

```bash
claude plugin install tribe@bearly    # Install globally (user scope)
```

After install, the plugin works in ALL projects — no need for per-project `.mcp.json` entries. The plugin's `.mcp.json` defines the MCP server, and Claude Code starts it automatically.

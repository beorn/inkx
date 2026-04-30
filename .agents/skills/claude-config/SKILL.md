---
description: Agent configuration drift — audit skills and MCP, plus Claude Code hooks/sub-agents. Use when adding MCP servers, fixing skill drift, or checking Claude Code hook registration.
keywords: MCP, skill, agent, sub-agent, settings.json, WorktreeCreate, PreToolUse, PostToolUse, SessionStart, SessionEnd, PreCompact, UserPromptSubmit, SubagentStop, Claude Code hooks, Codex config, config drift, lint-claude-config, orphan hook, manifest
argument-hint: [audit|manifests|fix]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Agent Config — Drift Audit, Manifests, and Registration Recipes

**Keywords**: MCP, skill, agent, settings.json, WorktreeCreate, PreToolUse, PostToolUse, SessionStart, SessionEnd, PreCompact, UserPromptSubmit, SubagentStop, Claude Code hooks, Codex config, config drift, orphan hook, manifest

This skill is the single entry point for agent-facing configuration drift in
km: Codex skills and MCP servers, plus Claude Code hooks and sub-agents. Load
it whenever you need to add, debug, or audit any of those things.

Important boundary: hook events such as `UserPromptSubmit`, `SessionStart`,
`PreCompact`, and `SubagentStop` are Claude Code hooks in this repo. They are
not currently a Codex hook surface. For Codex MCP setup, use `.mcp.json` and
restart/reload the agent runtime so the server is loaded into the session.

## Why this exists

On 2026-04-18 we root-caused cross-session chaos to a silent orphan hook:
`.claude/hooks/worktree-create.sh` existed for weeks but was never registered,
so every agent worktree was half-populated and one agent wasted its slot on
a diagnostic handoff instead of doing work. The drift-checker exists to make
that class of bug impossible.

The same failure mode applies to skills (orphan directories, never keyword-
matched), sub-agents (orphan definitions), and MCP servers (configured but
broken). This skill + `tools/lint-claude-config.ts` catches all four.

## Commands

```bash
bun tools/lint-claude-config.ts                  # audit (exit 1 on drift)
bun tools/lint-claude-config.ts --fix-suggestions # audit + print snippets
bun tools/lint-claude-config.ts --write-manifests # regenerate the 4 manifests
```

Wired into `test:ci` — drift blocks merges.

## Auto-generated manifests

- `.claude/hooks/README.md` — every `.claude/hooks/*.sh` script with status
  (ACTIVE / INTERNAL / ORPHAN), events, and description.
- `.agents/skills/README.md` — every skill directory with description and
  keywords.
- `.claude/agents/README.md` — every sub-agent with group, name, model,
  tools, description.
- `.mcp-manifest.md` — every MCP server from `.mcp.json` with command + args.

These are the first thing to read when you're asked to "add a hook" or
"configure an MCP" — they show the live state, not stale prose.

## Key files

```
.codex/config.toml             # project Codex trust/config
~/.codex/config.toml           # user-level Codex config
.agents/skills/<name>/SKILL.md # Codex skills
.mcp.json                      # MCP servers loaded by agent runtimes
.claude/settings.json          # Claude Code project hooks
~/.claude/settings.json        # Claude Code user hooks
.claude/hooks/*.sh             # Claude Code hook scripts
.claude/agents/<group>/*.md    # Claude Code sub-agents
```

## Registration recipes

### Hook

```jsonc
// .claude/settings.json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-create.sh" }
        ]
      }
    ]
  }
}
```

Valid events: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`,
`PreCompact`, `UserPromptSubmit`, `SubagentStop`, `WorktreeCreate`.

**Hook script conventions:**
- First comment line is the description for the manifest:
  `# Hook: SessionStart` or `# Utility: Kill orphaned vitest workers`.
- Mark scripts that are NOT top-level registrations with
  `# Hook-Status: internal`. The drift-checker treats them as intentional.
- `chmod +x` the script.
- Use `$CLAUDE_PROJECT_DIR` in registrations so the path survives
  worktrees and symlinked checkouts.

### Skill

```markdown
<!-- .agents/skills/my-skill/SKILL.md -->
---
description: One-line purpose + "Use when ..." trigger.
argument-hint: [optional|subcommands]
allowed-tools: Read, Write, Bash
---

# My Skill

**Keywords**: keyword1, keyword2, trigger phrase

Skill body ...
```

- `description` is required — the drift-checker blocks merges without it.
- Keywords are a soft warning — add them unless the skill is truly never
  keyword-triggered.

### Sub-agent

```markdown
<!-- .claude/agents/expert/my-agent.md -->
---
name: my-agent
description: "One-line summary."
model: opus
tools: Read, Glob, Grep, Bash, Write, Edit
---

# My Agent

System prompt body ...
```

- `name` and `description` are required.
- Files ending in `-knowledge.md`, `ASSETS.md`, `INFO-ARCHITECTURE.md` are
  treated as reference files, not agent definitions, and skipped by the
  checker.

### MCP server

```jsonc
// .mcp.json
{
  "mcpServers": {
    "my-server": {
      "command": "bun",
      "args": ["path/to/server.ts"]
    }
  }
}
```

## When the drift-checker flags you

| Failure | Root cause | Fix |
| --- | --- | --- |
| Orphan hook script | file exists, no registration | register it in Claude Code settings, or add `# Hook-Status: internal`, or delete the script |
| Broken registration | `.sh` path referenced in config doesn't exist | fix the path or remove the registration |
| Invalid skill | `SKILL.md` missing or no `description` in frontmatter | add frontmatter |
| Invalid agent | agent `.md` missing `name` or `description` | add frontmatter |
| Invalid MCP server | bad JSON, missing `command`, or non-string `args` | fix `.mcp.json` |

## Pointers

- Drift-checker source: `tools/lint-claude-config.ts`
- Triggering bug postmortem: bead `km-infra.claude-config-manifest`
- Related skill: [`/claude`](../claude/SKILL.md) for slash-command + plugin
  authoring.
- Hook authoring reference: [.claude/hooks/README.md](../../hooks/README.md)

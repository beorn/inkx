---
description: Search and recover content from Claude session history
argument-hint: <command> [args]
---

# Claude Session

Utilities for working with Claude Code session JSONL files. Useful for recovering lost files, finding past conversations, or exploring session history.

## Commands

| Command | Description |
|---------|-------------|
| `list [project]` | List all sessions, optionally filter by project name |
| `show <session-id>` | Show session details including file writes |
| `index` | Build/rebuild the file write index (run first for search/restore!) |
| `search <pattern>` | Search indexed writes by file path pattern |
| `grep <pattern>` | **Search ALL session content** - conversations, code, tool calls |
| `writes [--date YYYY-MM-DD]` | List recent file writes |
| `restore <file-path>` | Show/restore file content from history |
| `stats` | Show index statistics |

## Usage

Run the command with arguments:

```bash
bun ./scripts/claude-session.ts $ARGUMENTS
```

## Examples

**Search for any content in past conversations:**
```bash
bun ./scripts/claude-session.ts grep "loading progress"
bun ./scripts/claude-session.ts grep "progressx" --project km --limit 20
bun ./scripts/claude-session.ts grep "chokidar worker" --context 5
```

**First time setup - build the index (for file search/restore):**
```bash
bun ./scripts/claude-session.ts index
```

**Find a lost file:**
```bash
bun ./scripts/claude-session.ts search chaos-cli.ts
```

**Restore file content:**
```bash
bun ./scripts/claude-session.ts restore packages/km-storage/scripts/chaos-cli.ts
```

**List recent writes from today:**
```bash
bun ./scripts/claude-session.ts writes --date 2026-01-22
```

## Grep Options

| Option | Description |
|--------|-------------|
| `--project <name>` | Filter by project name (e.g., `km`) |
| `--limit <n>` | Max matches to return (default: 50) |
| `--context <n>` | Lines of context around match (default: 2) |

**Keywords**: session, recover, restore, lost file, backup, history, undo, grep, search, conversation

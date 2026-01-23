---
description: Search and recover files from Claude session history
argument-hint: <command> [args]
---

# Claude Session

Utilities for working with Claude Code session JSONL files. Useful for recovering lost files or exploring session history.

## Commands

| Command | Description |
|---------|-------------|
| `list [project]` | List all sessions, optionally filter by project name |
| `show <session-id>` | Show session details including file writes |
| `index` | Build/rebuild the file write index (run first!) |
| `search <pattern>` | Search indexed writes by file path pattern |
| `writes [--date YYYY-MM-DD]` | List recent file writes |
| `restore <file-path>` | Show/restore file content from history |
| `stats` | Show index statistics |

## Usage

Run the command with arguments:

```bash
bun ./scripts/claude-session.ts $ARGUMENTS
```

## Examples

**First time setup - build the index:**
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

**Keywords**: session, recover, restore, lost file, backup, history, undo

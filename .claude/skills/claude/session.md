---
description: Search and recover content from Claude session history
argument-hint: [search-term]
allowed-tools: Bash, Read
---

# Session History Recovery

**Keywords**: session, history, recover, lost, previous session, find conversation

Search through Claude Code session history to find and recover content from past conversations.

## Quick Search (Recommended)

Use the `bun history` CLI for fast FTS5-indexed search:

```bash
# Search all sessions
bun history "search term"

# Questions only, last hour
bun history -q -s 1h "how do I"

# Search plans and messages
bun history -i p,m "refactor"

# Find Write tool operations
bun history -t Write -s 1d
```

See [/history](../history/SKILL.md) for full options.

## Recover Files

```bash
# Find file writes by path
bun history writes-search "*.tsx"

# Restore specific file content
bun history restore src/component.tsx

# List recent writes
bun history writes
```

## Activity Dashboard

```bash
bun history now   # Active sessions (5 min)
bun history hour  # Last hour summary
bun history day   # Today's summary
```

## Session Management

```bash
bun history list           # List all sessions
bun history show <id>      # Session details
bun history stats          # Index statistics
```

## Rebuild Index

If search isn't finding recent content:

```bash
bun history index              # Full rebuild
bun history index --incremental # Update only
```

## Raw Session Access

For manual searching (slower):

```bash
# Search raw JSONL files
grep -r "search term" ~/.claude/projects/*/sessions/*.jsonl | head -20

# Find recent sessions
ls -lt ~/.claude/projects/*/sessions/*.jsonl | head -10
```

## Tips

- Use `bun history` for fast indexed search
- Sessions are JSONL files (one JSON per line)
- Index stored at `~/.claude/session-index.db`
- Rebuild index if search seems incomplete

---
description: Search and recover content from Claude session history
argument-hint: [search-term]
allowed-tools: Bash
---

# Session History Recovery

**Keywords**: session, history, recover, lost, previous session, find conversation

Search through Claude Code session history to find and recover content from past conversations.

**NEVER read/cat entire session files or tool-results files.** They can be 30k+ tokens and will overflow context. Always use `bun history` (FTS5-indexed, <100ms) or targeted `rg` with patterns.

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

## Targeted Raw Search (Last Resort)

Only when `bun history` index is stale or missing. **Always use rg with patterns, never read entire files.**

```bash
# Search raw JSONL files with rg (NOT cat/Read)
rg "search term" ~/.claude/projects/*/sessions/*.jsonl | head -20

# Find recent sessions by modification time
ls -lt ~/.claude/projects/*/sessions/*.jsonl | head -10
```

## Rules

- **NEVER** use `cat`, `Read`, `head`, or `tail` on session JSONL files — they're 10k-100k+ lines
- **NEVER** read tool-results files directly — use `bun history` to search them
- **ALWAYS** pipe through `head -N` when using `rg` on session files
- Prefer `bun history` over raw `rg` — it's indexed and faster
- Rebuild index (`bun history index`) if search seems incomplete

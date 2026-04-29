---
description: Search and recover content from Claude session history
argument-hint: [search-term]
allowed-tools: Bash
---

# Session History Recovery

**Keywords**: session, history, recover, lost, previous session, find conversation

Search through Claude Code session history to find and recover content from past conversations.

**NEVER read/cat entire session files or tool-results files.** They can be 30k+ tokens and will overflow context. Always use `bun recall` (FTS5-indexed, <100ms) or targeted `rg` with patterns.

## Quick Search (Recommended)

Use the `bun recall` CLI for fast FTS5-indexed search:

```bash
# Search all sessions (with LLM synthesis)
bun recall "search term"

# Raw results (no LLM)
bun recall --raw "search term"

# Questions only, last hour
bun recall -q -s 1h "how do I"

# Search plans and messages
bun recall -i p,m "refactor"

# Find Write tool operations
bun recall -t Write -s 1d
```

See [/recall](../recall/SKILL.md) for full options.

## Recover Files

```bash
# Find file writes by path
bun recall files "*.tsx"

# Restore specific file content
bun recall files --restore src/component.tsx

# List recent writes
bun recall files
```

## Activity Dashboard

```bash
bun recall status   # Full dashboard: activity, stats, index health
```

## Session Management

```bash
bun recall sessions           # List all sessions
bun recall sessions <id>      # Session details
```

## Rebuild Index

If search isn't finding recent content:

```bash
bun recall index              # Full rebuild
bun recall index --incremental # Update only
```

## Targeted Raw Search (Last Resort)

Only when `bun recall` index is stale or missing. **Always use rg with patterns, never read entire files.**

```bash
# Search raw JSONL files with rg (NOT cat/Read)
rg "search term" ~/.claude/projects/*/sessions/*.jsonl | head -20

# Find recent sessions by modification time
ls -lt ~/.claude/projects/*/sessions/*.jsonl | head -10
```

## Rules

- **NEVER** use `cat`, `Read`, `head`, or `tail` on session JSONL files — they're 10k-100k+ lines
- **NEVER** read tool-results files directly — use `bun recall` to search them
- **ALWAYS** pipe through `head -N` when using `rg` on session files
- Prefer `bun recall` over raw `rg` — it's indexed and faster
- Rebuild index (`bun recall index`) if search seems incomplete

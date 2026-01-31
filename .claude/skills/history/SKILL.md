---
description: Searches Claude Code session history with FTS5. Use when recovering lost content, finding past conversations, or checking before LLM queries.
argument-hint: [query] [-q|-r] [-s time] [-i types] [-p project]
allowed-tools: Bash, Read
---

# Session History

**Keywords**: history, session, recover, find, previous, lost conversation

Fast SQLite + FTS5 search across all Claude Code sessions.

## Quick Reference

```bash
# Basic search
bun history "search term"

# Questions only, last hour
bun history -q -s 1h "how do I"

# All questions from today
bun history -q -s today

# Plans and messages about refactoring
bun history -i p,m "refactor"

# Regex search
bun history -g "function\s+\w+Async"

# Tool operations in a project today
bun history -t Write -p "*km*" -s 1d

# Activity summaries
bun history now       # Last 5 minutes
bun history hour      # Last hour
bun history day       # Today
```

## Search Options

| Option | Description |
|--------|-------------|
| `-i, --include <types>` | Content types: `p,m,s,t` or `plans,messages,summaries,todos` |
| `-g, --grep` | Regex mode (slower, scans files) |
| `-q, --question` | Only user questions |
| `-r, --response` | Only assistant responses |
| `-t, --tool <name>` | Messages with specific tool (Write, Bash, etc.) |
| `-s, --since <time>` | Time window: `1h`, `1d`, `1w`, `today`, `yesterday` (default: 30d) |
| `-p, --project <glob>` | Project glob match (e.g., `*km*`) |
| `--session <id>` | Specific session |
| `-n, --limit <num>` | Max results (default: 10) |
| `--json` | JSON output |

## Content Types

| Short | Long | Description |
|-------|------|-------------|
| m | messages | All messages (user + assistant + tool) |
| p | plans | Plan files (~/.claude/plans/*.md) |
| s | summaries | Session summaries (auto-generated) |
| t | todos | Todo lists (~/.claude/todos/*.json) |

## Time Formats

| Format | Meaning |
|--------|---------|
| `1h`, `2h` | Hours ago |
| `1d`, `7d` | Days ago |
| `1w`, `2w` | Weeks ago |
| `today` | Since midnight |
| `yesterday` | Since yesterday midnight |

## Commands

### Activity Dashboard
| Command | Description |
|---------|-------------|
| `now` | Active sessions (last 5 min) |
| `hour` | Last hour summary |
| `day` | Today's summary |

### Session Management
| Command | Description |
|---------|-------------|
| `list [project]` | List sessions |
| `show <id>` | Session details |
| `stats` | Index statistics |

### File Recovery
| Command | Description |
|---------|-------------|
| `writes-search <pattern>` | Find file writes |
| `restore <file>` | Recover content |

### Indexing
| Command | Description |
|---------|-------------|
| `index` | Build/rebuild FTS5 index |
| `index --incremental` | Update new sessions only |

## Before LLM Queries

Check if you've researched this before:

```bash
bun history "TUI testing best practices"

# Or use prepare (does this automatically)
bun llm prepare "TUI testing"
```

## Performance

- FTS search: <100ms on 6GB+ data
- Index rebuild: ~2-4 min for full history
- Database: `~/.claude/session-index.db`

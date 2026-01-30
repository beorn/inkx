---
description: Searches Claude Code session history with FTS5. Use when recovering lost content, finding past conversations, or checking before LLM queries.
argument-hint: [fts|similar|now|hour|day] <query>
allowed-tools: Bash, Read
---

# Session History

**Keywords**: history, session, recover, find, previous, lost conversation

Fast SQLite + FTS5 search across all Claude Code sessions.

## Quick Reference

| Goal | Command |
|------|---------|
| Search content | `bun history fts "search term"` |
| Similar questions | `bun history similar "how to X"` |
| Recent activity | `bun history hour` |
| Today's activity | `bun history day` |
| Recover file | `bun history restore path/to/file` |
| Full help | `bun history --help` |

## Before LLM Queries

Check if you've researched this before:

```bash
# Manual check
bun history similar "TUI testing best practices"

# Or use prepare (does this automatically)
bun llm prepare "TUI testing"
```

## Commands

### Search (Fast - requires index)
| Command | Description |
|---------|-------------|
| `fts <query>` | Full-text search (<100ms) |
| `similar <query>` | Find similar past questions |

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
| `search <pattern>` | Find file writes |
| `restore <file>` | Recover content |

### Indexing
| Command | Description |
|---------|-------------|
| `index` | Build/rebuild FTS5 index |
| `index --incremental` | Update new sessions only |

## Integration with LLM

- `bun llm prepare` checks history automatically
- `bun llm ask --with-history` includes past context
- Both share `~/.claude/session-index.db`

## Performance

- FTS search: <100ms on 6GB+ data
- Index rebuild: ~2-4 min for full history
- Database: `~/.claude/session-index.db`

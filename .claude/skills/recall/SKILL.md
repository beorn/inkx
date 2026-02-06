---
description: Search and synthesize past session knowledge. Use proactively when encountering errors, starting work, or wondering "has this been done before?"
argument-hint: <query> [--since time] [--raw]
allowed-tools: Bash
---

# Recall — Session Memory Search

**Keywords**: recall, memory, remember, history, previous session, prior knowledge, "has this been done"

Search and synthesize knowledge from past Claude Code sessions.

## Auto-Recall

Memory recall fires automatically on every non-trivial prompt via UserPromptSubmit hook.
You usually don't need to search manually — prior knowledge appears as "Session Memory" context.

## Manual Recall

For deeper investigation beyond what auto-recall provides:

```bash
# Quick search + synthesis
bun recall "inline edit keyboard handling"

# Raw results (no LLM synthesis)
bun recall --raw "createRepo"

# Time-scoped search
bun recall --since 1w "flicker bug"

# JSON output (for programmatic use)
bun recall --json "command system design"

# Limit results
bun recall --limit 15 "storage layer"
```

## When to Use Manually

- **Errors you've seen before**: `bun recall "error message text"`
- **Architecture decisions**: `bun recall "why did we choose X"`
- **Deeper investigation**: When auto-recall summary isn't enough, use `--raw` for full snippets
- **Cross-project knowledge**: `bun recall -p "*other-project*" "pattern"`

## For Deeper History Search

Use `bun history` directly (the /history skill) for:
- Regex search (`-g` flag)
- Tool-specific filtering (`-t Write`)
- Session browsing and file recovery
- Activity dashboards

## Review & Diagnostics

Check if the memory system is working well:

```bash
bun recall review
bun recall review --json   # Structured output
```

This runs diagnostics on:
- **Index health**: size, staleness, content types indexed
- **Hook configuration**: are hooks installed and executable?
- **Search quality**: benchmark queries, latency, result diversity
- **Recall synthesis**: LLM working? reasonable cost/latency?
- **Actionable recommendations**: what to fix and how

Run review when:
- Starting work on memory system improvements
- Suspecting recall isn't finding relevant results
- After changing hook configuration
- Periodically to ensure system health

## Subcommands

The recall tool has subcommands used by Claude Code hooks:

```bash
bun recall hook              # UserPromptSubmit hook — reads stdin JSON, returns additionalContext
bun recall remember \        # SessionEnd hook — extract lessons from transcript
  --transcript <path> \
  --session-id <id> \
  --memory-dir <dir>
```

Hooks are thin bash wrappers that delegate to these subcommands.
Errors propagate to stderr (fail loud per principles.md).

## How It Works

1. FTS5 search across ~350K indexed messages (<100ms)
2. Also searches plans, summaries, todos, and session first-prompts
3. Cheap LLM (gpt-5-nano, ~$0.001) synthesizes top results into actionable summary
4. Total latency: ~3-25 seconds (depends on LLM response time)

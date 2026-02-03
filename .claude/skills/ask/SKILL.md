---
description: Quick question to GPT 5.2 (or best available model). Use when user wants a fast answer from another LLM.
argument-hint: <question>
---

**Keywords**: ask, quick question, fast answer, LLM query

# Ask - Quick LLM Query

Shortcut for quick LLM queries. See `/llm` for full documentation.

## Commands

| Command | What | Cost |
|---------|------|------|
| `/ask <question>` | Single model query | ~$0.02 |
| `/ask:all <question>` | Multi-model debate | ~$1-3 |

## Usage

```bash
# Quick question
bun llm "<question>"

# Multi-model consensus
bun llm debate -y "<question>"
```

## Context for Codebase Questions

For questions about this codebase, gather light context first:

1. Note project: km (TypeScript/Bun/Ink/SQLite TUI)
2. Note current file if relevant
3. Include in question:

```bash
bun llm "Context: km project (TypeScript TUI), working on src/foo.ts. Question: <actual question>"
```

## See Also

- `/llm` - Full documentation with all options
- `/deep` - Deep research with web search

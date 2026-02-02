---
description: Deep research using OpenAI's deep research API. Use when user wants thorough research with web search and citations.
argument-hint: <topic>
---

# Deep - OpenAI Deep Research

Thorough research using OpenAI's deep research models with web search and citations.

## Commands

| Command | What |
|---------|------|
| `/deep <topic>` | Single deep research model (~$2-5) |
| `/deep:all <topic>` | Multi-model debate/consensus (~$1-3) |

## Usage

**Single model (OpenAI deep research):**
```bash
bun llm deep -y "<topic>"
```

**Multi-model consensus:**
```bash
bun llm debate -y "<topic>"
```

## Examples

User: `/deep best practices for TUI testing 2026`
Run: `bun llm deep -y "best practices for TUI testing 2026"`

User: `/deep:all current state of WebAssembly`
Run: `bun llm debate -y "current state of WebAssembly"`

## Cost

- `/deep`: ~$2-5 per query (OpenAI deep research with web search)
- `/deep:all`: ~$1-3 per query (queries 3 models, synthesizes)

## Auto-Recovery

If a previous deep research call was interrupted, running `/deep` will:
1. Automatically detect incomplete responses
2. Attempt to recover them from OpenAI
3. Display the recovered content
4. Ask if you want to continue with a new query

Use `--no-recover` to skip this check.

## Note

This uses OpenAI's deep research feature (NOT DeepSeek). The `/deep` command includes web search and provides citations. The `/deep:all` variant uses the debate system to get multiple perspectives.

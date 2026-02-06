---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, OpenAI, Gemini, Grok, or wants deep research (NOT DeepSeek), thinkdeep, or a second opinion.
argument-hint: [deep|opinion|debate] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep research, thinkdeep, second opinion, consensus, research, ask

**Claude: Use this when the user wants another model's perspective or deep research (OpenAI's research mode, NOT DeepSeek).**

Run `bun llm` for full help.

## Output

By default, the response is written to a file and the file path is printed to stdout. Read the file with `Read` tool. Stale files are auto-cleaned after 7 days. Use `--output -` for classic streaming to stdout.

## Quick Reference

| Goal | Command |
|------|---------|
| Standard question | `bun llm "question"` |
| Deep research | `bun llm --deep -y "topic"` |
| With context | `bun llm --deep -y --context "context" "topic"` |
| With history | `bun llm --deep -y --with-history "topic"` |
| Second opinion | `bun llm opinion "question"` |
| Multi-model debate | `bun llm debate -y "question"` |

## Shortcuts

| Shortcut | Equivalent |
|----------|------------|
| `/ask <question>` | `bun llm --ask "<question>"` |
| `/deep <topic>` | `bun llm --deep -y "<topic>"` |
| `/ask:all <question>` | `bun llm debate -y "<question>"` |
| `/deep:all <topic>` | `bun llm debate -y "<topic>"` |

## Keywords (aliases)

| Keyword | What | Cost |
|---------|------|------|
| *(none)* | Best available model (gpt-5.2 preferred) | ~$0.02 |
| `opinion` | Second opinion from different provider | ~$0.02 |
| `debate` | 3 models from different providers + synthesis | ~$1-3 |
| `quick`/`cheap`/`mini`/`nano` | Fast/cheap (only if explicitly needed) | ~$0.01 |

## Flags

| Flag | What | Cost |
|------|------|------|
| `--deep`/`/deep` | OpenAI deep research (web search, citations, thorough) | ~$2-5 |
| `--ask`/`/ask` | Explicit default mode (syntactic sugar) | ~$0.02 |
| `--output -` | Stream to stdout instead of writing to file | — |

## Context Flags

| Flag | What |
|------|------|
| `--with-history` | Include relevant context from session history |
| `--context <text>` | Provide explicit context (prepended to topic) |
| `--context-file <path>` | Read context from a file |

## Gathering Context

Before calling `bun llm`, use `/recall` to search session history for relevant prior work: `bun recall "topic"`. Read the results, extract the relevant insights, and summarize them into `--context` — don't pass raw recall output directly.

**Quick questions**: Prepend brief context: `bun llm "Context: km (TypeScript TUI), [file]. Question: [q]"`

**Deep research**: Include **full source code** — see `/deep` for detailed context gathering workflow.

## Background Execution (for agents)

Stdout contains JSON metadata (including file path) — parse it, then read the file with `Read` tool. Deep research and debate take 2-15 minutes. Use `Task(run_in_background=true)` + `TaskOutput(block=true, timeout=600000)`. See `vendor/beorn-tools/skills/llm/SKILL.md` "Agent Usage" section.

## When to Use

| User Says | Action |
|-----------|--------|
| "Ask ChatGPT/GPT about X" | `bun llm "X"` |
| "Get a second opinion" | `bun llm opinion "X"` |
| "Research this topic" | `bun llm --deep -y "topic"` |
| "Deep dive on X" | `bun llm --deep -y "topic"` |
| "Think deep about X" | `bun llm --deep -y "topic"` |
| "What do other models think?" | `bun llm debate -y "question"` |

**Note**: "deep" refers to OpenAI's deep research mode, NOT DeepSeek. DeepSeek queries are not supported.

## Smart Model Selection

- Automatically uses the **best available** model for each mode
- **Warns** if a better model exists but isn't configured (shows env var to set)
- For `debate`, selects models from **different providers** for diverse perspectives

## Features

- **File output**: Response written to file, path on stdout (no truncation issues)
- **Auto-recovery**: Automatically recovers interrupted responses before new queries
- **Persistence**: Saves progress to disk during streaming (never lose expensive calls)
- **History check**: Warns if you've researched this before (avoids duplicate spend)
- **Cost confirmation**: Prompts for `deep` and `debate` (expensive)
- **Streaming**: Real-time progress to stderr
- **Provider warnings**: Shows when better models are available

## Recovery Commands

| Command | What |
|---------|------|
| `bun llm recover` | List incomplete responses |
| `bun llm recover <id>` | Retrieve response by ID from OpenAI |
| `bun llm partials --clean` | Clean up old partial files |

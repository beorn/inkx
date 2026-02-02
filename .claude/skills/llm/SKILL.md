---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, OpenAI, Gemini, Grok, or wants deep research (NOT DeepSeek), thinkdeep, or a second opinion.
argument-hint: [deep|opinion|debate] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep research, thinkdeep, second opinion, consensus, research

**Claude: Use this when the user wants another model's perspective or deep research (OpenAI's research mode, NOT DeepSeek).**

Run `bun llm` for full help.

## Quick Reference

| Goal | Command |
|------|---------|
| Standard question | `bun llm "question"` |
| Deep research | `bun llm deep "topic"` |
| Deep (skip confirm) | `bun llm deep -y "topic"` |
| Second opinion | `bun llm opinion "question"` |
| Multi-model debate | `bun llm debate "question"` |

## Keywords (aliases)

| Keyword | What | Cost |
|---------|------|------|
| *(none)* | Best available model (gpt-5.2 preferred) | ~$0.02 |
| `deep`/`research`/`think` | OpenAI deep research (web search, citations, thorough) | ~$2-5 |
| `opinion` | Second opinion from different provider | ~$0.02 |
| `debate` | 3 models from different providers + synthesis | ~$1-3 |
| `quick`/`cheap`/`mini`/`nano` | Fast/cheap (only if explicitly needed) | ~$0.01 |

## When to Use

| User Says | Action |
|-----------|--------|
| "Ask ChatGPT/GPT about X" | `bun llm "X"` |
| "Get a second opinion" | `bun llm opinion "X"` |
| "Research this topic" | `bun llm deep "topic"` |
| "Deep dive on X" | `bun llm deep "topic"` |
| "Think deep about X" | `bun llm deep "topic"` |
| "What do other models think?" | `bun llm debate "question"` |

**Note**: "deep" refers to OpenAI's deep research mode, NOT DeepSeek. DeepSeek queries are not supported.

## Smart Model Selection

- Automatically uses the **best available** model for each mode
- **Warns** if a better model exists but isn't configured (shows env var to set)
- For `debate`, selects models from **different providers** for diverse perspectives

## Features

- **Auto-recovery**: Automatically recovers interrupted responses before new queries
- **Persistence**: Saves progress to disk during streaming (never lose expensive calls)
- **History check**: Warns if you've researched this before (avoids duplicate spend)
- **Cost confirmation**: Prompts for `deep` and `debate` (expensive)
- **Streaming**: Real-time output
- **Provider warnings**: Shows when better models are available

## Recovery Commands

| Command | What |
|---------|------|
| `bun llm recover` | List incomplete responses |
| `bun llm recover <id>` | Retrieve response by ID from OpenAI |
| `bun llm partials --clean` | Clean up old partial files |

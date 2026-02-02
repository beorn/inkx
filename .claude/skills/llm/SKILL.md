---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, OpenAI, Gemini, Grok, deep, thinkdeep, or wants a second opinion.
argument-hint: [deep|opinion|debate] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep, thinkdeep, second opinion, consensus, research

**Claude: Use this when the user wants another model's perspective or deep research.**

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
| `deep`/`research`/`think` | Web search, citations, thorough | ~$2-5 |
| `opinion` | Second opinion from different provider | ~$0.02 |
| `debate` | 3 models from different providers + synthesis | ~$1-3 |
| `quick`/`cheap`/`mini`/`nano` | Fast/cheap (only if explicitly needed) | ~$0.01 |

## When to Use

| User Says | Action |
|-----------|--------|
| "Ask ChatGPT/GPT about X" | `bun llm "X"` |
| "Get a second opinion" | `bun llm opinion "X"` |
| "Research this topic" | `bun llm deep "topic"` |
| "Deep dive on X" | `bun llm think "topic"` |
| "What do other models think?" | `bun llm debate "question"` |

## Smart Model Selection

- Automatically uses the **best available** model for each mode
- **Warns** if a better model exists but isn't configured (shows env var to set)
- For `debate`, selects models from **different providers** for diverse perspectives

## Features

- **History check**: Warns if you've researched this before (avoids duplicate spend)
- **Cost confirmation**: Prompts for `deep` and `debate` (expensive)
- **Streaming**: Real-time output
- **Provider warnings**: Shows when better models are available

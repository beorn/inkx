---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, Gemini, consensus, or wants a second opinion.
argument-hint: [ask|prepare|research|consensus] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, perplexity, second opinion, consensus, deep research

Run `bun llm` for full help with models and pricing.

## Quick Reference

| Goal | Command |
|------|---------|
| Quick question | `bun llm ask --quick "question"` |
| Standard query | `bun llm ask "question"` |
| Specific model | `bun llm ask --model gpt-5.2 "question"` |
| Refine first | `bun llm prepare "vague question"` |
| Deep research | `bun llm research "topic"` |
| Multi-model | `bun llm consensus "decision"` |
| With history | `bun llm ask --with-history "question"` |

## Common Aliases

Users often say "ChatGPT" when they mean different things:

| User Says | They Mean | Model |
|-----------|-----------|-------|
| "ChatGPT" / "GPT" | Latest GPT | `gpt-5.2` |
| "ChatGPT 5" / "GPT-5" | GPT-5.x series | `gpt-5.2` |
| "ChatGPT deep research" | Deep research agent | `o3-deep-research` |
| "ChatGPT Pro" / "o3 pro" | Max reasoning | `o3` or `gpt-5.2-pro` |

## When to Use

| User Says | Action |
|-----------|--------|
| "Ask ChatGPT about X" | `bun llm ask --model gpt-5.2 "X"` |
| "Ask GPT about X" | `bun llm ask --model gpt-5.2 "X"` |
| "Get a second opinion" | `bun llm ask "X"` |
| "Research this topic" | `bun llm research "topic"` (uses o3-deep-research) |
| "ChatGPT deep research" | `bun llm research "topic"` (uses o3-deep-research) |
| "What do other models think?" | `bun llm consensus "question"` |
| "Deep dive on X" | `bun llm research "X"` (uses o3-deep-research) |

## Cost Tiers

| Tier | Cost | Models | Use For |
|------|------|--------|---------|
| Quick | ~$0.005 | gpt-5-nano, gemini-flash, haiku | Factual questions |
| Standard | ~$0.01-0.02 | gpt-5, claude-sonnet | General queries |
| Powerful | ~$0.02-0.20 | gpt-5.2, gpt-5.2-pro, o3, opus | Complex reasoning |
| Deep Research | ~$2-10 | **o3-deep-research**, o4-mini-deep, perplexity-deep | Web search, citations |

**Note:** "ChatGPT deep research" uses o3/o4 reasoning models, NOT GPT-5.2. These are different model families - GPT-5.2 is the conversational model, while o3-deep-research is the autonomous research agent.

## History Integration

- **`prepare`** automatically checks for similar past queries
- **`--with-history`** includes relevant past context
- **`bun history similar "topic"`** manual check before asking

## PAL MCP (Alternative)

For inline queries without CLI, use PAL tools directly:

| Tool | Use For |
|------|---------|
| `mcp__pal__chat` | Direct model query |
| `mcp__pal__consensus` | Multi-model debate |
| `mcp__pal__thinkdeep` | Multi-stage reasoning |
| `mcp__pal__codereview` | Code review with other model |

## Behavior

1. **Expensive queries (>$0.10)** prompt for confirmation
2. **Stale pricing (>7 days)** shows warning
3. **`prepare`** checks history before refining

## Missing Capabilities

When a provider isn't configured, suggest setup:

| Capability | Requires | Setup |
|------------|----------|-------|
| Deep Research | OpenAI or Perplexity | `export OPENAI_API_KEY=...` |
| Web Search | Perplexity | `export PERPLEXITY_API_KEY=...` |
| Fast/Cheap | Google | `export GOOGLE_GENERATIVE_AI_API_KEY=...` |

Run `bun llm` to see which providers are ready vs missing.

---
description: Query other LLMs for second opinions, research, and consensus
argument-hint: [prompt]
---

# LLM Tool - Multi-Model Queries

**Keywords**: chatgpt, gpt, openai, gemini, grok, perplexity, openrouter, second opinion, consensus, deep research, multi-model

## Activation Keywords

### Model Names (Direct Activation)
- `chatgpt`, `gpt`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.5`, `o3`, `o4`
- `claude`, `claude-sonnet`, `claude-opus`, `claude-haiku`
- `gemini`, `gemini-pro`, `gemini-flash`
- `grok`, `grok-3`
- `perplexity`, `sonar`, `pplx`

### Provider Names
- `openai`, `anthropic`, `google`, `xai`
- `openrouter`, `together`, `fireworks`, `groq`

### Actions (Confirm Before Running - Costs Money)
- `second opinion`, `another perspective`
- `deep research`, `research this`
- `consensus`, `get consensus`, `build consensus`
- `compare models`, `model comparison`
- `ask gpt`, `ask gemini`, `ask grok`
- `what does gpt think`, `what would gemini say`
- `cross-check`, `verify with other models`
- `multi-model`, `multiple models`

### Web Search (Perplexity)
- `search the web`, `web search`
- `look this up`, `look up`
- `find info on`, `find information`
- `search for`

### Code Review
- `review this code with gpt`
- `get code feedback from`
- `code review with another model`

### Thinking Levels
- `quick query`, `fast answer`
- `thorough research`
- `deep dive`

## CLI

```bash
bun vendor/beorn-claude-tools/tools/llm.ts <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `query` | Single model query |
| `consensus` | Get consensus from multiple models |
| `compare` | Compare responses across models |
| `research` | Deep research with web search |

### Options

| Option | Description |
|--------|-------------|
| `--model`, `-m` | Specific model to use |
| `--models` | Comma-separated list of models |
| `--prompt`, `-p` | The prompt/question |
| `--file`, `-f` | File to include as context |
| `--thinking` | Thinking level: quick, thorough, deep |

## Examples

```bash
# Single query
bun vendor/beorn-claude-tools/tools/llm.ts query -m gpt-4o -p "Explain this error"

# Consensus from multiple models
bun vendor/beorn-claude-tools/tools/llm.ts consensus --models "gpt-4o,gemini-pro,grok-3" -p "Best approach for X?"

# Web research with Perplexity
bun vendor/beorn-claude-tools/tools/llm.ts research -m perplexity -p "Latest React 19 features"

# Code review
bun vendor/beorn-claude-tools/tools/llm.ts query -m gpt-4o -f src/file.ts -p "Review this code"
```

## Behavior

1. **Model-specific requests** (e.g., "ask gpt about X"): Execute directly
2. **Generic requests** (e.g., "get a second opinion"): Confirm with user first (costs money)
3. **When no model specified**: Use PAL's `listmodels` tool to show available options

## Cost Awareness

Multi-model queries cost money. For generic triggers like "second opinion" or "consensus", confirm with the user before executing.

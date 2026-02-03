---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, OpenAI, Gemini, Grok, or wants deep research (NOT DeepSeek), thinkdeep, or a second opinion.
argument-hint: [deep|opinion|debate] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep research, thinkdeep, second opinion, consensus, research, ask

**Claude: Use this when the user wants another model's perspective or deep research (OpenAI's research mode, NOT DeepSeek).**

Run `bun llm` for full help.

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

## Context Flags

| Flag | What |
|------|------|
| `--with-history` | Include relevant context from session history |
| `--context <text>` | Provide explicit context (prepended to topic) |
| `--context-file <path>` | Read context from a file |

## When to Use Context

**For codebase questions**: Gather context before calling `bun llm`:

```markdown
### Quick Context Gathering (for /ask, simple questions)
1. Note project type from CLAUDE.md (km: TypeScript/Bun/Ink/SQLite TUI)
2. If discussing code, note current file path
3. Get recent work: `git log --oneline -3`

Prepend to question:
bun llm "Context: km project (TypeScript TUI), working on [file]. Question: [user's question]"
```

**For deep research**: Use 2-3 rounds of Opus context gathering:

```markdown
### Round 1: Understanding
- Read relevant files mentioned in the topic
- Check docs/principles.md for relevant constraints
- Review CLAUDE.md for project context

### Round 2: Framing (~500 words max)
Synthesize:
- Project overview (what km is)
- Relevant architecture (which layers involved)
- Key constraints (patterns to follow, things to avoid)
- Specific questions to answer

### Round 3 (optional): Refinement
For complex topics:
- Add code snippets from existing implementations
- Include similar past decisions (from `bun history`)
- Clarify ambiguous terms

### Execute
bun llm --deep -y --context "[synthesized context]" "[topic]"
```

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

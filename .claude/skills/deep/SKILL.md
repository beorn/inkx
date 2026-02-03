---
description: Deep research using OpenAI's deep research API. Use when user wants thorough research with web search and citations.
argument-hint: <topic>
---

**Keywords**: deep research, thorough research, web search, citations, OpenAI deep

# Deep - OpenAI Deep Research

Thorough research with web search and citations. See `/llm` for full documentation.

## Commands

| Command | What | Cost |
|---------|------|------|
| `/deep <topic>` | Deep research | ~$2-5 |
| `/deep:all <topic>` | Multi-model debate | ~$1-3 |

## Usage

```bash
# Deep research
bun llm --deep -y "<topic>"

# With context
bun llm --deep -y --context "Project context here" "<topic>"

# With session history
bun llm --deep -y --with-history "<topic>"

# Multi-model consensus
bun llm debate -y "<topic>"
```

## Context Gathering (Recommended for Codebase Questions)

For better results on codebase-specific questions:

### Round 1: Understanding
- Read relevant files mentioned in the topic
- Check docs/principles.md for constraints
- Review CLAUDE.md for project context

### Round 2: Framing (~500 words max)
Synthesize:
- Project overview (km: TypeScript/Bun/Ink/SQLite TUI)
- Relevant architecture (which layers involved)
- Key constraints (patterns, things to avoid)
- Specific questions to answer

### Round 3 (optional): Refinement
For complex topics, add:
- Code snippets from existing implementations
- Similar past decisions (from `bun history`)

### Execute
```bash
bun llm --deep -y --context "[synthesized context]" "[topic]"
```

## Auto-Recovery

If a previous deep research call was interrupted:
1. Running `/deep` automatically detects incomplete responses
2. Attempts recovery from OpenAI
3. Displays recovered content
4. Asks if you want to continue with a new query

Use `--no-recover` to skip this check.

## Note

This uses OpenAI's deep research feature (NOT DeepSeek). Includes web search and provides citations.

## See Also

- `/llm` - Full documentation with all options
- `/ask` - Quick questions (~$0.02)

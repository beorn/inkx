---
description: Deep research using OpenAI's deep research API. Use when user wants thorough research with web search and citations.
argument-hint: <topic>
---

**Keywords**: deep research, thorough research, web search, citations, OpenAI deep

# Deep - OpenAI Deep Research (~$2-5)

```bash
bun llm --deep -y "<topic>"
bun llm --deep -y --context "context" "<topic>"
bun llm --deep -y --context-file ./src/module.ts "<topic>"
bun llm --deep -y --with-history "<topic>"
```

See `/llm` for output format, flags, and background execution.

**Note**: This is OpenAI's deep research (NOT DeepSeek). Takes 2-15 minutes; interrupted calls auto-recover.

## Context Gathering (CRITICAL for Code Questions)

**First**: Use `/recall` to search session history for prior work on the topic: `bun recall "topic"`. Read the results, extract relevant insights, and summarize them into `--context` — don't pass raw recall output.

Deep research is powerful for specific code bugs when given **complete source code**. Don't be stingy — include entire files, not snippets.

### What to Include

1. **Full source files** - Not snippets. Include the entire file(s) involved.
2. **Problem description** - Specific symptoms, error messages, reproduction steps
3. **Project context** - Brief overview (TypeScript/Bun/Ink/SQLite TUI)
4. **Specific questions** - What you want feedback on

### Context Size Guidelines

| Type | Guideline |
|------|-----------|
| Bug investigation | Include **full files** involved (2000+ lines OK) |
| Architecture question | Include full files + docs excerpts |
| API design | Include existing similar APIs for comparison |
| Refactoring | Include full before-state code |

**Key insight**: Deep research handles large contexts. The more specific code you provide, the more actionable the response. Vague context = generic advice. Full source = precise fixes.

### Workflow

1. **Gather files** — Read ALL relevant files completely (not excerpts). For bugs, typically 2-5 files.
2. **Build context** — Structure: problem description, architecture overview, **full source code** (labeled), specific questions.
3. **Execute**:

```bash
bun llm --deep -y --context "$(cat << 'EOF'
# Bug: Render mismatch after navigation

## Problem
[specific symptoms]

## Source Code

### VirtualList.tsx (full file)
[paste entire file]

### useVirtualization.ts (full file)
[paste entire file]

## Questions
1. Root cause?
2. Best fix approach?
EOF
)" "Review this rendering bug"
```

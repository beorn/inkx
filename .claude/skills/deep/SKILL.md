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

## Context Gathering (CRITICAL for Code Questions)

Deep research is incredibly powerful for specific code bugs when given **complete source code**. Don't be stingy with context - include entire files, not snippets.

### What to Include

For code bugs and architecture questions, provide:

1. **Full source files** - Not snippets. Include the entire file(s) involved.
2. **Problem description** - Specific symptoms, error messages, reproduction steps
3. **Project context** - Brief overview (TypeScript/Bun/Ink/SQLite TUI)
4. **Key constraints** - Relevant patterns from docs/principles.md
5. **Specific questions** - What you want feedback on

### Example: Bug Investigation

```bash
# Read all relevant files first
# Then build comprehensive context:

bun llm --deep -y --context "$(cat << 'EOF'
# Bug: Incremental vs Fresh Render Mismatch

## Problem
After horizontal navigation (h/l keys), non-selected columns show wrong scroll position.
- Incremental render: shows "Zone 1" (scrolled)
- Fresh render: shows "Health & Fitness" (scroll=0)

## Architecture
Multi-phase render pipeline: measure → layout → scroll → screen → content → output

## Source Code

### VirtualList.tsx (full file - 235 lines)
[paste entire file]

### useVirtualization.ts (full file - 307 lines)
[paste entire file]

### layout-phase.ts (relevant section - scrollPhase)
[paste scrollPhase function and calculateScrollState]

## Questions
1. Is this a fundamental design flaw in scroll state management?
2. Should React fully control scroll offset (always pass explicitly)?
3. Best fix approach?
EOF
)" "Review this incremental rendering bug. Analyze architecture, identify root cause, recommend fix."
```

### Context Size Guidelines

| Type | Guideline |
|------|-----------|
| Bug investigation | Include **full files** involved (2000+ lines OK) |
| Architecture question | Include full files + docs excerpts |
| API design | Include existing similar APIs for comparison |
| Refactoring | Include full before-state code |

**Key insight**: Deep research can handle large contexts. The more specific code you provide, the more specific and actionable the response. Vague context → generic advice. Full source → precise fixes.

### Round 1: Gather Files
- Read ALL relevant files completely (not excerpts)
- Note: for bugs, this typically means 2-5 files
- Check docs/principles.md for constraints

### Round 2: Build Context
Structure:
1. Problem description (symptoms, steps to reproduce)
2. Architecture overview (1-2 paragraphs)
3. **Full source code** (entire files, labeled clearly)
4. Specific questions to answer

### Execute
```bash
bun llm --deep -y --context "[comprehensive context with full source]" "[specific question]"
```

## Background Execution (for agents)

Deep research takes 2-15 minutes. When running from a sub-agent or background task, **use `TaskOutput` with blocking wait** — never poll output files manually with sleep loops.

```
# Launch in background
Task(subagent_type="Bash", run_in_background=true,
     prompt='bun llm --deep -y "topic"')

# Block-wait for result (up to 10 min)
TaskOutput(task_id=<id>, block=true, timeout=600000)
```

See `vendor/beorn-tools/skills/llm/SKILL.md` "Agent Usage" section for full details.

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

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

**CRITICAL — Presenting Results**: Deep research costs $2-5. After it completes, you MUST read the full output file and present a comprehensive report (~40 lines unless it warrants more) — not a brief summary. Preserve code snippets, specific recommendations, trade-offs, and citations. See `/llm` "Output & Presenting Results" for the full protocol.

## Execution Pattern

**IMPORTANT**: Deep research takes 2-15 minutes. Use ONE of these patterns:

### Pattern A: Foreground with long timeout (SIMPLEST, preferred)

```
Bash(command='bun llm --deep -y "topic"', timeout=600000)
```

This blocks for up to 10 minutes. Stdout contains JSON with the output file path. Read the file after.

### Pattern B: Background + do other work

```
# Step 1: Launch
Bash(command='bun llm --deep -y "topic"', run_in_background=true)
# Returns task_id

# Step 2: Do other work while waiting...

# Step 3: Retrieve (blocks up to 10 min)
TaskOutput(task_id=<id>, block=true, timeout=600000)
# Parse JSON from stdout, read the output file
```

### Anti-patterns (NEVER do these)

```
# BAD: --output - streams to stdout — unretrievable from background tasks
bun llm --deep --output - "topic"

# BAD: Sleep-polling wastes turns and gets killed
Bash("sleep 30 && wc -c output.txt")  # 5 turns of sleeping = killed
Bash("sleep 60 && wc -c output.txt")

# BAD: Subagent without skill context — agent won't know the correct pattern
Task(subagent_type="general-purpose", prompt="run deep research on X")
```

**If running from a subagent/Task**: Use Pattern A (foreground with `timeout=600000`). Subagents don't have skill context, so keep it simple.

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

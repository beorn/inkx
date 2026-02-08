---
description: Queries other LLMs for second opinions and research. Use when user mentions GPT, ChatGPT, OpenAI, Gemini, Grok, or wants deep research (NOT DeepSeek), thinkdeep, or a second opinion.
argument-hint: [deep|opinion|debate] <prompt>
---

# LLM - Multi-Model Queries

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep research, thinkdeep, second opinion, consensus, research, ask

**Claude: Use this when the user wants another model's perspective or deep research (OpenAI's research mode, NOT DeepSeek).**

**In the same response where you call `bun llm`, include a summary for the user.** The user can't easily read the prompt from the command output. Write your summary text and make the tool call together — don't use a separate turn. Cover:

- **Question/topic**: What you're actually asking, in enough detail that the user could judge whether it's the right question
- **Motivation**: What you're trying to learn or decide, and how it connects to the task at hand
- **Context included**: Which files, code snippets, session history, or other material you're sending — with sizes or line counts so the user knows the scope
- **Mode and rationale**: Which mode (ask, opinion, deep, debate) and a brief why

The JSON output also includes a `query` field with the raw question, but the summary should be more readable than the raw prompt.

Example:

> Asking GPT to evaluate two refactoring approaches for `syncEngine.ts`:
> - **Option A**: Orchestrator + phase helpers (split the 3 sequential concerns into `resolveConflicts()`, `applyMutations()`, `broadcastChanges()`)
> - **Option B**: Strategy pattern with a `SyncStrategy` interface for each sync mode (full, incremental, selective)
>
> Including `syncEngine.ts` (200 lines), the three mutation functions it calls from `mutations.ts` (80 lines), and the `SyncMode` type definition.
> Using `opinion` mode — we're leaning toward Option A but want a sanity check before committing to the refactor.

Run `bun llm` for full help.

## Output & Presenting Results

By default, the response is written to a file and the file path is printed to stdout (as JSON). Stale files are auto-cleaned after 7 days.

**WARNING**: Do NOT use `--output -` — it streams to stdout which is unretrievable from background tasks and causes agents to lose the output. Always use the default file output.

**CRITICAL: After the LLM responds, you MUST read the output file and present a comprehensive report to the user.** Don't reduce a detailed response to a brief summary — the user wants to see what the other model said.

### How to Present Results

1. **Read the full output file** using `Read` (use `offset`/`limit` for very large files).
2. **Present a report capped at ~40 lines** that covers all major points. Structure as:
   - **Key findings/answers** — the substance, with specifics (code patterns, numbers, trade-offs)
   - **Recommendations** — what the LLM suggests, in priority order
   - **Notable insights** — anything surprising or that adds perspective
   - **Citations/sources** — if deep research, include the most relevant URLs
3. **Preserve technical detail** — include code snippets, function names, concrete numbers. Don't reduce "use a shared queue with background pump" to "batch events."
4. **Short responses** (`/ask`): present nearly verbatim. **Long responses** (`/deep`): distill to ~40 lines, preserving all key points and specifics — cut repetition and filler, not substance.
5. **Always show the output file path** at the end of your report so the user can click it to read the full response.
6. Do NOT silently read the file and move on without reporting. Do NOT say "it recommends X" without the reasoning.

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
| ~~`--output -`~~ | **DEPRECATED** — Do NOT use. Breaks background tasks. Use default file output. | — |

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

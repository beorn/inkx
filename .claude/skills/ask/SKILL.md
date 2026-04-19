---
description: "Ask other LLMs — questions, pro reviews, deep research, second opinions. Entry points: /ask, /pro, /deep."
argument-hint: "[question]"
---

# Ask — Multi-Model Queries

## Model Freshness

Models evolve fast. Re-check available models every 2 weeks:
- Run: `bun llm --list` to see current models
- Check leaderboards: whatllm.org, vellum.ai/llm-leaderboard, artificialanalysis.ai
- Update types.ts with new models, remove deprecated ones
- Last updated: 2026-04-03

**Keywords**: gpt, chatgpt, openai, gemini, grok, deep research, thinkdeep, second opinion, consensus, research, ask, quick question, fast answer, LLM query

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

Response is ALWAYS written to a file. The file path is printed on stderr both as human-readable text (`Output written to: <path>`) and as JSON metadata. Stale files are auto-cleaned after 7 days. Nothing goes to stdout.

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
| Pro review/analysis | `bun llm pro "question"` |
| Pro with context file | `bun llm pro --context-file /tmp/ctx.md -y "question"` |
| Deep research | `bun llm --deep -y "topic"` |
| Deep research with Pro | `bun llm --deep --model gpt-5.4-pro -y "topic"` |
| With context | `bun llm --deep -y --context "context" "topic"` |
| With history | `bun llm --deep -y --with-history "topic"` |
| Second opinion | `bun llm opinion "question"` |
| Multi-model debate | `bun llm debate -y "question"` |

## Shortcuts

| Shortcut | Equivalent |
|----------|------------|
| `/ask <question>` | `bun llm --ask "<question>"` |
| `/ask:pro <question>` | `bun llm pro "<question>"` |
| `/deep <topic>` | `bun llm --deep -y "<topic>"` |
| `/deep pro <topic>` | `bun llm --deep --model gpt-5.4-pro -y "<topic>"` |
| `/ask:all <question>` | `bun llm debate -y "<question>"` |
| `/deep:all <topic>` | `bun llm debate -y "<topic>"` |

## Keywords (aliases)

| Keyword | What | Cost |
|---------|------|------|
| *(none)* | Best available model (gpt-5.4 preferred) | ~$0.02 |
| `pro` | Pro model (gpt-5.4-pro) — deep code reviews, thorough analysis | ~$5-15 |
| `opinion` | Second opinion from different provider | ~$0.02 |
| `debate` | 3 models from different providers + synthesis | ~$1-3 |
| `quick`/`cheap`/`mini`/`nano` | Fast/cheap (only if explicitly needed) | ~$0.01 |

**WARNING**: Keywords (`pro`, `opinion`, etc.) do NOT work with `--deep` — they get absorbed
into the topic text. To combine deep research with a specific model, use `--model`:
```bash
bun llm --deep --model gpt-5.4-pro -y "topic"   # Correct: deep + pro
bun llm --deep pro -y "topic"                     # WRONG: "pro" becomes part of topic
```

## Flags

| Flag | What | Cost |
|------|------|------|
| `--deep`/`/deep` | OpenAI deep research (web search, citations, thorough) | ~$2-5 |
| `--ask`/`/ask` | Explicit default mode (syntactic sugar) | ~$0.02 |
| `--image <path>` | Send a screenshot/image to vision models (cloud or local) | varies |
| `--model <id>` | Use specific model — cloud or local (see below) | varies |

## Image / Vision

Send screenshots directly to multimodal models:

```bash
# Cloud vision (GPT-5.4 vision)
bun llm --image screenshot.png "Describe this UI"

# Local vision (ollama, free)
bun llm --model ollama:llava:7b --image screenshot.png "What issues do you see?"

# Design review with structured output
bun llm --image screenshot.png "Review this UI for: alignment, spacing, typography, contrast. Output JSON."
```

Supports PNG, JPG, WebP. Image is sent as base64 to cloud APIs or via ollama's `images` field for local models.

## Local Models (Ollama)

Run models locally — free, instant, private. Requires `ollama` installed and running.

```bash
# List available local models
bun llm list-models

# Pull a model (one-time download)
ollama pull llava:7b           # 4.7GB, general vision
ollama pull llava:34b          # ~20GB, higher quality
ollama pull mistral:7b         # Text-only, fast
ollama pull qwen2.5:72b        # Text-only, best local quality (M5 Max 128GB can handle)

# Use local model
bun llm --model ollama:llava:7b "question"
bun llm --model ollama:mistral:7b "question"
```

**Model syntax**: `ollama:<model-name>` — model name matches what `ollama list` shows.

**When to use local vs cloud**:
| Use case | Recommendation |
|---|---|
| Quick questions, iteration | Local (instant, free) |
| Vision/screenshot analysis | Local first, cloud for subtle issues |
| Deep research (web search) | Cloud only (`--deep`) |
| Pro code review ($5-15) | Cloud only (`pro`) |
| Privacy-sensitive content | Local only |
| 70B+ quality | Local if M5 Max 128GB, otherwise cloud |

## Context Flags

| Flag | What |
|------|------|
| `--with-history` | Include relevant context from session history |
| `--context <text>` | Provide explicit context (prepended to topic) |
| `--context-file <path>` | Read context from a file |

## Gathering Context

### MANDATORY: Silvery Positioning Brief

Every external LLM call (`/ask`, `/pro`, `/deep`, `/llm`) MUST include the silvery positioning brief — either via `--context-file docs/silvery-positioning-brief.md` OR by pasting this paragraph into the prompt preamble:

> **Silvery is a multi-target UI framework with web ambitions** — NOT "Ink but better," NOT terminal-only. Terminal is the primary shipped target today; canvas + DOM are explicit future targets. The design system is built cross-platform-first. Design trade-offs default to Polaris/Tailwind-aligned answers over TUI idioms. Hover/click/focus are first-class interactions. km is silvery's lead showcase app (terminal-first knowledge-worker tool); silvery ships what km needs AND what a multi-target framework requires.

Without this brief, external LLMs default to advising as a "TUI library author" which misses the multi-target design intent. Always include it. For quick questions the single paragraph is enough; for deep research attach the full file.

### Session context

Before calling `bun llm`, use `/recall` to search session history for relevant prior work: `bun recall "topic"`. Read the results, extract the relevant insights, and summarize them into `--context` — don't pass raw recall output directly.

**Quick questions**: Prepend the positioning brief + task context:
```
bun llm "Context: silvery is a multi-target (terminal + web + canvas) UI framework with web ambitions — NOT a TUI library; design decisions favor cross-platform/Polaris conventions. [rest of context]. Question: [q]"
```

**Deep research**: Include **full source code** AND `--context-file docs/silvery-positioning-brief.md` — see `/deep` for detailed context gathering workflow.

## Execution

**Deep research is fire-and-forget.** The command fires the request, prints the response ID, and exits immediately (~5s). No poll loop, no background tasks needed.

```bash
# Deep research — run normally (NOT in background), exits in ~5s
bun llm --deep -y "topic"
# → prints: Response ID: resp_abc123... (recoverable with 'bun llm recover')
# → exits immediately

# Recover result later (15-30 min):
bun llm recover resp_abc123...

# Quick question — foreground, completes in seconds
bun llm "question"
```

**Do NOT** run `bun llm --deep` with `run_in_background=true` — the output pipe truncates and you lose the response ID. Just run it normally; it exits in ~5s.

If you forgot the response ID: `bun llm recover` lists all partial responses.

## Recovery (CRITICAL)

Deep research runs **server-side at OpenAI**. If the local process is killed (Escape, timeout,
crash), the research **continues and completes remotely**.

**NEVER restart after interruption** — it wastes $2-5 and 15 minutes. Instead, recover:

```bash
bun llm recover              # List incomplete responses (shows IDs + status)
bun llm recover <id>         # Retrieve completed response by ID
```

If the response isn't ready yet, wait a few minutes and try `recover` again. Recovery writes the
output file just like a normal completion — read it with the `Read` tool.

## Pro Reviews: Do Your Own Review First

Before sending code to GPT 5.4 Pro ($5-15 per call), **always do your own thorough review first**:

1. **Read the code yourself** — use your 200K context window to hold entire packages
2. **Run `/code clean` dry-run** — find DRY violations, complexity hotspots, consistency issues
3. **Fix what you find** — don't pay Pro to tell you about obvious issues
4. **Then send cleaned code to Pro** — Pro's value is finding what you missed: subtle correctness bugs, architectural insights, edge cases

This maximizes Pro's value: instead of $15 of "extract this duplicated code" advice, you get $15 of deep analysis.

## When to Use

| User Says | Action |
|-----------|--------|
| "Ask ChatGPT/GPT about X" | `bun llm "X"` |
| "Pro review of X" | `bun llm pro --context-file /tmp/ctx.md -y "X"` |
| "Get a second opinion" | `bun llm opinion "X"` |
| "Research this topic" | `bun llm --deep -y "topic"` |
| "Deep dive on X" | `bun llm --deep -y "topic"` |
| "Think deep about X" | `bun llm --deep -y "topic"` |
| "/deep pro X" | `bun llm --deep --model gpt-5.4-pro -y "topic"` |
| "What do other models think?" | `bun llm debate -y "question"` |

**Note**: "deep" refers to OpenAI's deep research mode, NOT DeepSeek. DeepSeek queries are not supported.

## Recovery Commands

| Command | What |
|---------|------|
| `bun llm recover` | List incomplete responses |
| `bun llm recover <id>` | Retrieve response by ID from OpenAI |
| `bun llm partials --clean` | Clean up old partial files |

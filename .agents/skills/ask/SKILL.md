---
description: "Single-model quick questions to other LLMs — fast, cheap (~$0.02). Use for one-off second opinions and prior-art lookups. For multi-model judging use /pro. For web-search research use /deep."
argument-hint: "[question]"
---

# /ask — single-model quick questions (~$0.02)

**Keywords**: gpt, chatgpt, openai, gemini, grok, ask, second opinion, quick

One model, one answer, fast and cheap. Use this when you want a quick external opinion or prior-art lookup. **Don't use `/ask` for hard problems where you want models to disagree** — that's `/pro` (~$0.20, 3-leg + judge). **Don't use `/ask` for research with citations** — that's `/deep` (~$2-5, web search).

## Decision table

| User says | Command | Cost |
|-----------|---------|------|
| `/ask "<question>"` | `bun llm "<question>"` | ~$0.02 |
| `/ask:opinion <q>` or "second opinion" | `bun llm opinion "<q>"` | ~$0.02 |
| `/ask:all <q>` or `debate <q>` | `bun llm debate -y "<q>"` (3 models + synthesis) | ~$1-3 |
| `/ask:pro <q>` or "pro review" | escalate to `/pro` (3-leg + judge) | ~$0.20 |
| `/deep <topic>` | escalate to `/deep` (web search + citations) | ~$2-5 |
| Image analysis | `bun llm --image <path> "<q>"` | varies |
| Local model | `bun llm --model ollama:<name> "<q>"` | free |

## Keywords

| Keyword | What | Cost |
|---------|------|------|
| *(none)* | Best available cloud model | ~$0.02 |
| `pro` | Escalates to `/pro` (3-leg dispatch + judge — see [/pro](../pro/SKILL.md)) | ~$0.20 |
| `opinion` | Second opinion from a different provider | ~$0.02 |
| `debate` | 3 models from different providers + synthesis | ~$1-3 |
| `quick`/`cheap`/`mini`/`nano` | Fast/cheap (only when needed) | ~$0.01 |

**WARNING**: keywords (`pro`, `opinion`, `debate`) do NOT work with `--deep` — they're absorbed into the topic. Use `--model <id>` instead: `bun llm --deep --model gpt-5.4-pro -y "<topic>"`.

## Flags

| Flag | What |
|------|------|
| `--deep` | OpenAI deep research (web search, citations) |
| `--ask` | Explicit default mode |
| `--image <path>` | Send screenshot/image to a vision model |
| `--model <id>` | Specific cloud or local model (`ollama:<name>` for local) |
| `--with-history` | Include relevant context from session history |
| `--context <text>` | Inline context (avoid for source code — use `--context-file`) |
| `--context-file <path>` | Read context from a file (use this for source code) |
| `-y` | Skip confirmation |
| `--no-recover` | Force fresh call, ignore prior responses |

## MANDATORY: silvery positioning brief

Every external LLM call MUST include the silvery positioning brief — either via `--context-file docs/silvery-positioning-brief.md` OR by pasting this into the prompt preamble:

> Silvery is a multi-target UI framework with web ambitions — NOT "Ink but better," NOT terminal-only. Terminal is the primary shipped target today; canvas + DOM are explicit future targets. Design system is cross-platform-first; trade-offs default to Polaris/Tailwind-aligned answers over TUI idioms. Hover/click/focus are first-class. km is silvery's lead showcase app; silvery ships what km needs AND what a multi-target framework requires.

Without this brief, external LLMs default to advising as "TUI library author" — which misses the design intent.

## In-response summary

In the same response where you call `bun llm`, include a brief summary so the user can judge the call:
- Question/topic (in enough detail to evaluate)
- Motivation (what you're trying to learn)
- Context included (files, sizes)
- Mode + rationale (`ask` / `opinion` / `debate` / `pro` / `deep`, and why)

## Presenting results

Output is always written to a file (path printed on stderr). After the call completes:

1. Read the full output file with `Read`.
2. Present a ~40-line report (more if warranted): key findings → recommendations → notable insights → citations.
3. Preserve code snippets, function names, concrete numbers — don't reduce "use a shared queue with background pump" to "batch events."
4. Show the output file path at the end so the user can click through to the full response.

Short responses (`/ask`): present nearly verbatim. Long responses (`/deep`): distill — cut repetition, not substance.

## Recovery

```bash
bun llm recover              # List incomplete responses
bun llm recover <id>         # Retrieve completed response
bun llm await <id>           # Silent block, prints file path on success
bun llm partials --clean     # Clean up old partial files
```

Stale output files auto-clean after 7 days. **Never restart an interrupted `--deep` call** — it continues server-side at OpenAI.

## Anti-patterns

- `run_in_background=true` for deep research — output pipe truncates, response ID lost.
- `--context "$(cat ...)"` for source code — backticks/quotes break the heredoc.
- Skipping the positioning brief on silvery questions.
- Sending `/pro` raw, unreviewed code — read it yourself first (200K context fits a package); fix DRY/complexity issues so the 3 models' time is spent on real insight, not "extract this duplicated code."
